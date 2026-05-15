import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import type { AdminRootStackParamList } from '../../navigation/AdminNavigator';
import { db } from '../../services/firebase';

type Nav = NativeStackNavigationProp<AdminRootStackParamList>;

type CustomerDoc = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  accountType?: string;
  createdAt: { toDate: () => Date } | null;
};

type WalkInForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  notes: string;
};

type WalkInErrors = Partial<Record<
  'firstName' | 'lastName' | 'phone' | 'vehicleMake' | 'vehicleModel' | 'vehicleYear',
  string
>>;

const DEFAULT_FORM: WalkInForm = {
  firstName: '', lastName: '', phone: '', email: '',
  vehicleMake: '', vehicleModel: '', vehicleYear: '', vehicleColor: '', notes: '',
};

const AVATAR_COLORS = ['#E09010', '#4F46E5', '#059669', '#D97706', '#7C3AED', '#0891B2'];
function avatarBg(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function formatDate(ts: CustomerDoc['createdAt']): string {
  if (!ts) return '';
  try {
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

export function CustomersScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Walk-in modal
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<WalkInForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<WalkInErrors>({});
  const [saving, setSaving] = useState(false);

  const slideAnim = useRef(new Animated.Value(700)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'customer'));
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          fullName: d.data().fullName ?? d.data().displayName ?? 'Unknown',
          email: d.data().email ?? '',
          phone: d.data().phone ?? '',
          vehicleMake: d.data().vehicleMake ?? '',
          vehicleModel: d.data().vehicleModel ?? '',
          accountType: d.data().accountType,
          createdAt: d.data().createdAt ?? null,
        }));
        docs.sort((a, b) => {
          const aMs = a.createdAt ? a.createdAt.toDate().getTime() : 0;
          const bMs = b.createdAt ? b.createdAt.toDate().getTime() : 0;
          return bMs - aMs;
        });
        setCustomers(docs);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [customers, searchQuery]);

  // ── Walk-in modal helpers ─────────────────────────────────────────────────

  const openModal = () => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setSaving(false);
    setModalVisible(true);
    slideAnim.setValue(700);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 55, friction: 11 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 700, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setModalVisible(false));
  };

  const setField = <K extends keyof WalkInForm>(key: K, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as keyof WalkInErrors]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSave = async () => {
    const newErrors: WalkInErrors = {};
    if (!form.firstName.trim()) newErrors.firstName = 'Required';
    if (!form.lastName.trim()) newErrors.lastName = 'Required';
    if (!form.phone.trim()) newErrors.phone = 'Required';
    if (!form.vehicleMake.trim()) newErrors.vehicleMake = 'Required';
    if (!form.vehicleModel.trim()) newErrors.vehicleModel = 'Required';
    if (!form.vehicleYear.trim()) newErrors.vehicleYear = 'Required';
    else if (isNaN(parseInt(form.vehicleYear, 10))) newErrors.vehicleYear = 'Enter a valid year';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setSaving(true);
    try {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
      const newDocRef = await addDoc(collection(db, 'users'), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        fullName,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        role: 'customer',
        accountType: 'walk-in',
        uid: null,
        notes: form.notes.trim() || null,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? null,
      });
      await addDoc(collection(db, 'users', newDocRef.id, 'vehicles'), {
        make: form.vehicleMake.trim(),
        model: form.vehicleModel.trim(),
        year: form.vehicleYear.trim(),
        color: form.vehicleColor.trim() || '',
        nickname: '',
        createdAt: serverTimestamp(),
      });
      closeModal();
    } catch {
      setErrors({ firstName: 'Failed to save. Please try again.' });
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Search + Add Walk-in */}
      <View style={styles.topBar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, email or phone…"
            placeholderTextColor="#9CA3AF"
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity style={styles.addWalkInBtn} onPress={openModal} activeOpacity={0.85}>
          <Ionicons name="person-add-outline" size={18} color="#0A0A0A" />
        </TouchableOpacity>
      </View>

      {!loading && customers.length > 0 && (
        <Text style={styles.countLabel}>
          {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
          {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#E09010" style={styles.loader} />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>
              {searchQuery.trim() ? 'No results found' : 'No customers yet'}
            </Text>
            <Text style={styles.emptySub}>
              {searchQuery.trim()
                ? 'Try a different name or email'
                : 'Customers will appear here once they sign up'}
            </Text>
          </View>
        ) : (
          filtered.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.card}
              onPress={() => navigation.navigate('CustomerDetail', { uid: c.id, customerName: c.fullName })}
              activeOpacity={0.75}
            >
              <View style={styles.cardRow}>
                <View style={[styles.avatar, { backgroundColor: avatarBg(c.fullName) }]}>
                  <Text style={styles.avatarText}>{initials(c.fullName)}</Text>
                </View>
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{c.fullName}</Text>
                    {c.accountType === 'walk-in' && (
                      <View style={styles.walkInPill}>
                        <Text style={styles.walkInPillText}>Walk-in</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="mail-outline" size={12} color="#9CA3AF" />
                    <Text style={styles.detailText} numberOfLines={1}>{c.email || '—'}</Text>
                  </View>
                  {c.phone ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="call-outline" size={12} color="#9CA3AF" />
                      <Text style={styles.detailText}>{c.phone}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {(c.vehicleMake || c.vehicleModel || c.createdAt) ? (
                <View style={styles.cardFooter}>
                  {(c.vehicleMake || c.vehicleModel) ? (
                    <View style={styles.footerChip}>
                      <Ionicons name="car-outline" size={12} color="#6B7280" />
                      <Text style={styles.footerChipText}>
                        {[c.vehicleMake, c.vehicleModel].filter(Boolean).join(' ')}
                      </Text>
                    </View>
                  ) : null}
                  {c.createdAt ? (
                    <View style={styles.footerChip}>
                      <Ionicons name="calendar-outline" size={12} color="#6B7280" />
                      <Text style={styles.footerChipText}>Joined {formatDate(c.createdAt)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* ── Add Walk-in Modal ──────────────────────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} pointerEvents="none" />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeModal} activeOpacity={1} />
        <KeyboardAvoidingView
          style={styles.sheetPositioner}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.handleWrap}><View style={styles.dragHandle} /></View>

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Add Walk-in Customer</Text>
                <Text style={styles.sheetSubtitle}>No app account required</Text>
              </View>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.formScroll}
            >
              <Text style={styles.sectionLabel}>PERSONAL INFO</Text>

              <View style={styles.rowFields}>
                <View style={[styles.fieldWrap, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.fieldLabel}>First Name *</Text>
                  <TextInput
                    style={[styles.fieldInput, errors.firstName && styles.fieldInputError]}
                    value={form.firstName}
                    onChangeText={(v) => setField('firstName', v)}
                    placeholder="John"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                  {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
                </View>
                <View style={[styles.fieldWrap, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Last Name *</Text>
                  <TextInput
                    style={[styles.fieldInput, errors.lastName && styles.fieldInputError]}
                    value={form.lastName}
                    onChangeText={(v) => setField('lastName', v)}
                    placeholder="Smith"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                  {errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
                </View>
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Phone *</Text>
                <TextInput
                  style={[styles.fieldInput, errors.phone && styles.fieldInputError]}
                  value={form.phone}
                  onChangeText={(v) => setField('phone', v)}
                  placeholder="(555) 000-0000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />
                {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Email (optional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.email}
                  onChangeText={(v) => setField('email', v)}
                  placeholder="john@example.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 8 }]}>VEHICLE</Text>

              <View style={styles.rowFields}>
                <View style={[styles.fieldWrap, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.fieldLabel}>Make *</Text>
                  <TextInput
                    style={[styles.fieldInput, errors.vehicleMake && styles.fieldInputError]}
                    value={form.vehicleMake}
                    onChangeText={(v) => setField('vehicleMake', v)}
                    placeholder="Toyota"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                  {errors.vehicleMake && <Text style={styles.errorText}>{errors.vehicleMake}</Text>}
                </View>
                <View style={[styles.fieldWrap, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Model *</Text>
                  <TextInput
                    style={[styles.fieldInput, errors.vehicleModel && styles.fieldInputError]}
                    value={form.vehicleModel}
                    onChangeText={(v) => setField('vehicleModel', v)}
                    placeholder="Camry"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                  {errors.vehicleModel && <Text style={styles.errorText}>{errors.vehicleModel}</Text>}
                </View>
              </View>

              <View style={styles.rowFields}>
                <View style={[styles.fieldWrap, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.fieldLabel}>Year *</Text>
                  <TextInput
                    style={[styles.fieldInput, errors.vehicleYear && styles.fieldInputError]}
                    value={form.vehicleYear}
                    onChangeText={(v) => setField('vehicleYear', v)}
                    placeholder="2022"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                  {errors.vehicleYear && <Text style={styles.errorText}>{errors.vehicleYear}</Text>}
                </View>
                <View style={[styles.fieldWrap, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Color (optional)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.vehicleColor}
                    onChangeText={(v) => setField('vehicleColor', v)}
                    placeholder="White"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.fieldInput, styles.textArea]}
                  value={form.notes}
                  onChangeText={(v) => setField('notes', v)}
                  placeholder="e.g. Paid cash, referred by John…"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={17} color="#0A0A0A" />
                    <Text style={styles.saveBtnText}>Add Walk-in Customer</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    gap: 10,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#0A0A0A' },
  addWalkInBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#E09010',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  countLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginHorizontal: 20,
    marginBottom: 10,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  loader: { marginTop: 60 },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
  emptySub: { fontSize: 13, color: '#D1D5DB', textAlign: 'center' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  info: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  walkInPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  walkInPillText: { fontSize: 10, fontWeight: '700', color: '#92400E' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { fontSize: 13, color: '#6B7280', flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  footerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  footerChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetPositioner: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    maxHeight: '95%',
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
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0A0A0A' },
  sheetSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  formScroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  rowFields: { flexDirection: 'row' },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', letterSpacing: 0.2, marginBottom: 7 },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E09010',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 8,
    marginBottom: 4,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#0A0A0A', fontSize: 15, fontWeight: '700' },
});
