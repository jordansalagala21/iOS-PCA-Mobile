import { Ionicons } from '@expo/vector-icons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { CustomerRootStackParamList, CustomerTabParamList } from '../../navigation/CustomerNavigator';
import { db } from '../../services/firebase';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<CustomerTabParamList>,
  NativeStackNavigationProp<CustomerRootStackParamList>
>;

type ApptStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';

type ApptDoc = {
  id: string;
  serviceName: string;
  type: 'one-time' | 'biweekly';
  date: string;
  timeSlot: string;
  vehicleDetails: string;
  vehicleColor?: string;
  status: ApptStatus;
  estimatedPrice: number;
  actualCharge: number | null;
  adminNotes?: string;
};

const STATUS_CONFIG: Record<ApptStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#6B7280', bg: '#F3F4F6' },
  'in-progress': { label: 'In Progress', color: '#D97706', bg: '#FEF3C7' },
  completed: { label: 'Completed', color: '#059669', bg: '#D1FAE5' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FEE2E2' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(t: string): string {
  const h = parseInt(t.split(':')[0], 10);
  if (h === 12) return '12:00 PM';
  if (h > 12) return `${h - 12}:00 PM`;
  return `${h}:00 AM`;
}

export function AppointmentsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const uid = user?.uid ?? '';
  const today = new Date().toISOString().split('T')[0];

  const [appointments, setAppointments] = useState<ApptDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'appointments'), where('customerId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ApptDoc)
          .sort((a, b) =>
            b.date !== a.date
              ? b.date.localeCompare(a.date)
              : b.timeSlot.localeCompare(a.timeSlot),
          );
        setAppointments(docs);
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        setLoading(false);
        setRefreshing(false);
      },
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, refreshKey]);

  const upcoming = appointments.filter(
    (a) => (a.status === 'pending' || a.status === 'in-progress') && a.date >= today,
  );
  const past = appointments.filter(
    (a) => a.status === 'completed' || a.status === 'cancelled' || a.date < today,
  );

  const handleCancel = (appt: ApptDoc) => {
    Alert.alert(
      'Cancel Appointment',
      'Cancel this appointment? This cannot be undone.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Appointment',
          style: 'destructive',
          onPress: () => {
            updateDoc(doc(db, 'appointments', appt.id), { status: 'cancelled' }).catch(() =>
              Alert.alert('Error', 'Could not cancel. Please try again.'),
            );
          },
        },
      ],
    );
  };

  const renderUpcomingCard = (appt: ApptDoc) => {
    const cfg = STATUS_CONFIG[appt.status];
    const vehicleLine = [appt.vehicleDetails, appt.vehicleColor].filter(Boolean).join(' · ');
    return (
      <View key={appt.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.serviceName} numberOfLines={1}>{appt.serviceName}</Text>
          <View style={appt.type === 'biweekly' ? styles.typeBadgeBiweekly : styles.typeBadgeOneTime}>
            <Text style={appt.type === 'biweekly' ? styles.typeBadgeBiweeklyText : styles.typeBadgeOneTimeText}>
              {appt.type === 'biweekly' ? 'Biweekly' : 'One-Time'}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={13} color="#9CA3AF" />
          <Text style={styles.detailText}>{formatDate(appt.date)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={13} color="#9CA3AF" />
          <Text style={styles.detailText}>{formatTime(appt.timeSlot)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="car-outline" size={13} color="#9CA3AF" />
          <Text style={styles.detailText} numberOfLines={1}>{vehicleLine}</Text>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.footerLeft}>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={styles.priceText}>From ${appt.estimatedPrice}</Text>
          </View>
          {appt.status === 'pending' && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => handleCancel(appt)}
              activeOpacity={0.75}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderPastCard = (appt: ApptDoc) => {
    const cfg = STATUS_CONFIG[appt.status];
    const vehicleLine = [appt.vehicleDetails, appt.vehicleColor].filter(Boolean).join(' · ');
    const isCharged = appt.status === 'completed' && appt.actualCharge !== null;

    return (
      <View key={appt.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.serviceName} numberOfLines={1}>{appt.serviceName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={13} color="#9CA3AF" />
          <Text style={styles.detailText}>
            {formatDate(appt.date)} · {formatTime(appt.timeSlot)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="car-outline" size={13} color="#9CA3AF" />
          <Text style={styles.detailText} numberOfLines={1}>{vehicleLine}</Text>
        </View>

        {appt.adminNotes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>{appt.adminNotes}</Text>
          </View>
        ) : null}

        <View style={styles.cardFooterSimple}>
          <Text style={isCharged ? styles.chargedText : styles.estText}>
            {isCharged ? `Charged: $${appt.actualCharge}` : `Est. $${appt.estimatedPrice}`}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ActivityIndicator color="#E94560" style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (appointments.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.container}>
          <View style={styles.emptyState}>
            <View style={styles.iconCircle}>
              <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyTitle}>No Appointments Yet</Text>
            <Text style={styles.emptyBody}>
              Your upcoming and past appointments will appear here once you book a service.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.bookButton}
            onPress={() => navigation.navigate('Book')}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.bookButtonText}>Book a Service</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E94560" />
        }
      >
        {/* ── Upcoming ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{upcoming.length}</Text>
          </View>
        </View>

        {upcoming.length === 0 ? (
          <View style={styles.inlineEmpty}>
            <Text style={styles.inlineEmptyText}>No upcoming appointments</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Book')} activeOpacity={0.75}>
              <Text style={styles.inlineBookLink}>Book a Service →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          upcoming.map(renderUpcomingCard)
        )}

        {/* ── Past ── */}
        <View style={[styles.sectionHeader, styles.sectionHeaderGap]}>
          <Text style={styles.sectionTitle}>Past</Text>
          <View style={[styles.countBadge, styles.countBadgeMuted]}>
            <Text style={[styles.countBadgeText, styles.countBadgeTextMuted]}>{past.length}</Text>
          </View>
        </View>

        {past.length === 0 ? (
          <View style={styles.inlineEmpty}>
            <Text style={styles.inlineEmptyText}>No past appointments yet</Text>
          </View>
        ) : (
          past.map(renderPastCard)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  loader: { flex: 1, marginTop: 80 },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },

  // ── Full empty state (preserved) ──────────────────────────────────────────
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', marginBottom: 40 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', marginBottom: 10 },
  emptyBody: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E94560',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  bookButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // ── Section headers ────────────────────────────────────────────────────────
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionHeaderGap: { marginTop: 32 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A2E' },
  countBadge: {
    backgroundColor: '#E94560',
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeMuted: { backgroundColor: '#F3F4F6' },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  countBadgeTextMuted: { color: '#9CA3AF' },

  // ── Inline empty ───────────────────────────────────────────────────────────
  inlineEmpty: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: '#F3F4F6',
    borderStyle: 'dashed',
  },
  inlineEmptyText: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  inlineBookLink: { fontSize: 14, fontWeight: '700', color: '#E94560' },

  // ── Appointment card ───────────────────────────────────────────────────────
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  serviceName: { fontSize: 15, fontWeight: '700', color: '#1A1A2E', flex: 1 },

  // type badges
  typeBadgeOneTime: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeBiweekly: {
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeOneTimeText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },
  typeBadgeBiweeklyText: { fontSize: 11, fontWeight: '700', color: '#059669' },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  detailText: { fontSize: 13, color: '#6B7280', flex: 1 },

  // status badge (shared)
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  // upcoming card footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priceText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  cancelBtn: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelBtnText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  // past card footer
  cardFooterSimple: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  chargedText: { fontSize: 13, fontWeight: '700', color: '#059669' },
  estText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },

  // admin notes
  notesBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  notesText: { fontSize: 12, color: '#6B7280', fontStyle: 'italic', lineHeight: 18 },
});
