import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function PromotionsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.addButton} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Create Promotion</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Active Promotions</Text>

        <View style={styles.emptyState}>
          <Ionicons name="pricetag-outline" size={40} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No promotions yet</Text>
          <Text style={styles.emptySub}>Tap "Create Promotion" to add your first offer</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 32 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E94560',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 24,
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
  emptySub: { fontSize: 13, color: '#D1D5DB', textAlign: 'center' },
});
