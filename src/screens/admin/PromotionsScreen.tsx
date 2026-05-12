import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PROMOS = [
  {
    id: '1',
    title: 'Spring Detail Special',
    discount: '20% OFF',
    code: 'SPRING20',
    expires: 'May 31',
    active: true,
  },
  {
    id: '2',
    title: 'Referral Reward',
    discount: '$25 OFF',
    code: 'REFER25',
    expires: 'Jun 30',
    active: true,
  },
  {
    id: '3',
    title: 'Winter Package',
    discount: '15% OFF',
    code: 'WINTER15',
    expires: 'Feb 28',
    active: false,
  },
];

export function PromotionsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.addButton} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Create Promotion</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Active Promotions</Text>

        {PROMOS.map((promo) => (
          <View key={promo.id} style={[styles.promoCard, !promo.active && styles.promoCardInactive]}>
            <View style={styles.promoTop}>
              <View style={[styles.discountBadge, !promo.active && styles.discountBadgeInactive]}>
                <Text style={[styles.discountText, !promo.active && styles.discountTextInactive]}>
                  {promo.discount}
                </Text>
              </View>
              <View style={[styles.activeDot, { backgroundColor: promo.active ? '#10B981' : '#D1D5DB' }]} />
            </View>
            <Text style={[styles.promoTitle, !promo.active && styles.promoTitleInactive]}>
              {promo.title}
            </Text>
            <View style={styles.promoMeta}>
              <View style={styles.codeChip}>
                <Text style={styles.codeText}>{promo.code}</Text>
              </View>
              <Text style={styles.expiresText}>
                <Ionicons name="time-outline" size={12} color="#9CA3AF" /> Expires {promo.expires}
              </Text>
            </View>
          </View>
        ))}
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
  promoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  promoCardInactive: { opacity: 0.55 },
  promoTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  discountBadge: {
    backgroundColor: '#FFF1F3',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  discountBadgeInactive: { backgroundColor: '#F3F4F6' },
  discountText: { fontSize: 15, fontWeight: '800', color: '#E94560' },
  discountTextInactive: { color: '#9CA3AF' },
  activeDot: { width: 10, height: 10, borderRadius: 5, alignSelf: 'center' },
  promoTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 10 },
  promoTitleInactive: { color: '#9CA3AF' },
  promoMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeText: { fontSize: 13, fontWeight: '700', color: '#374151', letterSpacing: 0.5 },
  expiresText: { fontSize: 12, color: '#9CA3AF' },
});
