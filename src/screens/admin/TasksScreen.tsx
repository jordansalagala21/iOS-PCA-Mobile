import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

type ApptStatus = 'pending' | 'in-progress' | 'completed';

type ApptDoc = {
  id: string;
  customerId: string;
  customerName: string;
  serviceName: string;
  vehicleDetails: string;
  vehicleColor?: string;
  timeSlot: string;
  date: string;
  type: 'one-time' | 'biweekly';
  status: ApptStatus;
  estimatedPrice: number;
  actualCharge: number | null;
  adminNotes?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<ApptStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#6B7280', bg: '#F3F4F6' },
  'in-progress': { label: 'In Progress', color: '#D97706', bg: '#FEF3C7' },
  completed: { label: 'Completed', color: '#059669', bg: '#D1FAE5' },
};

const STATUS_ORDER: ApptStatus[] = ['pending', 'in-progress', 'completed'];

const AVATAR_COLORS = ['#E94560', '#4F46E5', '#059669', '#D97706', '#7C3AED', '#0891B2'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(t: string): string {
  const h = parseInt(t.split(':')[0], 10);
  if (h === 12) return '12:00 PM';
  if (h > 12) return `${h - 12}:00 PM`;
  return `${h}:00 AM`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] ?? '?').toUpperCase();
}

function avatarBg(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

// ── TasksScreen ───────────────────────────────────────────────────────────────

export function TasksScreen() {
  const today = new Date().toISOString().split('T')[0];

  const [appointments, setAppointments] = useState<ApptDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Sheet state
  const [editingAppt, setEditingAppt] = useState<ApptDoc | null>(null);
  const [formStatus, setFormStatus] = useState<ApptStatus>('pending');
  const [formCharge, setFormCharge] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Animation
  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // ── Firestore subscription ────────────────────────────────────────────────

  useEffect(() => {
    const q = query(collection(db, 'appointments'), where('date', '==', today));
    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ApptDoc)
          .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
        setAppointments(data);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [today]);

  // ── Animate sheet in when an appointment is queued ────────────────────────

  useEffect(() => {
    if (!editingAppt) return;
    slideAnim.setValue(600);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAppt]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openEdit = (appt: ApptDoc) => {
    setFormStatus(appt.status);
    setFormCharge(appt.actualCharge !== null ? String(appt.actualCharge) : '');
    setFormNotes(appt.adminNotes ?? '');
    setChargeError(null);
    setSaving(false);
    setEditingAppt(appt);
  };

  const closeEdit = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setEditingAppt(null));
  };

  const handleSave = async () => {
    if (formStatus === 'completed') {
      const v = parseFloat(formCharge);
      if (!formCharge.trim() || isNaN(v) || v < 0) {
        setChargeError('Enter the final charge for this job.');
        return;
      }
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'appointments', editingAppt!.id), {
        status: formStatus,
        actualCharge: formStatus === 'completed' ? parseFloat(formCharge) : null,
        adminNotes: formNotes.trim() || null,
        updatedAt: serverTimestamp(),
      });
      closeEdit();
    } catch {
      setChargeError('Failed to save. Please try again.');
      setSaving(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const activeJobs = appointments.filter(
    (a) => a.status === 'pending' || a.status === 'in-progress',
  );
  const completedToday = appointments.filter((a) => a.status === 'completed');
  const pendingCount = appointments.filter((a) => a.status === 'pending').length;

  // ── Appointment card ──────────────────────────────────────────────────────

  const renderCard = (appt: ApptDoc) => {
    const cfg = STATUS_CONFIG[appt.status];
    const vehicleLine = [appt.vehicleDetails, appt.vehicleColor].filter(Boolean).join(' · ');
    return (
      <View key={appt.id} style={[styles.card, { borderLeftColor: cfg.color }]}>
        <View style={styles.cardTop}>
          {/* Initials avatar */}
          <View style={[styles.avatar, { backgroundColor: avatarBg(appt.customerName) }]}>
            <Text style={styles.avatarText}>{initials(appt.customerName)}</Text>
          </View>

          <View style={styles.cardMain}>
            {/* Name + status badge */}
            <View style={styles.cardNameRow}>
              <Text style={styles.cardCustomerName} numberOfLines={1}>
                {appt.customerName}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>

            {/* Vehicle */}
            <Text style={styles.cardVehicle} numberOfLines={1}>{vehicleLine}</Text>

            {/* Service · time */}
            <Text style={styles.cardService} numberOfLines={1}>
              {appt.serviceName} · {formatTime(appt.timeSlot)}
            </Text>
          </View>
        </View>

        {/* Admin notes preview */}
        {Boolean(appt.adminNotes) && (
          <View style={styles.notesRow}>
            <Ionicons name="document-text-outline" size={12} color="#9CA3AF" />
            <Text style={styles.notesRowText} numberOfLines={2}>{appt.adminNotes}</Text>
          </View>
        )}

        {/* Footer: price + action */}
        <View style={styles.cardFooter}>
          {appt.status === 'completed' && appt.actualCharge !== null ? (
            <Text style={styles.chargedText}>Charged: ${appt.actualCharge}</Text>
          ) : (
            <Text style={styles.estText}>Est. ${appt.estimatedPrice}</Text>
          )}
          <TouchableOpacity
            style={styles.updateBtn}
            onPress={() => openEdit(appt)}
            activeOpacity={0.75}
          >
            <Ionicons name="pencil-outline" size={13} color="#E94560" />
            <Text style={styles.updateBtnText}>Update Job</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: "Today's Jobs", value: String(appointments.length), icon: 'briefcase-outline' as const },
            { label: 'Pending', value: String(pendingCount), icon: 'time-outline' as const },
            { label: 'Completed', value: String(completedToday.length), icon: 'checkmark-done-outline' as const },
          ].map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Ionicons name={stat.icon} size={20} color="#E94560" />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color="#E94560" style={styles.loader} />
        ) : (
          <>
            {/* Active Jobs */}
            <Text style={styles.sectionTitle}>Active Jobs</Text>
            {activeJobs.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={36} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>All clear!</Text>
                <Text style={styles.emptySub}>No active jobs scheduled for today</Text>
              </View>
            ) : (
              activeJobs.map(renderCard)
            )}

            {/* Completed Today */}
            {completedToday.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, styles.sectionTitleGap]}>
                  Completed Today
                </Text>
                {completedToday.map(renderCard)}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Update Job bottom sheet ──────────────────────────────────────── */}
      <Modal
        visible={editingAppt !== null}
        transparent
        animationType="none"
        onRequestClose={closeEdit}
      >
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={closeEdit}
          activeOpacity={1}
        />
        <KeyboardAvoidingView
          style={styles.sheetPositioner}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
            {/* Drag handle */}
            <View style={styles.handleWrap}>
              <View style={styles.dragHandle} />
            </View>

            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {editingAppt?.customerName}
                </Text>
                <Text style={styles.sheetSubtitle} numberOfLines={1}>
                  {editingAppt?.serviceName} · {editingAppt ? formatTime(editingAppt.timeSlot) : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeEdit}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.formScroll}
            >
              {/* ── Status Update ─────────────────────────────────────── */}
              <Text style={styles.sectionLabel}>STATUS UPDATE</Text>
              <View style={styles.statusGroup}>
                {STATUS_ORDER.map((s, i) => {
                  const cfg = STATUS_CONFIG[s];
                  const isActive = formStatus === s;
                  return (
                    <React.Fragment key={s}>
                      {i > 0 && <View style={styles.statusSep} />}
                      <TouchableOpacity
                        style={[styles.statusBtn, isActive && { backgroundColor: cfg.color }]}
                        onPress={() => {
                          setFormStatus(s);
                          if (s !== 'completed') setChargeError(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.statusBtnText, isActive && styles.statusBtnTextActive]}>
                          {cfg.label}
                        </Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>

              {/* ── Actual Charge (Completed only) ───────────────────── */}
              {formStatus === 'completed' && (
                <View style={styles.fieldSection}>
                  <Text style={styles.sectionLabel}>ACTUAL CHARGE</Text>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Final charge ($)</Text>
                    <View style={[styles.prefixWrap, chargeError && styles.inputError]}>
                      <Text style={styles.prefix}>$</Text>
                      <TextInput
                        style={styles.prefixInput}
                        value={formCharge}
                        onChangeText={(v) => {
                          setFormCharge(v);
                          setChargeError(null);
                        }}
                        placeholder={String(editingAppt?.estimatedPrice ?? '')}
                        placeholderTextColor="#9CA3AF"
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        autoFocus
                      />
                    </View>
                    {chargeError && <Text style={styles.errorText}>{chargeError}</Text>}
                  </View>
                </View>
              )}

              {/* ── Notes ─────────────────────────────────────────────── */}
              <View style={styles.fieldSection}>
                <Text style={styles.sectionLabel}>NOTES</Text>
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>
                    Job notes{' '}
                    <Text style={styles.optional}>(optional — visible to customer)</Text>
                  </Text>
                  <TextInput
                    style={[styles.fieldInput, styles.textArea]}
                    value={formNotes}
                    onChangeText={setFormNotes}
                    placeholder="Add notes about this job…"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    autoCapitalize="sentences"
                  />
                </View>
              </View>

              {/* ── Save ──────────────────────────────────────────────── */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 48 },

  // ── Stats ──────────────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1A1A2E' },
  statLabel: { fontSize: 11, color: '#6B7280', textAlign: 'center' },

  // ── Section titles ─────────────────────────────────────────────────────────
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  sectionTitleGap: { marginTop: 28 },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
  emptySub: { fontSize: 13, color: '#D1D5DB', textAlign: 'center' },

  // ── Appointment card ───────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  cardMain: { flex: 1, minWidth: 0 },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  cardCustomerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A2E',
    flex: 1,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  cardVehicle: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  cardService: { fontSize: 12, color: '#9CA3AF' },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  notesRowText: { fontSize: 12, color: '#9CA3AF', flex: 1, lineHeight: 16 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  estText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  chargedText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF1F3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  updateBtnText: { fontSize: 12, fontWeight: '700', color: '#E94560' },

  // ── Bottom sheet ───────────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetPositioner: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    maxHeight: '88%',
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sheetHeaderText: { flex: 1, marginRight: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  sheetSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  formScroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },

  // ── Form sections ──────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  fieldSection: { marginTop: 24 },
  fieldWrap: {},
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 7 },
  optional: { fontWeight: '400', color: '#9CA3AF' },

  // ── Status segmented control ───────────────────────────────────────────────
  statusGroup: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  statusSep: { width: 1.5, backgroundColor: '#E5E7EB' },
  statusBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  statusBtnText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  statusBtnTextActive: { color: '#FFFFFF' },

  // ── Charge field ───────────────────────────────────────────────────────────
  prefixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    overflow: 'hidden',
  },
  prefix: {
    paddingLeft: 14,
    paddingRight: 4,
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  prefixInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 14,
    fontSize: 15,
    color: '#1A1A2E',
  },
  inputError: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  errorText: { fontSize: 12, color: '#DC2626', marginTop: 4 },

  // ── Notes field ────────────────────────────────────────────────────────────
  fieldInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A1A2E',
  },
  textArea: { minHeight: 88, paddingTop: 12 },

  // ── Save button ────────────────────────────────────────────────────────────
  saveBtn: {
    backgroundColor: '#E94560',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 4,
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
