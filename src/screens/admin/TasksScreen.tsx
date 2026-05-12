import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MOCK_TASKS = [
  { id: '1', customer: 'Alex Johnson', service: 'Full Detail', time: '9:00 AM', status: 'upcoming' },
  { id: '2', customer: 'Maria Garcia', service: 'Ceramic Coating', time: '11:30 AM', status: 'in-progress' },
  { id: '3', customer: 'Chris Lee', service: 'Basic Wash', time: '2:00 PM', status: 'upcoming' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  upcoming: { label: 'Upcoming', color: '#4F46E5', bg: '#EEF2FF' },
  'in-progress': { label: 'In Progress', color: '#D97706', bg: '#FEF3C7' },
  done: { label: 'Done', color: '#059669', bg: '#D1FAE5' },
};

export function TasksScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          {[
            { label: "Today's Jobs", value: '3', icon: 'briefcase-outline' as const },
            { label: 'Pending', value: '2', icon: 'time-outline' as const },
            { label: 'Completed', value: '1', icon: 'checkmark-done-outline' as const },
          ].map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Ionicons name={stat.icon} size={20} color="#E94560" />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Today's Schedule</Text>

        {MOCK_TASKS.map((task) => {
          const cfg = STATUS_CONFIG[task.status];
          return (
            <TouchableOpacity key={task.id} style={styles.taskCard} activeOpacity={0.8}>
              <View style={styles.taskLeft}>
                <Text style={styles.taskTime}>{task.time}</Text>
                <View style={styles.taskLine} />
              </View>
              <View style={styles.taskBody}>
                <View style={styles.taskHeader}>
                  <Text style={styles.taskCustomer}>{task.customer}</Text>
                  <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                <Text style={styles.taskService}>{task.service}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 32 },
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
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  taskCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  taskLeft: { width: 72, alignItems: 'center', paddingVertical: 16, backgroundColor: '#F8F8FA' },
  taskTime: { fontSize: 12, fontWeight: '700', color: '#1A1A2E', textAlign: 'center' },
  taskLine: { flex: 1, width: 2, backgroundColor: '#E94560', marginTop: 6, borderRadius: 1 },
  taskBody: { flex: 1, padding: 14 },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskCustomer: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  taskService: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
