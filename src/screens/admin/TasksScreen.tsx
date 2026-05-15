import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type ApptStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';
type ActiveStatus = 'pending' | 'in-progress' | 'completed';
type DateFilter = 'week' | 'month' | 'all';

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

type NjCustomer = { id: string; fullName: string; phone: string; email: string };
type NjService = { id: string; name: string; priceFrom: number };
type NjVehicle = { id: string; label: string };

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<ApptStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#6B7280', bg: '#F3F4F6' },
  'in-progress': { label: 'In Progress', color: '#D97706', bg: '#FEF3C7' },
  completed: { label: 'Completed', color: '#059669', bg: '#D1FAE5' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FEE2E2' },
};

const STATUS_ORDER: ActiveStatus[] = ['pending', 'in-progress', 'completed'];

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
];

const AVATAR_COLORS = ['#E09010', '#4F46E5', '#059669', '#D97706', '#7C3AED', '#0891B2'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(t: string): string {
  const h = parseInt(t.split(':')[0], 10);
  if (h === 12) return '12:00 PM';
  if (h > 12) return `${h - 12}:00 PM`;
  return `${h}:00 AM`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] ?? '?').toUpperCase();
}

function avatarBg(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

function isWithinFilter(dateStr: string, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const apptDate = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  if (filter === 'week') {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    return apptDate >= cutoff;
  }
  return (
    apptDate.getMonth() === now.getMonth() &&
    apptDate.getFullYear() === now.getFullYear()
  );
}

function openSheet(
  slideAnim: Animated.Value,
  backdropAnim: Animated.Value,
) {
  slideAnim.setValue(600);
  backdropAnim.setValue(0);
  Animated.parallel([
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
    Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
  ]).start();
}

function closeSheet(
  slideAnim: Animated.Value,
  backdropAnim: Animated.Value,
  onDone: () => void,
) {
  Animated.parallel([
    Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }),
    Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
  ]).start(onDone);
}

// ── TasksScreen ───────────────────────────────────────────────────────────────

export function TasksScreen() {
  const today = new Date().toISOString().split('T')[0];

  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  // ── Active tab data ───────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState<ApptDoc[]>([]);
  const [completedToday, setCompletedToday] = useState<ApptDoc[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);

  // ── History tab data ──────────────────────────────────────────────────────
  const [historyAppts, setHistoryAppts] = useState<ApptDoc[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<DateFilter>('month');

  // ── Edit sheet state (Active tab) ─────────────────────────────────────────
  const [editingAppt, setEditingAppt] = useState<ApptDoc | null>(null);
  const [formStatus, setFormStatus] = useState<ActiveStatus>('pending');
  const [formCharge, setFormCharge] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Detail sheet state (History tab) ─────────────────────────────────────
  const [viewingAppt, setViewingAppt] = useState<ApptDoc | null>(null);

  // ── Animation refs ────────────────────────────────────────────────────────
  const editSlideAnim = useRef(new Animated.Value(600)).current;
  const editBackdropAnim = useRef(new Animated.Value(0)).current;
  const detailSlideAnim = useRef(new Animated.Value(600)).current;
  const detailBackdropAnim = useRef(new Animated.Value(0)).current;

  // ── New Walk-in Job state ─────────────────────────────────────────────────
  const [showNewJob, setShowNewJob] = useState(false);
  const [njCustomers, setNjCustomers] = useState<NjCustomer[]>([]);
  const [njCustomerSearch, setNjCustomerSearch] = useState('');
  const [njSelectedCustomer, setNjSelectedCustomer] = useState<NjCustomer | null>(null);
  const [njServices, setNjServices] = useState<NjService[]>([]);
  const [njSelectedService, setNjSelectedService] = useState<NjService | null>(null);
  const [njDate, setNjDate] = useState('');
  const [njSelectedSlot, setNjSelectedSlot] = useState<string | null>(null);
  const [njSlotCounts, setNjSlotCounts] = useState<Record<string, number>>({});
  const [njSlotsLoading, setNjSlotsLoading] = useState(false);
  const [njVehicles, setNjVehicles] = useState<NjVehicle[]>([]);
  const [njSelectedVehicle, setNjSelectedVehicle] = useState<NjVehicle | null>(null);
  const [njVehicleManual, setNjVehicleManual] = useState('');
  const [njStatus, setNjStatus] = useState<'pending' | 'in-progress'>('pending');
  const [njCharge, setNjCharge] = useState('');
  const [njNotes, setNjNotes] = useState('');
  const [njSaving, setNjSaving] = useState(false);
  const [njError, setNjError] = useState<string | null>(null);

  // ── Active: onSnapshot for today's appointments ───────────────────────────

  // All pending + in-progress appointments (any date)
  useEffect(() => {
    const q = query(
      collection(db, 'appointments'),
      where('status', 'in', ['pending', 'in-progress']),
    );
    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ApptDoc)
          .sort((a, b) =>
            a.date !== b.date
              ? a.date.localeCompare(b.date)
              : a.timeSlot.localeCompare(b.timeSlot),
          );
        setAppointments(data);
        setLoadingActive(false);
      },
      () => setLoadingActive(false),
    );
  }, []);

  // Today's completed jobs (separate listener)
  useEffect(() => {
    const q = query(collection(db, 'appointments'), where('date', '==', today));
    return onSnapshot(q, (snap) => {
      setCompletedToday(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ApptDoc)
          .filter((a) => a.status === 'completed'),
      );
    });
  }, [today]);

  // ── History: getDocs on tab switch ────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'appointments'),
        where('status', 'in', ['completed', 'cancelled']),
      );
      const snap = await getDocs(q);
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as ApptDoc)
        .sort((a, b) =>
          b.date !== a.date
            ? b.date.localeCompare(a.date)
            : b.timeSlot.localeCompare(a.timeSlot),
        );
      setHistoryAppts(data);
    } catch {
      // fail silently — list stays empty
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  // ── Animate edit sheet ────────────────────────────────────────────────────

  useEffect(() => {
    if (!editingAppt) return;
    openSheet(editSlideAnim, editBackdropAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAppt]);

  // ── Animate detail sheet ──────────────────────────────────────────────────

  useEffect(() => {
    if (!viewingAppt) return;
    openSheet(detailSlideAnim, detailBackdropAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingAppt]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openEdit = (appt: ApptDoc) => {
    const safeStatus: ActiveStatus =
      appt.status === 'cancelled' ? 'pending' : appt.status;
    setFormStatus(safeStatus);
    setFormCharge(appt.actualCharge !== null ? String(appt.actualCharge) : '');
    setFormNotes(appt.adminNotes ?? '');
    setChargeError(null);
    setSaving(false);
    setEditingAppt(appt);
  };

  const closeEdit = () => {
    closeSheet(editSlideAnim, editBackdropAnim, () => setEditingAppt(null));
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

  const openDetail = (appt: ApptDoc) => setViewingAppt(appt);

  const closeDetail = () => {
    closeSheet(detailSlideAnim, detailBackdropAnim, () => setViewingAppt(null));
  };

  // ── New Walk-in Job handlers ───────────────────────────────────────────────

  const openNewJob = async () => {
    setNjSelectedCustomer(null);
    setNjCustomerSearch('');
    setNjSelectedService(null);
    setNjDate('');
    setNjSelectedSlot(null);
    setNjSlotCounts({});
    setNjVehicles([]);
    setNjSelectedVehicle(null);
    setNjVehicleManual('');
    setNjStatus('pending');
    setNjCharge('');
    setNjNotes('');
    setNjSaving(false);
    setNjError(null);
    setShowNewJob(true);
    // Load customers + services in parallel
    const [custSnap, svcSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', '==', 'customer'))),
      getDocs(collection(db, 'services')),
    ]);
    setNjCustomers(
      custSnap.docs.map((d) => ({
        id: d.id,
        fullName: d.data().fullName ?? d.data().displayName ?? 'Unknown',
        phone: d.data().phone ?? '',
        email: d.data().email ?? '',
      })).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    );
    setNjServices(
      svcSnap.docs
        .filter((d) => d.data().active !== false)
        .map((d) => ({ id: d.id, name: d.data().name ?? '', priceFrom: d.data().priceFrom ?? 0 }))
        .sort((a, b) => a.priceFrom - b.priceFrom),
    );
  };

  const handleNjCustomerSelect = async (c: NjCustomer) => {
    setNjSelectedCustomer(c);
    setNjSelectedVehicle(null);
    setNjVehicleManual('');
    try {
      const snap = await getDocs(collection(db, 'users', c.id, 'vehicles'));
      setNjVehicles(
        snap.docs.map((d) => ({
          id: d.id,
          label: [d.data().year, d.data().make, d.data().model].filter(Boolean).join(' ') ||
            d.data().nickname || 'Vehicle',
        })),
      );
    } catch {
      setNjVehicles([]);
    }
  };

  const handleNjDateChange = async (text: string) => {
    setNjDate(text);
    setNjSelectedSlot(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) { setNjSlotCounts({}); return; }
    setNjSlotsLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'appointments'), where('date', '==', text)),
      );
      const counts: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const slot = d.data().timeSlot as string;
        if (slot) counts[slot] = (counts[slot] ?? 0) + 1;
      });
      setNjSlotCounts(counts);
    } catch { setNjSlotCounts({}); }
    finally { setNjSlotsLoading(false); }
  };

  const handleNjSave = async () => {
    if (!njSelectedCustomer || !njSelectedService) {
      setNjError('Select a customer and service.'); return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(njDate)) {
      setNjError('Enter a valid date (YYYY-MM-DD).'); return;
    }
    if (!njSelectedSlot) { setNjError('Select a time slot.'); return; }
    const vehicleDetails = njSelectedVehicle ? njSelectedVehicle.label : njVehicleManual.trim();
    if (!vehicleDetails) { setNjError('Enter vehicle details.'); return; }

    setNjSaving(true);
    setNjError(null);
    try {
      await addDoc(collection(db, 'appointments'), {
        customerId: njSelectedCustomer.id,
        customerName: njSelectedCustomer.fullName,
        serviceId: njSelectedService.id,
        serviceName: njSelectedService.name,
        vehicleId: njSelectedVehicle?.id ?? null,
        vehicleDetails,
        vehicleColor: null,
        date: njDate,
        timeSlot: njSelectedSlot,
        type: 'one-time',
        status: njStatus,
        estimatedPrice: njSelectedService.priceFrom,
        actualCharge: njCharge.trim() ? parseFloat(njCharge) : null,
        adminNotes: njNotes.trim() || null,
        bookedByAdmin: true,
        createdAt: serverTimestamp(),
      });
      setShowNewJob(false);
    } catch {
      setNjError('Failed to save. Please try again.');
      setNjSaving(false);
    }
  };

  const njFilteredCustomers = useMemo(() => {
    const q = njCustomerSearch.trim().toLowerCase();
    if (!q) return njCustomers;
    return njCustomers.filter(
      (c) => c.fullName.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [njCustomers, njCustomerSearch]);

  // ── Derived: Active ───────────────────────────────────────────────────────

  // appointments = all pending + in-progress (any date); completedToday = today's completed
  const activeJobs = appointments; // already filtered by status in the listener
  const pendingCount = appointments.filter((a) => a.status === 'pending').length;

  // ── Derived: History ──────────────────────────────────────────────────────

  const filteredHistory = useMemo(() => {
    let result = historyAppts;
    if (historyDateFilter !== 'all') {
      result = result.filter((a) => isWithinFilter(a.date, historyDateFilter));
    }
    const q = historySearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (a) =>
          a.customerName.toLowerCase().includes(q) ||
          a.serviceName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [historyAppts, historyDateFilter, historySearch]);

  // ── Active job card ───────────────────────────────────────────────────────

  const renderActiveCard = (appt: ApptDoc) => {
    const cfg = STATUS_CONFIG[appt.status];
    const vehicleLine = [appt.vehicleDetails, appt.vehicleColor].filter(Boolean).join(' · ');
    return (
      <View key={appt.id} style={[styles.card, { borderLeftColor: cfg.color }]}>
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: avatarBg(appt.customerName) }]}>
            <Text style={styles.avatarText}>{initials(appt.customerName)}</Text>
          </View>
          <View style={styles.cardMain}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardCustomerName} numberOfLines={1}>
                {appt.customerName}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
            <Text style={styles.cardVehicle} numberOfLines={1}>{vehicleLine}</Text>
            <Text style={styles.cardService} numberOfLines={1}>
              {appt.serviceName} · {formatTime(appt.timeSlot)}
            </Text>
            <View style={styles.cardDateRow}>
              <Ionicons name="calendar-outline" size={12} color="#E09010" />
              <Text style={styles.cardDate}>{formatDate(appt.date)}</Text>
              {appt.date === today && (
                <View style={styles.todayPill}><Text style={styles.todayPillText}>Today</Text></View>
              )}
            </View>
          </View>
        </View>

        {Boolean(appt.adminNotes) && (
          <View style={styles.notesRow}>
            <Ionicons name="document-text-outline" size={12} color="#9CA3AF" />
            <Text style={styles.notesRowText} numberOfLines={2}>{appt.adminNotes}</Text>
          </View>
        )}

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
            <Ionicons name="pencil-outline" size={13} color="#E09010" />
            <Text style={styles.updateBtnText}>Update Job</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── History card ──────────────────────────────────────────────────────────

  const renderHistoryCard = (appt: ApptDoc) => {
    const cfg = STATUS_CONFIG[appt.status];
    const vehicleLine = [appt.vehicleDetails, appt.vehicleColor].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity
        key={appt.id}
        style={[styles.card, { borderLeftColor: cfg.color }]}
        onPress={() => openDetail(appt)}
        activeOpacity={0.75}
      >
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: avatarBg(appt.customerName) }]}>
            <Text style={styles.avatarText}>{initials(appt.customerName)}</Text>
          </View>
          <View style={styles.cardMain}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardCustomerName} numberOfLines={1}>
                {appt.customerName}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
            <Text style={styles.cardVehicle} numberOfLines={1}>{vehicleLine}</Text>
            <Text style={styles.cardService} numberOfLines={1}>{appt.serviceName}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.historyMeta}>
            <Ionicons name="calendar-outline" size={12} color="#9CA3AF" />
            <Text style={styles.historyMetaText}>{formatDate(appt.date)} · {formatTime(appt.timeSlot)}</Text>
          </View>
          {appt.actualCharge !== null ? (
            <Text style={styles.chargedText}>${appt.actualCharge}</Text>
          ) : (
            <Text style={styles.estText}>N/A</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>

      {/* ── Segmented control ────────────────────────────────────────────── */}
      <View style={styles.segmentWrap}>
        {(['active', 'history'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.segmentBtn, activeTab === tab && styles.segmentBtnActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.75}
          >
            <Text style={[styles.segmentText, activeTab === tab && styles.segmentTextActive]}>
              {tab === 'active' ? 'Active' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── ACTIVE TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'active' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* New Walk-in Job button */}
          <TouchableOpacity style={styles.newJobBtn} onPress={openNewJob} activeOpacity={0.85}>
            <Ionicons name="add-circle" size={18} color="#0A0A0A" />
            <Text style={styles.newJobBtnText}>New Walk-in Job</Text>
          </TouchableOpacity>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: 'Active Jobs', value: String(appointments.length), icon: 'briefcase-outline' as const },
              { label: 'Pending', value: String(pendingCount), icon: 'time-outline' as const },
              { label: 'Done Today', value: String(completedToday.length), icon: 'checkmark-done-outline' as const },
            ].map((stat) => (
              <View key={stat.label} style={styles.statCard}>
                <Ionicons name={stat.icon} size={20} color="#E09010" />
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {loadingActive ? (
            <ActivityIndicator color="#E09010" style={styles.loader} />
          ) : (
            <>
              <Text style={styles.sectionTitle}>Active Jobs</Text>
              {activeJobs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-circle-outline" size={36} color="#D1D5DB" />
                  <Text style={styles.emptyTitle}>All clear!</Text>
                  <Text style={styles.emptySub}>No active jobs scheduled for today</Text>
                </View>
              ) : (
                activeJobs.map(renderActiveCard)
              )}

              {completedToday.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, styles.sectionTitleGap]}>
                    Completed Today
                  </Text>
                  {completedToday.map(renderActiveCard)}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── HISTORY TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <>
          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              value={historySearch}
              onChangeText={setHistorySearch}
              placeholder="Search customer or service…"
              placeholderTextColor="#9CA3AF"
              clearButtonMode="while-editing"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Date filter chips */}
          <View style={styles.filterRow}>
            {([
              { key: 'week', label: 'This Week' },
              { key: 'month', label: 'This Month' },
              { key: 'all', label: 'All Time' },
            ] as { key: DateFilter; label: string }[]).map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, historyDateFilter === f.key && styles.filterChipActive]}
                onPress={() => setHistoryDateFilter(f.key)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    historyDateFilter === f.key && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={fetchHistory}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="refresh-outline" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {loadingHistory ? (
              <ActivityIndicator color="#E09010" style={styles.loader} />
            ) : filteredHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={36} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>
                  {historySearch.trim() ? 'No results' : 'No history yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {historySearch.trim()
                    ? 'Try a different name or service'
                    : 'Completed and cancelled jobs will appear here'}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.historyCount}>
                  {filteredHistory.length} {filteredHistory.length === 1 ? 'job' : 'jobs'}
                </Text>
                {filteredHistory.map(renderHistoryCard)}
              </>
            )}
          </ScrollView>
        </>
      )}

      {/* ── Update Job bottom sheet ──────────────────────────────────────── */}
      <Modal
        visible={editingAppt !== null}
        transparent
        animationType="none"
        onRequestClose={closeEdit}
      >
        <Animated.View
          style={[styles.backdrop, { opacity: editBackdropAnim }]}
          pointerEvents="none"
        />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeEdit} activeOpacity={1} />
        <KeyboardAvoidingView
          style={styles.sheetPositioner}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY: editSlideAnim }] }]}>
            <View style={styles.handleWrap}>
              <View style={styles.dragHandle} />
            </View>

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

      {/* ── Job Detail sheet (read-only) ─────────────────────────────────── */}
      <Modal
        visible={viewingAppt !== null}
        transparent
        animationType="none"
        onRequestClose={closeDetail}
      >
        <Animated.View
          style={[styles.backdrop, { opacity: detailBackdropAnim }]}
          pointerEvents="none"
        />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeDetail} activeOpacity={1} />
        <KeyboardAvoidingView
          style={styles.sheetPositioner}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY: detailSlideAnim }] }]}>
            <View style={styles.handleWrap}>
              <View style={styles.dragHandle} />
            </View>

            {/* Detail header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <View style={styles.detailNameRow}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {viewingAppt?.customerName}
                  </Text>
                  {viewingAppt && (
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: STATUS_CONFIG[viewingAppt.status].bg, marginLeft: 8 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: STATUS_CONFIG[viewingAppt.status].color },
                        ]}
                      >
                        {STATUS_CONFIG[viewingAppt.status].label}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sheetSubtitle}>{viewingAppt?.serviceName}</Text>
              </View>
              <TouchableOpacity
                onPress={closeDetail}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.detailScroll}
            >
              {[
                {
                  icon: 'calendar-outline' as const,
                  label: 'Date',
                  value: viewingAppt ? formatDate(viewingAppt.date) : '',
                },
                {
                  icon: 'time-outline' as const,
                  label: 'Time',
                  value: viewingAppt ? formatTime(viewingAppt.timeSlot) : '',
                },
                {
                  icon: 'car-outline' as const,
                  label: 'Vehicle',
                  value: viewingAppt
                    ? [viewingAppt.vehicleDetails, viewingAppt.vehicleColor]
                        .filter(Boolean)
                        .join(' · ')
                    : '',
                },
                {
                  icon: 'repeat-outline' as const,
                  label: 'Type',
                  value: viewingAppt?.type === 'biweekly' ? 'Biweekly' : 'One-Time',
                },
                {
                  icon: 'cash-outline' as const,
                  label: 'Charged',
                  value:
                    viewingAppt?.actualCharge !== null && viewingAppt?.actualCharge !== undefined
                      ? `$${viewingAppt.actualCharge}`
                      : 'N/A',
                },
              ].map((row) => (
                <View key={row.label} style={styles.detailRow}>
                  <View style={styles.detailIconWrap}>
                    <Ionicons name={row.icon} size={16} color="#E09010" />
                  </View>
                  <View style={styles.detailRowText}>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={styles.detailValue}>{row.value}</Text>
                  </View>
                </View>
              ))}

              {viewingAppt?.adminNotes ? (
                <View style={styles.detailNotesWrap}>
                  <Text style={styles.detailLabel}>Admin Notes</Text>
                  <View style={styles.detailNotesBox}>
                    <Text style={styles.detailNotesText}>{viewingAppt.adminNotes}</Text>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── New Walk-in Job full-screen modal ───────────────────────────── */}
      <Modal
        visible={showNewJob}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNewJob(false)}
      >
        <SafeAreaView style={njStyles.safe} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={njStyles.header}>
            <TouchableOpacity onPress={() => setShowNewJob(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={njStyles.headerTitle}>New Walk-in Job</Text>
            <View style={{ width: 24 }} />
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              contentContainerStyle={njStyles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ── Customer ── */}
              <Text style={njStyles.sectionLabel}>CUSTOMER</Text>
              {!njSelectedCustomer ? (
                <>
                  <View style={njStyles.searchWrap}>
                    <Ionicons name="search-outline" size={16} color="#9CA3AF" />
                    <TextInput
                      style={njStyles.searchInput}
                      value={njCustomerSearch}
                      onChangeText={setNjCustomerSearch}
                      placeholder="Search name or phone…"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  {njFilteredCustomers.slice(0, 6).map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={njStyles.listItem}
                      onPress={() => handleNjCustomerSelect(c)}
                      activeOpacity={0.75}
                    >
                      <View style={njStyles.listItemIcon}>
                        <Ionicons name="person-outline" size={16} color="#E09010" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={njStyles.listItemTitle}>{c.fullName}</Text>
                        <Text style={njStyles.listItemSub}>{c.phone || c.email}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                    </TouchableOpacity>
                  ))}
                  {njCustomers.length === 0 && (
                    <Text style={njStyles.emptyHint}>Loading customers…</Text>
                  )}
                </>
              ) : (
                <View style={njStyles.selectedCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={njStyles.selectedCardTitle}>{njSelectedCustomer.fullName}</Text>
                    <Text style={njStyles.selectedCardSub}>{njSelectedCustomer.phone}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setNjSelectedCustomer(null); setNjVehicles([]); }}>
                    <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Service ── */}
              <Text style={[njStyles.sectionLabel, { marginTop: 20 }]}>SERVICE</Text>
              {njServices.map((s) => {
                const sel = njSelectedService?.id === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[njStyles.listItem, sel && njStyles.listItemSelected]}
                    onPress={() => setNjSelectedService(s)}
                    activeOpacity={0.75}
                  >
                    <Text style={[njStyles.listItemTitle, sel && njStyles.listItemTitleSel]}>{s.name}</Text>
                    <Text style={[njStyles.listItemSub, sel && njStyles.listItemSubSel]}>From ${s.priceFrom}</Text>
                    {sel && <Ionicons name="checkmark-circle" size={18} color="#E09010" style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>
                );
              })}

              {/* ── Date & Time ── */}
              <Text style={[njStyles.sectionLabel, { marginTop: 20 }]}>DATE & TIME</Text>
              <View style={njStyles.fieldWrap}>
                <Text style={njStyles.fieldLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={njStyles.fieldInput}
                  value={njDate}
                  onChangeText={handleNjDateChange}
                  placeholder="2026-06-15"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              {njDate.length === 10 && (
                njSlotsLoading ? (
                  <ActivityIndicator color="#E09010" style={{ marginVertical: 12 }} />
                ) : (
                  <View style={njStyles.slotsGrid}>
                    {TIME_SLOTS.map((slot) => {
                      const count = njSlotCounts[slot] ?? 0;
                      const full = count >= 2;
                      const sel = njSelectedSlot === slot;
                      return (
                        <TouchableOpacity
                          key={slot}
                          style={[njStyles.slotPill, sel && njStyles.slotPillSel, full && njStyles.slotPillFull]}
                          onPress={() => !full && setNjSelectedSlot(slot)}
                          disabled={full}
                          activeOpacity={0.7}
                        >
                          <Text style={[njStyles.slotTime, sel && njStyles.slotTimeSel, full && njStyles.slotTimeFull]}>
                            {formatTime(slot)}
                          </Text>
                          {full && <Text style={njStyles.slotFullText}>Full</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )
              )}

              {/* ── Vehicle ── */}
              <Text style={[njStyles.sectionLabel, { marginTop: 20 }]}>VEHICLE</Text>
              {njVehicles.length > 0 ? (
                njVehicles.map((v) => {
                  const sel = njSelectedVehicle?.id === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[njStyles.listItem, sel && njStyles.listItemSelected]}
                      onPress={() => setNjSelectedVehicle(v)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="car-outline" size={16} color={sel ? '#E09010' : '#9CA3AF'} style={{ marginRight: 10 }} />
                      <Text style={[njStyles.listItemTitle, sel && njStyles.listItemTitleSel]}>{v.label}</Text>
                      {sel && <Ionicons name="checkmark-circle" size={18} color="#E09010" style={{ marginLeft: 'auto' }} />}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={njStyles.fieldWrap}>
                  <Text style={njStyles.fieldLabel}>Vehicle details</Text>
                  <TextInput
                    style={njStyles.fieldInput}
                    value={njVehicleManual}
                    onChangeText={setNjVehicleManual}
                    placeholder="e.g. 2022 Toyota Camry"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                </View>
              )}

              {/* ── Job Details ── */}
              <Text style={[njStyles.sectionLabel, { marginTop: 20 }]}>JOB DETAILS</Text>

              <View style={njStyles.fieldWrap}>
                <Text style={njStyles.fieldLabel}>Initial Status</Text>
                <View style={njStyles.statusRow}>
                  {(['pending', 'in-progress'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[njStyles.statusBtn, njStatus === s && njStyles.statusBtnActive]}
                      onPress={() => setNjStatus(s)}
                      activeOpacity={0.75}
                    >
                      <Text style={[njStyles.statusBtnText, njStatus === s && njStyles.statusBtnTextActive]}>
                        {s === 'pending' ? 'Pending' : 'In Progress'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={njStyles.fieldWrap}>
                <Text style={njStyles.fieldLabel}>Actual Charge (optional)</Text>
                <View style={njStyles.prefixWrap}>
                  <Text style={njStyles.prefix}>$</Text>
                  <TextInput
                    style={njStyles.prefixInput}
                    value={njCharge}
                    onChangeText={setNjCharge}
                    placeholder={String(njSelectedService?.priceFrom ?? '')}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={njStyles.fieldWrap}>
                <Text style={njStyles.fieldLabel}>Admin Notes (optional)</Text>
                <TextInput
                  style={[njStyles.fieldInput, njStyles.textArea]}
                  value={njNotes}
                  onChangeText={setNjNotes}
                  placeholder="Any notes about this job…"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                />
              </View>

              {njError && (
                <View style={njStyles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                  <Text style={njStyles.errorBannerText}>{njError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[njStyles.saveBtn, njSaving && njStyles.saveBtnDisabled]}
                onPress={handleNjSave}
                disabled={njSaving}
                activeOpacity={0.85}
              >
                {njSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#0A0A0A" />
                    <Text style={njStyles.saveBtnText}>Create Job</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 48 },

  // ── Segmented control ──────────────────────────────────────────────────────
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  segmentTextActive: { color: '#0A0A0A' },

  // ── History search & filter ────────────────────────────────────────────────
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0A0A0A', paddingVertical: 0 },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: { backgroundColor: '#0A0A0A' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#FFFFFF' },
  refreshBtn: { marginLeft: 'auto', padding: 4 },

  historyCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 10,
    letterSpacing: 0.2,
  },

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
  statValue: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  statLabel: { fontSize: 11, color: '#6B7280', textAlign: 'center' },

  // ── Section titles ─────────────────────────────────────────────────────────
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0A0A0A', marginBottom: 12 },
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
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
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
  cardCustomerName: { fontSize: 15, fontWeight: '700', color: '#0A0A0A', flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  cardVehicle: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  cardService: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  cardDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  cardDate: { fontSize: 12, fontWeight: '700', color: '#E09010' },
  todayPill: {
    backgroundColor: '#E09010',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  todayPillText: { fontSize: 9, fontWeight: '800', color: '#0A0A0A' },
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
  updateBtnText: { fontSize: 12, fontWeight: '700', color: '#E09010' },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  historyMetaText: { fontSize: 12, color: '#9CA3AF' },

  // ── Bottom sheet shared ────────────────────────────────────────────────────
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
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
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0A0A0A' },
  sheetSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  formScroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },

  // ── Edit sheet form ────────────────────────────────────────────────────────
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 10 },
  fieldSection: { marginTop: 24 },
  fieldWrap: {},
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 7 },
  optional: { fontWeight: '400', color: '#9CA3AF' },
  statusGroup: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  statusSep: { width: 1.5, backgroundColor: '#E5E7EB' },
  statusBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  statusBtnText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  statusBtnTextActive: { color: '#FFFFFF' },
  prefixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    overflow: 'hidden',
  },
  prefix: { paddingLeft: 14, paddingRight: 4, fontSize: 15, fontWeight: '600', color: '#6B7280' },
  prefixInput: { flex: 1, paddingVertical: 12, paddingRight: 14, fontSize: 15, color: '#0A0A0A' },
  inputError: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  errorText: { fontSize: 12, color: '#DC2626', marginTop: 4 },
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
  textArea: { minHeight: 88, paddingTop: 12 },
  saveBtn: {
    backgroundColor: '#E09010',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 4,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  // ── Detail sheet ───────────────────────────────────────────────────────────
  detailNameRow: { flexDirection: 'row', alignItems: 'center' },
  detailScroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  detailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRowText: { flex: 1, justifyContent: 'center' },
  detailLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.4, marginBottom: 2 },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#0A0A0A' },
  detailNotesWrap: { marginTop: 16 },
  detailNotesBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 14,
    marginTop: 6,
  },
  detailNotesText: { fontSize: 14, color: '#374151', lineHeight: 20 },

  // ── New Walk-in Job button ─────────────────────────────────────────────────
  newJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E09010',
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 20,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  newJobBtnText: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
});

// ── New Job Modal Styles ───────────────────────────────────────────────────────

const njStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0A0A0A', paddingVertical: 0 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  listItemSelected: { borderColor: '#E09010', backgroundColor: '#FFFBF0' },
  listItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(224,144,16,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  listItemTitle: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  listItemTitleSel: { color: '#0A0A0A' },
  listItemSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  listItemSubSel: { color: '#6B7280' },
  emptyHint: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginVertical: 12 },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
  },
  selectedCardTitle: { fontSize: 14, fontWeight: '700', color: '#065F46' },
  selectedCardSub: { fontSize: 12, color: '#059669', marginTop: 2 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', letterSpacing: 0.2, marginBottom: 7 },
  fieldInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0A0A0A',
  },
  textArea: { minHeight: 80, paddingTop: 12 },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  slotPill: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    minWidth: 76,
  },
  slotPillSel: { borderColor: '#E09010', backgroundColor: 'rgba(224,144,16,0.08)' },
  slotPillFull: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  slotTime: { fontSize: 13, fontWeight: '600', color: '#0A0A0A' },
  slotTimeSel: { color: '#E09010' },
  slotTimeFull: { color: '#D1D5DB' },
  slotFullText: { fontSize: 9, color: '#D1D5DB', marginTop: 2 },
  statusRow: { flexDirection: 'row', gap: 10 },
  statusBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statusBtnActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  statusBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  statusBtnTextActive: { color: '#FFFFFF' },
  prefixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    overflow: 'hidden',
  },
  prefix: { paddingLeft: 14, paddingRight: 4, fontSize: 15, fontWeight: '600', color: '#6B7280' },
  prefixInput: { flex: 1, paddingVertical: 12, paddingRight: 14, fontSize: 15, color: '#0A0A0A' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerText: { fontSize: 13, color: '#DC2626', flex: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E09010',
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#0A0A0A', fontSize: 16, fontWeight: '700' },
});
