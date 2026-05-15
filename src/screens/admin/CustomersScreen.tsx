import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

type Nav = NativeStackNavigationProp<AdminRootStackParamList>;

type CustomerDoc = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  createdAt: { toDate: () => Date } | null;
};

const AVATAR_COLORS = ['#E09010', '#4F46E5', '#059669', '#D97706', '#7C3AED', '#0891B2'];
function avatarBg(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function formatDate(ts: CustomerDoc['createdAt']): string {
  if (!ts) return '';
  try {
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export function CustomersScreen() {
  const navigation = useNavigation<Nav>();
  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'customer'),
    );
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          fullName: d.data().fullName ?? d.data().displayName ?? 'Unknown',
          email: d.data().email ?? '',
          phone: d.data().phone ?? '',
          vehicleMake: d.data().vehicleMake ?? '',
          vehicleModel: d.data().vehicleModel ?? '',
          createdAt: d.data().createdAt ?? null,
        }));
        docs.sort((a, b) => {
          const aMs = a.createdAt ? a.createdAt.toDate().getTime() : 0;
          const bMs = b.createdAt ? b.createdAt.toDate().getTime() : 0;
          return bMs - aMs;
        });
        setCustomers(docs);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [customers, searchQuery]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, email or phone…"
          placeholderTextColor="#9CA3AF"
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Count header */}
      {!loading && customers.length > 0 && (
        <Text style={styles.countLabel}>
          {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
          {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#E09010" style={styles.loader} />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>
              {searchQuery.trim() ? 'No results found' : 'No customers yet'}
            </Text>
            <Text style={styles.emptySub}>
              {searchQuery.trim()
                ? 'Try a different name or email'
                : 'Customers will appear here once they sign up'}
            </Text>
          </View>
        ) : (
          filtered.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.card}
              onPress={() => navigation.navigate('CustomerDetail', { uid: c.id, customerName: c.fullName })}
              activeOpacity={0.75}
            >
              <View style={styles.cardRow}>
                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: avatarBg(c.fullName) }]}>
                  <Text style={styles.avatarText}>{initials(c.fullName)}</Text>
                </View>

                {/* Info */}
                <View style={styles.info}>
                  <Text style={styles.name}>{c.fullName}</Text>
                  <View style={styles.detailRow}>
                    <Ionicons name="mail-outline" size={12} color="#9CA3AF" />
                    <Text style={styles.detailText} numberOfLines={1}>{c.email}</Text>
                  </View>
                  {c.phone ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="call-outline" size={12} color="#9CA3AF" />
                      <Text style={styles.detailText}>{c.phone}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Vehicle + joined */}
              {(c.vehicleMake || c.vehicleModel || c.createdAt) ? (
                <View style={styles.cardFooter}>
                  {(c.vehicleMake || c.vehicleModel) ? (
                    <View style={styles.footerChip}>
                      <Ionicons name="car-outline" size={12} color="#6B7280" />
                      <Text style={styles.footerChipText}>
                        {[c.vehicleMake, c.vehicleModel].filter(Boolean).join(' ')}
                      </Text>
                    </View>
                  ) : null}
                  {c.createdAt ? (
                    <View style={styles.footerChip}>
                      <Ionicons name="calendar-outline" size={12} color="#6B7280" />
                      <Text style={styles.footerChipText}>Joined {formatDate(c.createdAt)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </TouchableOpacity>
          ))
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
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#0A0A0A' },

  countLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginHorizontal: 20,
    marginBottom: 10,
    marginTop: 6,
    letterSpacing: 0.2,
  },

  content: { paddingHorizontal: 16, paddingBottom: 32 },
  loader: { marginTop: 60 },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
  emptySub: { fontSize: 13, color: '#D1D5DB', textAlign: 'center' },

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
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { fontSize: 13, color: '#6B7280', flex: 1 },

  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  footerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  footerChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
});
