import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../services/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

type ApptDoc = {
  id: string;
  status: string;
  actualCharge: number | null;
  date: string; // 'YYYY-MM-DD'
  serviceName: string;
};

type SubDoc = { id: string; active: boolean };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shortMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });
}

function last6MonthKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

function apptMonthKey(appt: ApptDoc): string {
  return appt.date.slice(0, 7); // 'YYYY-MM'
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ width, height, radius = 8, style }: {
  width: number | string; height: number; radius?: number; style?: object;
}) {
  return (
    <View
      style={[
        { width: width as number, height, borderRadius: radius, backgroundColor: '#F3F4F6' },
        style,
      ]}
    />
  );
}

// ── AnalyticsScreen ───────────────────────────────────────────────────────────

export function AnalyticsScreen() {
  const [appts, setAppts] = useState<ApptDoc[]>([]);
  const [subs, setSubs] = useState<SubDoc[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(true);

  const loading = loadingAppts || loadingSubs;

  // ── Firestore subscriptions ────────────────────────────────────────────────

  useEffect(() => {
    const q = query(collection(db, 'appointments'));
    return onSnapshot(
      q,
      (snap) => {
        setAppts(
          snap.docs.map((d) => ({
            id: d.id,
            status: d.data().status ?? '',
            actualCharge: typeof d.data().actualCharge === 'number' ? d.data().actualCharge : null,
            date: d.data().date ?? '',
            serviceName: d.data().serviceName ?? 'Unknown',
          })),
        );
        setLoadingAppts(false);
      },
      () => setLoadingAppts(false),
    );
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'subscriptions'), where('active', '==', true));
    return onSnapshot(
      q,
      (snap) => {
        setSubs(snap.docs.map((d) => ({ id: d.id, active: true })));
        setLoadingSubs(false);
      },
      () => setLoadingSubs(false),
    );
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const currentMonthKey = monthKey(new Date());
  const months6 = useMemo(() => last6MonthKeys(), []);

  const stats = useMemo(() => {
    const thisMonth = appts.filter((a) => apptMonthKey(a) === currentMonthKey);
    const completed = thisMonth.filter((a) => a.status === 'completed');
    const cancelled = thisMonth.filter((a) => a.status === 'cancelled');

    const revenueMTD = completed.reduce((sum, a) => sum + (a.actualCharge ?? 0), 0);
    const jobsThisMonth = thisMonth.length;
    const avgTicket = completed.length > 0 ? revenueMTD / completed.length : 0;

    return {
      revenueMTD,
      jobsThisMonth,
      avgTicket,
      cancellations: cancelled.length,
      activeSubs: subs.length,
    };
  }, [appts, subs, currentMonthKey]);

  const topServices = useMemo(() => {
    const completed = appts.filter((a) => a.status === 'completed');
    const counts: Record<string, number> = {};
    completed.forEach((a) => {
      counts[a.serviceName] = (counts[a.serviceName] ?? 0) + 1;
    });
    const total = completed.length;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({ name, count, pct: total > 0 ? count / total : 0 }));
  }, [appts]);

  const revenueTrend = useMemo(() => {
    const byMonth: Record<string, number> = {};
    months6.forEach((k) => { byMonth[k] = 0; });
    appts
      .filter((a) => a.status === 'completed' && months6.includes(apptMonthKey(a)))
      .forEach((a) => {
        const k = apptMonthKey(a);
        byMonth[k] = (byMonth[k] ?? 0) + (a.actualCharge ?? 0);
      });
    return months6.map((k) => ({ key: k, label: shortMonth(k), value: byMonth[k] }));
  }, [appts, months6]);

  const maxTrend = useMemo(
    () => Math.max(...revenueTrend.map((r) => r.value), 1),
    [revenueTrend],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const STAT_CARDS = [
    {
      label: 'Revenue MTD',
      icon: 'cash-outline' as const,
      value: formatCurrency(stats.revenueMTD),
      accent: '#E94560',
      bg: '#FFF1F3',
    },
    {
      label: 'Jobs This Month',
      icon: 'briefcase-outline' as const,
      value: String(stats.jobsThisMonth),
      accent: '#4F46E5',
      bg: '#EEF2FF',
    },
    {
      label: 'Avg Ticket',
      icon: 'trending-up-outline' as const,
      value: formatCurrency(stats.avgTicket),
      accent: '#059669',
      bg: '#D1FAE5',
    },
    {
      label: 'Cancellations',
      icon: 'close-circle-outline' as const,
      value: String(stats.cancellations),
      accent: '#D97706',
      bg: '#FEF3C7',
    },
    {
      label: 'Active Subs',
      icon: 'repeat-outline' as const,
      value: String(stats.activeSubs),
      accent: '#7C3AED',
      bg: '#EDE9FE',
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Summary Cards ───────────────────────────────────────────── */}
        <View style={styles.grid}>
          {STAT_CARDS.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={styles.statTop}>
                <View style={[styles.statIconWrap, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon} size={18} color={s.accent} />
                </View>
              </View>
              {loading ? (
                <Skeleton width={64} height={28} radius={6} style={{ marginBottom: 6 }} />
              ) : (
                <Text style={[styles.statValue, { color: s.accent }]}>{s.value}</Text>
              )}
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Top Services ────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Top Services</Text>
        <View style={styles.card}>
          {loading ? (
            <View style={{ gap: 16 }}>
              {[80, 60, 45, 30].map((w, i) => (
                <View key={i} style={styles.serviceRow}>
                  <Skeleton width={100} height={13} />
                  <Skeleton width={`${w}%`} height={10} radius={5} style={{ marginTop: 6 }} />
                </View>
              ))}
            </View>
          ) : topServices.length === 0 ? (
            <View style={styles.emptyInCard}>
              <Ionicons name="bar-chart-outline" size={32} color="#D1D5DB" />
              <Text style={styles.emptyInCardText}>No completed jobs yet</Text>
            </View>
          ) : (
            topServices.map((s) => (
              <View key={s.name} style={styles.serviceRow}>
                <View style={styles.serviceRowHeader}>
                  <Text style={styles.serviceName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.serviceCount}>{s.count} jobs</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.round(s.pct * 100)}%` }]} />
                </View>
                <Text style={styles.barPct}>{Math.round(s.pct * 100)}%</Text>
              </View>
            ))
          )}
        </View>

        {/* ── Revenue Trend ────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Revenue — Last 6 Months</Text>
        <View style={styles.card}>
          {loading ? (
            <View style={styles.trendSkeleton}>
              {[40, 70, 55, 90, 65, 80].map((h, i) => (
                <View key={i} style={styles.trendBarWrap}>
                  <Skeleton width={32} height={h} radius={6} />
                  <Skeleton width={28} height={11} radius={4} style={{ marginTop: 6 }} />
                </View>
              ))}
            </View>
          ) : (
            <>
              <View style={styles.trendChart}>
                {revenueTrend.map((r) => {
                  const barH = maxTrend > 0 ? Math.max(4, Math.round((r.value / maxTrend) * 100)) : 4;
                  return (
                    <View key={r.key} style={styles.trendBarWrap}>
                      <Text style={styles.trendValue}>
                        {r.value > 0 ? `$${Math.round(r.value / 1000) > 0 ? Math.round(r.value / 1000) + 'k' : Math.round(r.value)}` : ''}
                      </Text>
                      <View style={styles.trendBarTrack}>
                        <View
                          style={[
                            styles.trendBarFill,
                            { height: barH, opacity: r.value > 0 ? 1 : 0.2 },
                          ]}
                        />
                      </View>
                      <Text style={styles.trendLabel}>{r.label}</Text>
                    </View>
                  );
                })}
              </View>
              {revenueTrend.every((r) => r.value === 0) && (
                <Text style={styles.trendEmpty}>No revenue recorded yet</Text>
              )}
            </>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 40 },

  // ── Stat grid ──────────────────────────────────────────────────────────────
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: {
    width: '47.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statTop: { marginBottom: 10 },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 12, color: '#6B7280' },

  // ── Section ────────────────────────────────────────────────────────────────
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },

  // ── Top Services ───────────────────────────────────────────────────────────
  serviceRow: { marginBottom: 16 },
  serviceRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  serviceName: { fontSize: 14, fontWeight: '600', color: '#1A1A2E', flex: 1, marginRight: 8 },
  serviceCount: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  barTrack: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  barFill: { height: 8, backgroundColor: '#E94560', borderRadius: 4 },
  barPct: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

  emptyInCard: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyInCardText: { fontSize: 14, color: '#9CA3AF' },

  // ── Revenue Trend ──────────────────────────────────────────────────────────
  trendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    paddingTop: 20,
  },
  trendBarWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  trendValue: { fontSize: 10, fontWeight: '700', color: '#6B7280', marginBottom: 4 },
  trendBarTrack: {
    width: 32,
    height: 100,
    justifyContent: 'flex-end',
  },
  trendBarFill: {
    width: 32,
    backgroundColor: '#E94560',
    borderRadius: 6,
    minHeight: 4,
  },
  trendLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginTop: 6 },
  trendEmpty: { textAlign: 'center', fontSize: 13, color: '#D1D5DB', marginTop: 8 },
  trendSkeleton: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    paddingTop: 20,
  },
});
