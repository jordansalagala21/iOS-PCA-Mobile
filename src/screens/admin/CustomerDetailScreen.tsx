import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
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
import type { AdminRootStackParamList } from '../../navigation/AdminNavigator';
import { db } from '../../services/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<AdminRootStackParamList, 'CustomerDetail'>;

type CustomerProfile = {
  fullName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  fcmToken?: string;
  createdAt: { toDate: () => Date } | null;
};

type Vehicle = {
  id: string;
  nickname: string;
  year: string;
  make: string;
  model: string;
  color: string;
};

type Appointment = {
  id: string;
  serviceName: string;
  vehicleDetails: string;
  vehicleColor?: string;
  date: string;
  timeSlot: string;
  status: string;
  actualCharge: number | null;
  adminNotes?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#E09010', '#4F46E5', '#059669', '#D97706', '#7C3AED', '#0891B2'];
function avatarBg(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] ?? '?').toUpperCase();
}
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatJoined(ts: CustomerProfile['createdAt']): string {
  if (!ts) return '—';
  try {
    return ts.toDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}
function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function vehicleLabel(v: Vehicle): string {
  if (v.nickname) return v.nickname;
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#6B7280', bg: '#F3F4F6' },
  confirmed: { label: 'Confirmed', color: '#4F46E5', bg: '#EEF2FF' },
  'in-progress': { label: 'In Progress', color: '#D97706', bg: '#FEF3C7' },
  completed: { label: 'Completed', color: '#059669', bg: '#D1FAE5' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FEE2E2' },
};

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onHide }: { message: string; onHide: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 12 }),
      Animated.delay(2600),
      Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }),
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
    bottom: Platform.OS === 'ios' ? 44 : 24,
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

// ── CustomerDetailScreen ──────────────────────────────────────────────────────

export function CustomerDetailScreen({ navigation, route }: Props) {
  const { uid, customerName } = route.params;

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);

  // Nudge modal
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState('');
  const [nudgeSending, setNudgeSending] = useState(false);
  const nudgeSlide = useRef(new Animated.Value(500)).current;
  const nudgeBackdrop = useRef(new Animated.Value(0)).current;

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setProfile({
        fullName: d.fullName ?? d.displayName ?? customerName,
        email: d.email ?? '',
        phone: d.phone ?? '',
        vehicleMake: d.vehicleMake ?? '',
        vehicleModel: d.vehicleModel ?? '',
        fcmToken: typeof d.fcmToken === 'string' ? d.fcmToken : undefined,
        createdAt: d.createdAt ?? null,
      });
    });
    return unsub;
  }, [uid, customerName]);

  useEffect(() => {
    getDocs(collection(db, 'users', uid, 'vehicles'))
      .then((snap) =>
        setVehicles(
          snap.docs.map((d) => ({
            id: d.id,
            nickname: d.data().nickname ?? '',
            year: d.data().year ?? '',
            make: d.data().make ?? '',
            model: d.data().model ?? '',
            color: d.data().color ?? '',
          })),
        ),
      )
      .catch(() => undefined);
  }, [uid]);

  useEffect(() => {
    const q = query(collection(db, 'appointments'), where('customerId', '==', uid));
    getDocs(q)
      .then((snap) => {
        const data = snap.docs
          .map((d) => ({
            id: d.id,
            serviceName: d.data().serviceName ?? '',
            vehicleDetails: d.data().vehicleDetails ?? '',
            vehicleColor: d.data().vehicleColor,
            date: d.data().date ?? '',
            timeSlot: d.data().timeSlot ?? '',
            status: d.data().status ?? '',
            actualCharge: typeof d.data().actualCharge === 'number' ? d.data().actualCharge : null,
            adminNotes: d.data().adminNotes,
          }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setAppointments(data);
      })
      .catch(() => undefined)
      .finally(() => setLoadingAppts(false));
  }, [uid]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const completed = appointments.filter((a) => a.status === 'completed');
  const totalSpent = completed.reduce((s, a) => s + (a.actualCharge ?? 0), 0);
  const totalVisits = completed.length;
  const lastVisit = appointments[0]?.date ?? null;
  const daysSinceVisit = lastVisit ? daysSince(lastVisit) : null;
  const isInactive = daysSinceVisit === null || daysSinceVisit > 14;

  // ── Nudge helpers ──────────────────────────────────────────────────────────

  const openNudge = () => {
    const fName = firstName(profile?.fullName ?? customerName);
    const make =
      vehicles[0]?.make ||
      profile?.vehicleMake ||
      'your vehicle';
    setNudgeMsg(
      `Hey ${fName}! We miss your ${make}. Book your next detail and keep it looking fresh 🚗✨`,
    );
    setNudgeSending(false);
    nudgeSlide.setValue(500);
    nudgeBackdrop.setValue(0);
    setNudgeVisible(true);
    Animated.parallel([
      Animated.spring(nudgeSlide, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.timing(nudgeBackdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeNudge = () => {
    Animated.parallel([
      Animated.timing(nudgeSlide, { toValue: 500, duration: 220, useNativeDriver: true }),
      Animated.timing(nudgeBackdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setNudgeVisible(false));
  };

  const sendNudge = async () => {
    if (!nudgeMsg.trim()) return;
    setNudgeSending(true);

    try {
      const fName = firstName(profile?.fullName ?? customerName);
      const promotionRef = await addDoc(collection(db, 'promotions'), {
        title: `Hey ${fName}, we miss you! 👋`,
        message: nudgeMsg.trim(),
        discount: null,
        targetAudience: 'individual',
        recipientId: uid,
        scheduledAt: null,
        sent: false,
        sentCount: 0,
        createdAt: serverTimestamp(),
      });

      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          unsub();
          closeNudge();
          setToastMsg('Nudge is sending…');
          setNudgeSending(false);
        }
      }, 10000);

      const unsub = onSnapshot(doc(db, 'promotions', promotionRef.id), (snap) => {
        if (snap.data()?.sent === true && !settled) {
          settled = true;
          clearTimeout(timeout);
          unsub();
          closeNudge();
          setToastMsg('Nudge sent!');
          setNudgeSending(false);
        }
      });
    } catch {
      Alert.alert('Error', 'Failed to send nudge. Please try again.');
      setNudgeSending(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* ── Custom header ─────────────────────────────────────────────── */}
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{customerName}</Text>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar + Contact ───────────────────────────────────────── */}
        <View style={styles.profileSection}>
          <View style={[styles.avatar, { backgroundColor: avatarBg(customerName) }]}>
            <Text style={styles.avatarText}>{initials(customerName)}</Text>
          </View>
          <Text style={styles.profileName}>{profile?.fullName ?? customerName}</Text>
          {profile?.email ? (
            <View style={styles.contactRow}>
              <Ionicons name="mail-outline" size={14} color="#9CA3AF" />
              <Text style={styles.contactText}>{profile.email}</Text>
            </View>
          ) : null}
          {profile?.phone ? (
            <View style={styles.contactRow}>
              <Ionicons name="call-outline" size={14} color="#9CA3AF" />
              <Text style={styles.contactText}>{profile.phone}</Text>
            </View>
          ) : null}
          {profile?.createdAt ? (
            <Text style={styles.memberSince}>Member since {formatJoined(profile.createdAt)}</Text>
          ) : null}
        </View>

        {/* ── Stats row ──────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>${Math.round(totalSpent).toLocaleString('en-US')}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMid]}>
            <Text style={styles.statValue}>{totalVisits}</Text>
            <Text style={styles.statLabel}>Visits</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {lastVisit ? formatDate(lastVisit).replace(/, \d{4}$/, '') : '—'}
            </Text>
            <Text style={styles.statLabel}>Last Visit</Text>
          </View>
        </View>

        {/* ── Re-engagement banner ───────────────────────────────────── */}
        {isInactive ? (
          <View style={styles.inactiveBanner}>
            <View style={styles.inactiveBannerLeft}>
              <Ionicons name="warning-outline" size={20} color="#D97706" />
              <View>
                <Text style={styles.inactiveBannerTitle}>
                  {daysSinceVisit === null
                    ? 'No visits yet'
                    : `Inactive for ${daysSinceVisit} days`}
                </Text>
                <Text style={styles.inactiveBannerSub}>
                  {daysSinceVisit === null
                    ? 'This customer has never booked'
                    : `Last visit was ${daysSinceVisit} days ago`}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.nudgeBtn} onPress={openNudge} activeOpacity={0.85}>
              <Text style={styles.nudgeBtnText}>Send Nudge</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.activeBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#059669" />
            <Text style={styles.activeBannerText}>
              Last visited {daysSinceVisit} day{daysSinceVisit !== 1 ? 's' : ''} ago
            </Text>
          </View>
        )}

        {/* ── Vehicles ───────────────────────────────────────────────── */}
        {vehicles.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Vehicles</Text>
            <View style={styles.vehicleRow}>
              {vehicles.map((v) => (
                <View key={v.id} style={styles.vehiclePill}>
                  <Ionicons name="car-outline" size={13} color="#4F46E5" />
                  <Text style={styles.vehiclePillText}>{vehicleLabel(v)}</Text>
                  {v.color ? <Text style={styles.vehicleColor}>· {v.color}</Text> : null}
                </View>
              ))}
              {/* Fallback from signup fields if no subcollection vehicles */}
              {vehicles.length === 0 && (profile?.vehicleMake || profile?.vehicleModel) && (
                <View style={styles.vehiclePill}>
                  <Ionicons name="car-outline" size={13} color="#4F46E5" />
                  <Text style={styles.vehiclePillText}>
                    {[profile?.vehicleMake, profile?.vehicleModel].filter(Boolean).join(' ')}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
        {vehicles.length === 0 && (profile?.vehicleMake || profile?.vehicleModel) && (
          <>
            <Text style={styles.sectionTitle}>Vehicles</Text>
            <View style={styles.vehicleRow}>
              <View style={styles.vehiclePill}>
                <Ionicons name="car-outline" size={13} color="#4F46E5" />
                <Text style={styles.vehiclePillText}>
                  {[profile?.vehicleMake, profile?.vehicleModel].filter(Boolean).join(' ')}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── Service History ─────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Service History</Text>
        {loadingAppts ? (
          <ActivityIndicator color="#E09010" style={styles.loader} />
        ) : appointments.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={32} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No appointments yet</Text>
          </View>
        ) : (
          appointments.map((a) => {
            const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.pending;
            const vehicleLine = [a.vehicleDetails, a.vehicleColor].filter(Boolean).join(' · ');
            return (
              <View key={a.id} style={[styles.apptCard, { borderLeftColor: cfg.color }]}>
                <View style={styles.apptTop}>
                  <View style={styles.apptMain}>
                    <Text style={styles.apptService} numberOfLines={1}>{a.serviceName}</Text>
                    {vehicleLine ? (
                      <Text style={styles.apptVehicle} numberOfLines={1}>{vehicleLine}</Text>
                    ) : null}
                    <Text style={styles.apptDate}>{formatDate(a.date)}</Text>
                  </View>
                  <View style={styles.apptRight}>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    {a.actualCharge !== null ? (
                      <Text style={styles.apptCharge}>${a.actualCharge}</Text>
                    ) : (
                      <Text style={styles.apptChargeNA}>N/A</Text>
                    )}
                  </View>
                </View>
                {a.adminNotes ? (
                  <View style={styles.apptNotes}>
                    <Ionicons name="document-text-outline" size={12} color="#9CA3AF" />
                    <Text style={styles.apptNotesText} numberOfLines={2}>{a.adminNotes}</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Send Nudge bottom sheet ──────────────────────────────────── */}
      <Modal visible={nudgeVisible} transparent animationType="none" onRequestClose={closeNudge}>
        <Animated.View style={[styles.backdrop, { opacity: nudgeBackdrop }]} pointerEvents="none" />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeNudge} activeOpacity={1} />
        <KeyboardAvoidingView
          style={styles.sheetPositioner}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY: nudgeSlide }] }]}>
            <View style={styles.handleWrap}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>Send Nudge</Text>
                <Text style={styles.sheetSubtitle}>Push notification + inbox message</Text>
              </View>
              <TouchableOpacity onPress={closeNudge} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <Text style={styles.fieldLabel}>Message</Text>
              <TextInput
                style={styles.nudgeInput}
                value={nudgeMsg}
                onChangeText={setNudgeMsg}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoCapitalize="sentences"
                placeholderTextColor="#9CA3AF"
              />

              <TouchableOpacity
                style={[styles.sendBtn, nudgeSending && styles.sendBtnDisabled]}
                onPress={sendNudge}
                disabled={nudgeSending}
                activeOpacity={0.85}
              >
                {nudgeSending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={15} color="#FFFFFF" />
                    <Text style={styles.sendBtnText}>Send Nudge</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {toastMsg && <Toast message={toastMsg} onHide={() => setToastMsg(null)} />}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F8FA' },

  // ── Header ──────────────────────────────────────────────────────────────────
  headerSafe: { backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 40 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSpacer: { width: 40 },

  scroll: { flex: 1 },
  content: { paddingBottom: 48 },

  // ── Profile ──────────────────────────────────────────────────────────────────
  profileSection: {
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarText: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactText: { fontSize: 14, color: '#9CA3AF' },
  memberSince: { fontSize: 12, color: '#6B7280', marginTop: 4 },

  // ── Stats ────────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  statCardMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#F3F4F6',
  },
  statValue: { fontSize: 17, fontWeight: '800', color: '#0A0A0A' },
  statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },

  // ── Banners ──────────────────────────────────────────────────────────────────
  inactiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  inactiveBannerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  inactiveBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  inactiveBannerSub: { fontSize: 12, color: '#B45309', marginTop: 2 },
  nudgeBtn: {
    backgroundColor: '#E09010',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  nudgeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  activeBannerText: { fontSize: 13, fontWeight: '600', color: '#065F46' },

  // ── Vehicles ────────────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0A0A',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 10,
  },
  vehicleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  vehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  vehiclePillText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  vehicleColor: { fontSize: 12, color: '#6B7280' },

  // ── Appointment cards ────────────────────────────────────────────────────────
  loader: { marginTop: 24 },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8, marginHorizontal: 16 },
  emptyTitle: { fontSize: 14, color: '#9CA3AF' },
  apptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  apptTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 10,
  },
  apptMain: { flex: 1, gap: 3 },
  apptService: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  apptVehicle: { fontSize: 12, color: '#6B7280' },
  apptDate: { fontSize: 12, color: '#9CA3AF' },
  apptRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  apptCharge: { fontSize: 13, fontWeight: '700', color: '#059669' },
  apptChargeNA: { fontSize: 12, color: '#9CA3AF' },
  apptNotes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  apptNotesText: { fontSize: 12, color: '#9CA3AF', flex: 1, lineHeight: 16 },

  // ── Nudge sheet ──────────────────────────────────────────────────────────────
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetPositioner: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
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
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0A0A0A' },
  sheetSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  sheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  nudgeInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0A0A0A',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E09010',
    borderRadius: 12,
    paddingVertical: 15,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
