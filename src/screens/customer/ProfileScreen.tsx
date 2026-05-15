import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { deleteUser, signOut, updateProfile } from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VehicleFormModal } from '../../components/VehicleFormModal';
import { useAuth } from '../../context/AuthContext';
import { CustomerRootStackParamList } from '../../navigation/CustomerNavigator';
import { auth, db } from '../../services/firebase';
import {
  type Vehicle,
  deleteVehicle,
  migrateVehicleIfNeeded,
  subscribeToVehicles,
} from '../../services/vehicles';

type Props = NativeStackScreenProps<CustomerRootStackParamList, 'Profile'>;

interface ProfileData {
  fullName: string;
  phone: string;
}

export function ProfileScreen({ navigation }: Props) {
  const { user, refreshUser } = useAuth();

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileData>({ fullName: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── Vehicles state ─────────────────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<Vehicle | undefined>(undefined);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState({ visible: false, message: '' });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ visible: true, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast({ visible: false, message: '' }),
      2500,
    );
  }, []);

  // ── Load profile + migrate legacy vehicle fields ───────────────────────────
  const loadProfile = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.data();
      const loaded: ProfileData = {
        fullName: data?.fullName ?? user.displayName ?? '',
        phone: data?.phone ?? '',
      };
      setProfile(loaded);
      setForm(loaded);
      // Migrate old single-vehicle fields to the subcollection if needed
      await migrateVehicleIfNeeded(
        user.uid,
        data?.vehicleMake ?? '',
        data?.vehicleModel ?? '',
      );
    } catch {
      const loaded: ProfileData = {
        fullName: user.displayName ?? '',
        phone: '',
      };
      setProfile(loaded);
      setForm(loaded);
    } finally {
      setLoadingProfile(false);
    }
  }, [user]);

  // ── Subscribe to vehicles subcollection ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToVehicles(
      user.uid,
      (data) => {
        setVehicles(data);
        setVehiclesLoading(false);
      },
      () => setVehiclesLoading(false),
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    loadProfile();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadProfile]);

  // ── Profile edit handlers ──────────────────────────────────────────────────
  const startEditing = () => {
    if (profile) setForm({ ...profile });
    setSaveError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setSaveError('');
    setEditing(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.fullName.trim()) {
      setSaveError('Full name is required.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await updateProfile(user, { displayName: form.fullName.trim() });
      await setDoc(
        doc(db, 'users', user.uid),
        { fullName: form.fullName.trim(), phone: form.phone.trim() },
        { merge: true },
      );
      setProfile({ fullName: form.fullName.trim(), phone: form.phone.trim() });
      await refreshUser();
      setEditing(false);
      showToast('Profile updated!');
    } catch {
      setSaveError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Vehicle handlers ───────────────────────────────────────────────────────
  const openAddVehicle = () => {
    setVehicleToEdit(undefined);
    setVehicleModalVisible(true);
  };

  const openEditVehicle = (vehicle: Vehicle) => {
    setVehicleToEdit(vehicle);
    setVehicleModalVisible(true);
  };

  const handleDeleteVehicle = (vehicle: Vehicle) => {
    if (vehicles.length <= 1) {
      Alert.alert(
        'Cannot Remove Vehicle',
        'You must have at least one vehicle on your account.',
      );
      return;
    }
    const displayName =
      vehicle.nickname ||
      [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
      'this vehicle';
    Alert.alert(
      'Remove Vehicle',
      `Remove ${displayName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await deleteVehicle(user.uid, vehicle.id);
            } catch {
              Alert.alert('Error', 'Could not remove vehicle. Please try again.');
            }
          },
        },
      ],
    );
  };

  // ── Auth handlers ──────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut(auth);
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await deleteDoc(doc(db, 'users', user.uid));
              await deleteUser(user);
            } catch (e: unknown) {
              const code = (e as { code?: string }).code ?? '';
              if (code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication Required',
                  'For security, please sign out and sign back in, then try deleting again.',
                );
              } else {
                Alert.alert('Error', 'Could not delete account. Please try again.');
              }
            }
          },
        },
      ],
    );
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const initials = (profile?.fullName || user?.displayName || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const email = user?.email ?? '';

  // ── Loading splash ─────────────────────────────────────────────────────────
  if (loadingProfile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#E09010" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── Modal chrome ──────────────────────────────────────────────────────── */}
      <View style={styles.modalChrome}>
        <View style={styles.dragHandle} />
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <Ionicons name="close-circle" size={28} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Profile header ─────────────────────────────────────────────── */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
            <Text style={styles.profileName}>{profile?.fullName || 'Your Name'}</Text>
            <Text style={styles.profileEmail}>{email}</Text>
            {!editing && (
              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={startEditing}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil-outline" size={14} color="#E09010" />
                <Text style={styles.editProfileBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Toast ──────────────────────────────────────────────────────── */}
          {toast.visible && (
            <View style={styles.toastBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          )}

          {/* ── Edit form ──────────────────────────────────────────────────── */}
          {editing && (
            <View style={styles.card}>
              <Text style={styles.cardSectionLabel}>PERSONAL INFO</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={form.fullName}
                  onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))}
                  placeholder="John Smith"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={form.phone}
                  onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                  placeholder="(555) 000-0000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.field}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <View style={styles.lockedBadge}>
                    <Ionicons name="lock-closed" size={10} color="#9CA3AF" />
                    <Text style={styles.lockedText}>Not editable</Text>
                  </View>
                </View>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={email}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>

              {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

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

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={cancelEditing}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── My Vehicles ────────────────────────────────────────────────── */}
          {!editing && (
            <>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>MY VEHICLES</Text>
                <Text style={styles.sectionCount}>
                  {vehiclesLoading ? '' : `${vehicles.length}`}
                </Text>
              </View>

              {vehiclesLoading ? (
                <View style={styles.vehiclesLoadingWrap}>
                  <ActivityIndicator size="small" color="#E09010" />
                </View>
              ) : (
                <>
                  {vehicles.map((v) => (
                    <VehicleCard
                      key={v.id}
                      vehicle={v}
                      onEdit={() => openEditVehicle(v)}
                      onDelete={() => handleDeleteVehicle(v)}
                    />
                  ))}

                  {vehicles.length === 0 && (
                    <View style={[styles.card, styles.emptyVehicleCard]}>
                      <Ionicons name="car-outline" size={32} color="#D1D5DB" />
                      <Text style={styles.emptyVehicleText}>No vehicles added yet</Text>
                      <Text style={styles.emptyVehicleSub}>
                        Add a vehicle to speed up booking
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.addVehicleBtn}
                    onPress={openAddVehicle}
                    activeOpacity={0.8}
                  >
                    <View style={styles.addVehicleIcon}>
                      <Ionicons name="add" size={20} color="#E09010" />
                    </View>
                    <Text style={styles.addVehicleBtnText}>Add Vehicle</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* ── Account ────────────────────────────────────────────────────── */}
          {!editing && (
            <>
              <Text style={[styles.sectionLabel, styles.sectionLabelSpacedTop]}>ACCOUNT</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.listItem}
                  onPress={() =>
                    Alert.alert(
                      'Coming Soon',
                      'Notification preferences will be available in a future update.',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <View style={[styles.listIconWrap, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="notifications-outline" size={18} color="#4F46E5" />
                  </View>
                  <Text style={styles.listLabel}>Notification Preferences</Text>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>

                <View style={styles.listSeparator} />

                <TouchableOpacity
                  style={styles.listItem}
                  onPress={() => navigation.navigate('Tabs', { screen: 'Appointments' })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.listIconWrap, { backgroundColor: '#FFF7ED' }]}>
                    <Ionicons name="time-outline" size={18} color="#EA580C" />
                  </View>
                  <Text style={styles.listLabel}>Appointment History</Text>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>

                <View style={styles.listSeparator} />

                <TouchableOpacity
                  style={styles.listItem}
                  onPress={() =>
                    Alert.alert(
                      'Help & Support',
                      'For support, email us at support@perfectchoicedetail.com',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <View style={[styles.listIconWrap, { backgroundColor: '#F0FDF4' }]}>
                    <Ionicons name="help-circle-outline" size={18} color="#16A34A" />
                  </View>
                  <Text style={styles.listLabel}>Help & Support</Text>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Danger zone ────────────────────────────────────────────────── */}
          {!editing && (
            <>
              <Text style={[styles.sectionLabel, styles.sectionLabelSpacedTop]}>
                ACCOUNT ACTIONS
              </Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.listItem}
                  onPress={handleLogout}
                  activeOpacity={0.7}
                >
                  <View style={[styles.listIconWrap, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="log-out-outline" size={18} color="#DC2626" />
                  </View>
                  <Text style={[styles.listLabel, styles.dangerText]}>Sign Out</Text>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>

                <View style={styles.listSeparator} />

                <TouchableOpacity
                  style={styles.listItem}
                  onPress={handleDeleteAccount}
                  activeOpacity={0.7}
                >
                  <View style={[styles.listIconWrap, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </View>
                  <Text style={[styles.listLabel, styles.dangerText]}>Delete Account</Text>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Vehicle form modal ─────────────────────────────────────────────── */}
      {user && (
        <VehicleFormModal
          visible={vehicleModalVisible}
          uid={user.uid}
          vehicle={vehicleToEdit}
          onClose={() => setVehicleModalVisible(false)}
          onSuccess={showToast}
        />
      )}
    </SafeAreaView>
  );
}

// ── VehicleCard sub-component ─────────────────────────────────────────────────

interface VehicleCardProps {
  vehicle: Vehicle;
  onEdit: () => void;
  onDelete: () => void;
}

function VehicleCard({ vehicle, onEdit, onDelete }: VehicleCardProps) {
  const primaryLine =
    vehicle.nickname ||
    [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
    'Unnamed Vehicle';

  const secondaryParts: string[] = [];
  if (vehicle.nickname) {
    const spec = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
    if (spec) secondaryParts.push(spec);
  }
  if (vehicle.color) secondaryParts.push(vehicle.color);
  const secondaryLine = secondaryParts.join(' · ');

  return (
    <View style={vehicleCardStyles.card}>
      <View style={vehicleCardStyles.iconWrap}>
        <Ionicons name="car-sport-outline" size={22} color="#E09010" />
      </View>

      <View style={vehicleCardStyles.info}>
        <Text style={vehicleCardStyles.primary} numberOfLines={1}>
          {primaryLine}
        </Text>
        {secondaryLine ? (
          <Text style={vehicleCardStyles.secondary} numberOfLines={1}>
            {secondaryLine}
          </Text>
        ) : null}
      </View>

      <View style={vehicleCardStyles.actions}>
        <TouchableOpacity
          style={vehicleCardStyles.editBtn}
          onPress={onEdit}
          activeOpacity={0.7}
        >
          <Text style={vehicleCardStyles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={vehicleCardStyles.deleteBtn}
          onPress={onDelete}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const vehicleCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  primary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0A0A',
    letterSpacing: 0.1,
  },
  secondary: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  deleteBtn: {
    padding: 4,
  },
});

// ── ProfileScreen styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kav: { flex: 1 },
  scroll: { paddingBottom: 48 },

  // Modal chrome
  modalChrome: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 6,
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 8,
  },
  closeBtn: { position: 'absolute', right: 16, top: 8 },

  // Profile header
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    marginBottom: 24,
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E09010',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarInitials: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: 1 },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A0A0A',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  profileEmail: { fontSize: 14, color: '#6B7280', marginBottom: 18 },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF1F3',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  editProfileBtnText: { fontSize: 14, fontWeight: '700', color: '#E09010' },

  // Toast
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  toastText: { fontSize: 14, fontWeight: '600', color: '#16A34A' },

  // Section labels
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 1.2,
    marginHorizontal: 24,
    marginBottom: 8,
  },
  sectionLabelSpacedTop: { marginTop: 8 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 24,
    marginBottom: 10,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E09010',
  },
  cardSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.2,
    marginBottom: 16,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  // Vehicles
  vehiclesLoadingWrap: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyVehicleCard: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  emptyVehicleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  emptyVehicleSub: { fontSize: 13, color: '#D1D5DB' },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E09010',
    borderStyle: 'dashed',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  addVehicleIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addVehicleBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E09010',
  },

  // Edit form
  field: { marginBottom: 14 },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 7,
    letterSpacing: 0.2,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lockedText: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0A0A0A',
  },
  inputDisabled: { backgroundColor: '#F3F4F6', color: '#9CA3AF' },
  errorText: { fontSize: 13, color: '#DC2626', marginBottom: 12, marginTop: -4 },
  saveBtn: {
    backgroundColor: '#E09010',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelBtnText: { fontSize: 15, color: '#6B7280', fontWeight: '600' },

  // List items
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  listIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#0A0A0A' },
  listSeparator: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 48 },
  dangerText: { color: '#DC2626', fontWeight: '600' },
});
