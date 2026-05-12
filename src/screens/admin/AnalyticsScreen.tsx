import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STAT_DEFS = [
  { label: 'Revenue (MTD)', icon: 'cash-outline' as const },
  { label: 'Jobs This Month', icon: 'briefcase-outline' as const },
  { label: 'Avg. Ticket', icon: 'trending-up-outline' as const },
  { label: 'Cancellations', icon: 'close-circle-outline' as const },
];

export function AnalyticsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {STAT_DEFS.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={styles.statTop}>
                <View style={styles.statIconWrap}>
                  <Ionicons name={s.icon} size={18} color="#E94560" />
                </View>
              </View>
              <Text style={styles.statValue}>—</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Top Services</Text>
        <View style={styles.emptyCard}>
          <Ionicons name="bar-chart-outline" size={36} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No data yet</Text>
          <Text style={styles.emptySub}>Analytics will populate as appointments are completed</Text>
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
  statValue: { fontSize: 24, fontWeight: '800', color: '#D1D5DB' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 40,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#9CA3AF' },
  emptySub: { fontSize: 13, color: '#D1D5DB', textAlign: 'center' },
});
