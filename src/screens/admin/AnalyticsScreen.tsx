import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATS = [
  { label: 'Revenue (MTD)', value: '$3,240', change: '+12%', up: true, icon: 'cash-outline' as const },
  { label: 'Jobs This Month', value: '28', change: '+4', up: true, icon: 'briefcase-outline' as const },
  { label: 'Avg. Ticket', value: '$115', change: '+8%', up: true, icon: 'trending-up-outline' as const },
  { label: 'Cancellations', value: '2', change: '-1', up: false, icon: 'close-circle-outline' as const },
];

const TOP_SERVICES = [
  { name: 'Full Detail', count: 11, pct: 0.39 },
  { name: 'Basic Wash', count: 8, pct: 0.29 },
  { name: 'Ceramic Coat', count: 5, pct: 0.18 },
  { name: 'Paint Correct', count: 4, pct: 0.14 },
];

export function AnalyticsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={styles.statTop}>
                <View style={styles.statIconWrap}>
                  <Ionicons name={s.icon} size={18} color="#E94560" />
                </View>
                <View style={[styles.changeBadge, { backgroundColor: s.up ? '#D1FAE5' : '#FEE2E2' }]}>
                  <Text style={[styles.changeText, { color: s.up ? '#059669' : '#DC2626' }]}>
                    {s.change}
                  </Text>
                </View>
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Top Services</Text>
        <View style={styles.servicesCard}>
          {TOP_SERVICES.map((s, i) => (
            <View key={s.name}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.serviceRow}>
                <Text style={styles.serviceName}>{s.name}</Text>
                <Text style={styles.serviceCount}>{s.count} jobs</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${s.pct * 100}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 32 },
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
  statTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  changeText: { fontSize: 11, fontWeight: '700' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#1A1A2E' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  servicesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 14 },
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  serviceName: { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  serviceCount: { fontSize: 13, color: '#6B7280' },
  barTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3 },
  barFill: { height: 6, backgroundColor: '#E94560', borderRadius: 3 },
});
