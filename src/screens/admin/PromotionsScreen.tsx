import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../services/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

type TargetAudience = 'all' | 'inactive';
type SendTiming = 'now' | 'schedule';

type PromotionDoc = {
  id: string;
  title: string;
  message: string;
  discount: number | null;
  targetAudience: TargetAudience;
  scheduledAt: { toDate: () => Date } | null;
  sent: boolean;
  sentCount: number;
  sentAt: { toDate: () => Date } | null;
  createdAt: { toDate: () => Date } | null;
};

type FormState = {
  title: string;
  message: string;
  discount: string;
  targetAudience: TargetAudience;
  sendTiming: SendTiming;
  scheduledDate: string;
  scheduledTime: string;
};

type FormErrors = Partial<Record<keyof FormState | 'schedule', string>>;

const DEFAULT_FORM: FormState = {
  title: '',
  message: '',
  discount: '',
  targetAudience: 'all',
  sendTiming: 'now',
  scheduledDate: '',
  scheduledTime: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSentDate(ts: PromotionDoc['sentAt'] | PromotionDoc['createdAt']): string {
  if (!ts) return '';
  try {
    return ts.toDate().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function parseScheduled(date: string, time: string): Timestamp | null {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const timeRe = /^\d{2}:\d{2}$/;
  if (!dateRe.test(date) || !timeRe.test(time)) return null;
  const d = new Date(`${date}T${time}:00`);
  if (isNaN(d.getTime()) || d <= new Date()) return null;
  return Timestamp.fromDate(d);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onHide }: { message: string; onHide: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 12 }),
      Animated.delay(2800),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(onHide);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });

  return (
    <Animated.View style={[toastStyles.wrap, { opacity: anim, transform: [{ translateY }] }]}>
      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
      <Text style={toastStyles.text}>{message}</Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    left: 24,
    right: 24,
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 999,
  },
  text: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flex: 1 },
});

// ── NotificationPreview ───────────────────────────────────────────────────────

function NotificationPreview({ title, message }: { title: string; message: string }) {
  return (
    <View style={previewStyles.phone}>
      <View style={previewStyles.notch} />
      <View style={previewStyles.banner}>
        <View style={previewStyles.appIcon}>
          <Text style={previewStyles.appIconText}>PC</Text>
        </View>
        <View style={previewStyles.bannerText}>
          <Text style={previewStyles.bannerTitle} numberOfLines={1}>
            {title || 'Notification title'}
          </Text>
          <Text style={previewStyles.bannerMsg} numberOfLines={2}>
            {message || 'Your message preview will appear here…'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const previewStyles = StyleSheet.create({
  phone: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 14,
    marginTop: 4,
  },
  notch: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  banner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  appIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconText: { color: '#E94560', fontSize: 11, fontWeight: '800' },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A2E', marginBottom: 2 },
  bannerMsg: { fontSize: 12, color: '#6B7280', lineHeight: 16 },
});

// ── PromotionsScreen ──────────────────────────────────────────────────────────

export function PromotionsScreen() {
  const [promotions, setPromotions] = useState<PromotionDoc[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modal slide animation
  const slideAnim = useRef(new Animated.Value(800)).current;

  // ── Live promotions list ─────────────────────────────────────────────────

  useEffect(() => {
    const q = query(collection(db, 'promotions'));
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title ?? '',
          message: d.data().message ?? '',
          discount: d.data().discount ?? null,
          targetAudience: (d.data().targetAudience as TargetAudience) ?? 'all',
          scheduledAt: d.data().scheduledAt ?? null,
          sent: d.data().sent ?? false,
          sentCount: d.data().sentCount ?? 0,
          sentAt: d.data().sentAt ?? null,
          createdAt: d.data().createdAt ?? null,
        }));
        docs.sort((a, b) => {
          const aMs = a.createdAt?.toDate().getTime() ?? 0;
          const bMs = b.createdAt?.toDate().getTime() ?? 0;
          return bMs - aMs;
        });
        setPromotions(docs);
        setLoadingList(false);
      },
      () => setLoadingList(false),
    );
  }, []);

  // ── Modal open/close ─────────────────────────────────────────────────────

  const openModal = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setSubmitting(false);
    slideAnim.setValue(800);
    setShowModal(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 12,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(slideAnim, { toValue: 800, duration: 280, useNativeDriver: true }).start(
      () => setShowModal(false),
    );
  };

  // ── Form helpers ─────────────────────────────────────────────────────────

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.title.trim()) errs.title = 'Title is required.';
    if (!form.message.trim()) errs.message = 'Message is required.';
    if (form.sendTiming === 'schedule') {
      const ts = parseScheduled(form.scheduledDate, form.scheduledTime);
      if (!ts) errs.schedule = 'Enter a valid future date (YYYY-MM-DD) and time (HH:MM).';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const scheduledTs =
      form.sendTiming === 'schedule'
        ? parseScheduled(form.scheduledDate, form.scheduledTime)
        : null;

    try {
      const promotionRef = await addDoc(collection(db, 'promotions'), {
        title: form.title.trim(),
        message: form.message.trim(),
        discount: form.discount.trim() ? parseFloat(form.discount) : null,
        targetAudience: form.targetAudience,
        scheduledAt: scheduledTs,
        sent: false,
        sentCount: 0,
        createdAt: serverTimestamp(),
      });

      if (form.sendTiming === 'schedule') {
        closeModal();
        setToastMsg('Promotion scheduled!');
        setSubmitting(false);
        return;
      }

      // Wait for Cloud Function to mark sent (up to 12s)
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          unsub();
          closeModal();
          setToastMsg('Promotion is sending…');
          setSubmitting(false);
        }
      }, 12000);

      const unsub = onSnapshot(doc(db, 'promotions', promotionRef.id), (snap) => {
        const d = snap.data();
        if (d?.sent === true && !settled) {
          settled = true;
          clearTimeout(timeout);
          unsub();
          closeModal();
          setToastMsg(`Promotion sent to ${d.sentCount} customer${d.sentCount !== 1 ? 's' : ''}!`);
          setSubmitting(false);
        }
      });
    } catch {
      setErrors({ title: 'Failed to send. Please try again.' });
      setSubmitting(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = (promo: PromotionDoc) => {
    Alert.alert(
      'Delete Promotion',
      `Delete "${promo.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDoc(doc(db, 'promotions', promo.id)).catch(() => undefined),
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Create button */}
        <TouchableOpacity style={styles.addButton} onPress={openModal} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Create Promotion</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Active Promotions</Text>

        {loadingList ? (
          <ActivityIndicator color="#E94560" style={styles.loader} />
        ) : promotions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No promotions yet</Text>
            <Text style={styles.emptySub}>Tap "Create Promotion" to add your first offer</Text>
          </View>
        ) : (
          promotions.map((p) => (
            <View key={p.id} style={styles.promoCard}>
              {/* Card header */}
              <View style={styles.promoCardTop}>
                <View style={styles.promoInfo}>
                  <Text style={styles.promoTitle} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.promoMessage} numberOfLines={2}>{p.message}</Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Footer chips */}
              <View style={styles.promoFooter}>
                {p.sent ? (
                  <>
                    <View style={styles.chip}>
                      <Ionicons name="checkmark-circle" size={12} color="#059669" />
                      <Text style={[styles.chipText, { color: '#059669' }]}>
                        {p.sentCount} sent
                      </Text>
                    </View>
                    {p.sentAt && (
                      <Text style={styles.promoDate}>{formatSentDate(p.sentAt)}</Text>
                    )}
                  </>
                ) : p.scheduledAt ? (
                  <View style={styles.chip}>
                    <Ionicons name="time-outline" size={12} color="#D97706" />
                    <Text style={[styles.chipText, { color: '#D97706' }]}>
                      Scheduled {formatSentDate(p.scheduledAt)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.chip}>
                    <ActivityIndicator size="small" color="#E94560" style={{ transform: [{ scale: 0.6 }] }} />
                    <Text style={[styles.chipText, { color: '#E94560' }]}>Sending…</Text>
                  </View>
                )}
                {p.discount !== null && (
                  <View style={[styles.chip, styles.chipAccent]}>
                    <Text style={[styles.chipText, { color: '#E94560' }]}>{p.discount}% off</Text>
                  </View>
                )}
                <View style={[styles.chip, styles.chipGray]}>
                  <Text style={styles.chipText}>
                    {p.targetAudience === 'all' ? 'All customers' : 'Inactive 30d+'}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Create Promotion Modal ───────────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="none" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={closeModal}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={submitting}
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Create Promotion</Text>
              <View style={{ width: 22 }} />
            </View>

            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* ── Title ──────────────────────────────────────────── */}
                <View style={styles.fieldWrap}>
                  <View style={styles.fieldLabelRow}>
                    <Text style={styles.fieldLabel}>Title *</Text>
                    <Text style={[styles.charCount, form.title.length > 50 && styles.charCountWarn]}>
                      {form.title.length}/60
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.input, errors.title && styles.inputError]}
                    value={form.title}
                    onChangeText={(v) => setField('title', v.slice(0, 60))}
                    placeholder="e.g. Summer Special — 20% Off!"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="sentences"
                    returnKeyType="next"
                  />
                  {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
                </View>

                {/* ── Message ────────────────────────────────────────── */}
                <View style={styles.fieldWrap}>
                  <View style={styles.fieldLabelRow}>
                    <Text style={styles.fieldLabel}>Message *</Text>
                    <Text style={[styles.charCount, form.message.length > 140 && styles.charCountWarn]}>
                      {form.message.length}/160
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.textArea, errors.message && styles.inputError]}
                    value={form.message}
                    onChangeText={(v) => setField('message', v.slice(0, 160))}
                    placeholder="Book your detail this month and save big!"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    autoCapitalize="sentences"
                  />
                  {errors.message && <Text style={styles.errorText}>{errors.message}</Text>}
                </View>

                {/* ── Discount ───────────────────────────────────────── */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Discount % <Text style={styles.optional}>(optional)</Text></Text>
                  <View style={styles.suffixWrap}>
                    <TextInput
                      style={styles.suffixInput}
                      value={form.discount}
                      onChangeText={(v) => setField('discount', v)}
                      placeholder="20"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                    <Text style={styles.suffix}>%</Text>
                  </View>
                </View>

                {/* ── Target Audience ────────────────────────────────── */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Target Audience</Text>
                  <View style={styles.segmentRow}>
                    {([
                      { key: 'all', label: 'All Customers', icon: 'people-outline' },
                      { key: 'inactive', label: 'Inactive 30+ days', icon: 'moon-outline' },
                    ] as { key: TargetAudience; label: string; icon: string }[]).map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.audienceCard,
                          form.targetAudience === opt.key && styles.audienceCardActive,
                        ]}
                        onPress={() => setField('targetAudience', opt.key)}
                        activeOpacity={0.75}
                      >
                        <Ionicons
                          name={opt.icon as React.ComponentProps<typeof Ionicons>['name']}
                          size={20}
                          color={form.targetAudience === opt.key ? '#E94560' : '#9CA3AF'}
                        />
                        <Text
                          style={[
                            styles.audienceCardText,
                            form.targetAudience === opt.key && styles.audienceCardTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* ── Send Timing ────────────────────────────────────── */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Send Timing</Text>
                  <View style={styles.segmentRow}>
                    {([
                      { key: 'now', label: 'Send Now', icon: 'send-outline' },
                      { key: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
                    ] as { key: SendTiming; label: string; icon: string }[]).map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.audienceCard,
                          form.sendTiming === opt.key && styles.audienceCardActive,
                        ]}
                        onPress={() => setField('sendTiming', opt.key)}
                        activeOpacity={0.75}
                      >
                        <Ionicons
                          name={opt.icon as React.ComponentProps<typeof Ionicons>['name']}
                          size={20}
                          color={form.sendTiming === opt.key ? '#E94560' : '#9CA3AF'}
                        />
                        <Text
                          style={[
                            styles.audienceCardText,
                            form.sendTiming === opt.key && styles.audienceCardTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* ── Schedule date/time ──────────────────────────────── */}
                {form.sendTiming === 'schedule' && (
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Date & Time</Text>
                    <View style={styles.scheduleRow}>
                      <TextInput
                        style={[styles.input, styles.scheduleDateInput, errors.schedule && styles.inputError]}
                        value={form.scheduledDate}
                        onChangeText={(v) => setField('scheduledDate', v)}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numbers-and-punctuation"
                        returnKeyType="next"
                        maxLength={10}
                      />
                      <TextInput
                        style={[styles.input, styles.scheduleTimeInput, errors.schedule && styles.inputError]}
                        value={form.scheduledTime}
                        onChangeText={(v) => setField('scheduledTime', v)}
                        placeholder="HH:MM"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numbers-and-punctuation"
                        returnKeyType="done"
                        maxLength={5}
                      />
                    </View>
                    {errors.schedule && <Text style={styles.errorText}>{errors.schedule}</Text>}
                  </View>
                )}

                {/* ── Preview ────────────────────────────────────────── */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Preview</Text>
                  <NotificationPreview title={form.title} message={form.message} />
                </View>

                {/* ── Submit ─────────────────────────────────────────── */}
                <TouchableOpacity
                  style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name={form.sendTiming === 'now' ? 'send' : 'calendar'}
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.submitBtnText}>
                        {form.sendTiming === 'now' ? 'Send Promotion' : 'Schedule Promotion'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </Modal>

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      {toastMsg && <Toast message={toastMsg} onHide={() => setToastMsg(null)} />}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 40 },
  loader: { marginTop: 40 },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E94560',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 24,
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
  emptySub: { fontSize: 13, color: '#D1D5DB', textAlign: 'center' },

  // ── Promo card ─────────────────────────────────────────────────────────────
  promoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  promoCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 10,
  },
  promoInfo: { flex: 1 },
  promoTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  promoMessage: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  deleteBtn: { padding: 4 },
  promoFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipAccent: { backgroundColor: '#FFF1F3' },
  chipGray: { backgroundColor: '#F3F4F6' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  promoDate: { fontSize: 11, color: '#9CA3AF', marginLeft: 4 },

  // ── Modal ──────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '95%',
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },

  // ── Form ───────────────────────────────────────────────────────────────────
  formContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  fieldWrap: { marginBottom: 20 },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  optional: { fontWeight: '400', color: '#9CA3AF' },
  charCount: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  charCountWarn: { color: '#DC2626' },

  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#1A1A2E',
  },
  inputError: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  textArea: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  errorText: { fontSize: 12, color: '#DC2626', marginTop: 4 },

  suffixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  suffixInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#1A1A2E',
  },
  suffix: { paddingRight: 14, fontSize: 15, fontWeight: '600', color: '#6B7280' },

  segmentRow: { flexDirection: 'row', gap: 10 },
  audienceCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  audienceCardActive: { borderColor: '#E94560', backgroundColor: '#FFF1F3' },
  audienceCardText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', textAlign: 'center' },
  audienceCardTextActive: { color: '#E94560' },

  scheduleRow: { flexDirection: 'row', gap: 10 },
  scheduleDateInput: { flex: 2 },
  scheduleTimeInput: { flex: 1 },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E94560',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
