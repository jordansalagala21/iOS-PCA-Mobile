import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
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
import type { Service } from '../../types';
import { seedServices } from '../../utils/seedServices';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type FormErrors = Partial<Record<'priceFrom' | 'duration' | 'description', string>>;
type FormState = { priceFrom: string; duration: string; description: string };

const ICON_MAP: Record<string, IoniconsName> = {
  sparkles: 'sparkles-outline',
  star: 'star-outline',
  shield: 'shield-checkmark-outline',
  palette: 'color-palette-outline',
};
function serviceIconName(icon: string): IoniconsName {
  return ICON_MAP[icon] ?? 'sparkles-outline';
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? '1 hr' : `${h} hrs`;
  return `${h} hr ${m} min`;
}

// ── ServicesScreen ────────────────────────────────────────────────────────────

export function ServicesScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Edit sheet state
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form, setForm] = useState<FormState>({ priceFrom: '', duration: '', description: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // Bottom-sheet animation
  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // ── Real-time service subscription ───────────────────────────────────────

  useEffect(() => {
    const q = query(collection(db, 'services'), orderBy('priceFrom', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setLoading(false);
          setSeeding(true);
          seedServices().finally(() => setSeeding(false));
          return;
        }
        setServices(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name ?? '',
            priceFrom: d.data().priceFrom ?? 0,
            duration: d.data().duration ?? 60,
            description: d.data().description ?? '',
            icon: d.data().icon ?? 'sparkles',
            updatedAt: d.data().updatedAt ?? null,
          }) as Service),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  // ── Animate in when a service is queued for editing ───────────────────────

  useEffect(() => {
    if (!editingService) return;
    slideAnim.setValue(600);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingService]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openEdit = (service: Service) => {
    setForm({
      priceFrom: String(service.priceFrom),
      duration: String(service.duration),
      description: service.description,
    });
    setErrors({});
    setSaving(false);
    setEditingService(service);
  };

  const closeEdit = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setEditingService(null));
  };

  const setField = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSave = async () => {
    const priceFVal = parseFloat(form.priceFrom);
    const durationVal = parseInt(form.duration, 10);
    const newErrors: FormErrors = {};

    if (!form.priceFrom.trim() || isNaN(priceFVal) || priceFVal <= 0) {
      newErrors.priceFrom = 'Enter a valid price greater than 0.';
    }
    if (!form.duration.trim() || isNaN(durationVal) || durationVal <= 0) {
      newErrors.duration = 'Enter a valid duration in minutes.';
    }
    if (!form.description.trim()) {
      newErrors.description = 'Description is required.';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, 'services', editingService!.id), {
        priceFrom: priceFVal,
        duration: durationVal,
        description: form.description.trim(),
        updatedAt: serverTimestamp(),
      });
      closeEdit();
    } catch {
      setErrors({ description: 'Failed to save. Please try again.' });
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading || seeding ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color="#E09010" size="large" />
            <Text style={styles.emptySub}>{seeding ? 'Setting up services catalog…' : 'Loading…'}</Text>
          </View>
        ) : services.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetags-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No services found</Text>
            <TouchableOpacity
              style={styles.seedBtn}
              onPress={() => { setSeeding(true); seedServices().finally(() => setSeeding(false)); }}
              activeOpacity={0.8}
            >
              <Text style={styles.seedBtnText}>Populate Service Catalog</Text>
            </TouchableOpacity>
          </View>
        ) : (
          services.map((s) => (
            <View key={s.id} style={styles.card}>
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name={serviceIconName(s.icon)} size={22} color="#E09010" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{s.name}</Text>
                  <Text style={styles.cardDesc} numberOfLines={2}>{s.description}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceBadgeText}>From ${s.priceFrom}</Text>
                    </View>
                    <View style={styles.durationBadge}>
                      <Ionicons name="time-outline" size={11} color="#6B7280" />
                      <Text style={styles.durationBadgeText}> {formatDuration(s.duration)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Divider + action */}
              <View style={styles.cardDivider} />
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => openEdit(s)}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil-outline" size={15} color="#E09010" />
                <Text style={styles.editBtnText}>Edit Price & Details</Text>
                <Ionicons name="chevron-forward" size={15} color="#E09010" style={styles.editChevron} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Edit bottom sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={editingService !== null}
        transparent
        animationType="none"
        onRequestClose={closeEdit}
      >
        {/* Backdrop */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
          pointerEvents="none"
        />

        {/* Tap-outside to close */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={closeEdit}
          activeOpacity={1}
        />

        {/* Sheet */}
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
              <Text style={styles.sheetTitle} numberOfLines={1}>
                Edit — {editingService?.name}
              </Text>
              <TouchableOpacity
                onPress={closeEdit}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Form */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.formScroll}
            >
              {/* Price From */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Price From ($)</Text>
                <View style={[styles.prefixWrap, errors.priceFrom && styles.fieldInputError]}>
                  <Text style={styles.prefix}>$</Text>
                  <TextInput
                    style={styles.prefixInput}
                    value={form.priceFrom}
                    onChangeText={(v) => setField('priceFrom', v)}
                    placeholder="49"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
                {errors.priceFrom && (
                  <Text style={styles.errorText}>{errors.priceFrom}</Text>
                )}
              </View>

              {/* Duration */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Duration (minutes)</Text>
                <View style={[styles.prefixWrap, errors.duration && styles.fieldInputError]}>
                  <TextInput
                    style={[styles.prefixInput, { paddingLeft: 14 }]}
                    value={form.duration}
                    onChangeText={(v) => setField('duration', v)}
                    placeholder="60"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    returnKeyType="next"
                  />
                  <Text style={styles.suffix}>min</Text>
                </View>
                {errors.duration && (
                  <Text style={styles.errorText}>{errors.duration}</Text>
                )}
              </View>

              {/* Description */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[
                    styles.fieldInput,
                    styles.textArea,
                    errors.description && styles.fieldInputError,
                  ]}
                  value={form.description}
                  onChangeText={(v) => setField('description', v)}
                  placeholder="Brief service description"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                />
                {errors.description && (
                  <Text style={styles.errorText}>{errors.description}</Text>
                )}
              </View>

              {/* Save button */}
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
  loader: { marginTop: 60 },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
  seedBtn: {
    marginTop: 8,
    backgroundColor: '#E09010',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  seedBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // ── Service card ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 14,
  },
  cardIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 10 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  priceBadge: {
    backgroundColor: '#FFF1F3',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  priceBadgeText: { fontSize: 11, fontWeight: '700', color: '#E09010' },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  durationBadgeText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  cardDivider: { height: 1, backgroundColor: '#F3F4F6' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 8,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: '#E09010', flex: 1 },
  editChevron: { marginLeft: 'auto' },

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
    maxHeight: '85%',
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0A0A0A', flex: 1, marginRight: 12 },

  // ── Form ───────────────────────────────────────────────────────────────────
  formScroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  fieldWrap: { marginBottom: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', letterSpacing: 0.2, marginBottom: 7 },
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
  suffix: {
    paddingRight: 14,
    paddingLeft: 4,
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  prefixInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 14,
    fontSize: 15,
    color: '#0A0A0A',
  },
  fieldInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0A0A0A',
  },
  textArea: { minHeight: 80, paddingTop: 12 },
  fieldInputError: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  errorText: { fontSize: 12, color: '#DC2626', marginTop: 4 },
  saveBtn: {
    backgroundColor: '#E09010',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
