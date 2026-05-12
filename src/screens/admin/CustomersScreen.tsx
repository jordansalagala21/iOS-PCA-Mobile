import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MOCK_CUSTOMERS = [
  { id: '1', name: 'Alex Johnson', email: 'alex@example.com', visits: 7, lastVisit: 'May 3' },
  { id: '2', name: 'Maria Garcia', email: 'maria@example.com', visits: 4, lastVisit: 'May 8' },
  { id: '3', name: 'Chris Lee', email: 'chris@example.com', visits: 12, lastVisit: 'May 10' },
  { id: '4', name: 'Sarah Wilson', email: 'sarah@example.com', visits: 2, lastVisit: 'Apr 29' },
  { id: '5', name: 'James Brown', email: 'james@example.com', visits: 1, lastVisit: 'Apr 15' },
];

export function CustomersScreen() {
  const [query, setQuery] = useState('');

  const filtered = MOCK_CUSTOMERS.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.email.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search customers…"
          placeholderTextColor="#9CA3AF"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {filtered.map((customer) => (
          <TouchableOpacity key={customer.id} style={styles.customerCard} activeOpacity={0.8}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{customer.name[0]}</Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customer.name}</Text>
              <Text style={styles.customerEmail}>{customer.email}</Text>
            </View>
            <View style={styles.customerStats}>
              <Text style={styles.visitCount}>{customer.visits}</Text>
              <Text style={styles.visitLabel}>visits</Text>
              <Text style={styles.lastVisit}>{customer.lastVisit}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </TouchableOpacity>
        ))}

        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={36} color="#D1D5DB" />
            <Text style={styles.emptyText}>No customers found</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1A1A2E' },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#E94560', fontWeight: '800', fontSize: 16 },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  customerEmail: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  customerStats: { alignItems: 'center', marginRight: 10 },
  visitCount: { fontSize: 18, fontWeight: '800', color: '#E94560' },
  visitLabel: { fontSize: 10, color: '#9CA3AF' },
  lastVisit: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
});
