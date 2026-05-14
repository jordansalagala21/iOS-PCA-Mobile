import { Ionicons } from '@expo/vector-icons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type ServiceDoc = {
  id: string;
  name: string;
  priceFrom: number;
  icon: string;
};

const ICON_MAP: Record<string, IoniconsName> = {
  sparkles: 'sparkles-outline',
  star: 'star-outline',
  shield: 'shield-checkmark-outline',
  palette: 'color-palette-outline',
};

function serviceIconName(icon: string): IoniconsName {
  return ICON_MAP[icon] ?? 'sparkles-outline';
}

const QUICK_ACTIONS = [
  {
    id: 'Appointments' as const,
    icon: 'time-outline' as const,
    label: 'Appointments',
    sub: 'View upcoming bookings',
    iconBg: '#EEF2FF',
    iconColor: '#4F46E5',
    accentColor: '#4F46E5',
    count: 0,
  },
  {
    id: 'Notifications' as const,
    icon: 'notifications-outline' as const,
    label: 'Notifications',
    sub: 'Recent updates',
    iconBg: '#FFF7ED',
    iconColor: '#EA580C',
    accentColor: '#EA580C',
    count: 0,
  },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  const [services, setServices] = useState<ServiceDoc[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'services'), orderBy('priceFrom', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setServices(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name ?? '',
            priceFrom: d.data().priceFrom ?? 0,
            icon: d.data().icon ?? 'sparkles',
          })),
        );
        setServicesLoading(false);
      },
      () => setServicesLoading(false),
    );
    return unsub;
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {greeting()}, {firstName}
            </Text>
            <Text style={styles.subGreeting}>What can we do for you today?</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarCircle}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.85}
          >
            <Text style={styles.avatarText}>{firstName[0].toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Hero CTA Banner */}
        <TouchableOpacity
          style={styles.heroBanner}
          onPress={() => navigation.navigate('Book')}
          activeOpacity={0.92}
        >
          <View style={styles.shineCircleLarge} />
          <View style={styles.shineCircleSmall} />

          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>PREMIUM DETAILING</Text>
            <Text style={styles.heroTitle}>Ready for a{'\n'}detail?</Text>
            <Text style={styles.heroSub}>Book your appointment{'\n'}in seconds</Text>
          </View>

          <View style={styles.heroButtonWrapper}>
            <View style={styles.heroButton}>
              <Text style={styles.heroButtonText}>Book Now</Text>
              <Ionicons name="arrow-forward" size={14} color="#1A1A2E" />
            </View>
          </View>
        </TouchableOpacity>

        {/* Quick Access */}
        <View style={styles.divider} />
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
        </View>
        <View style={styles.quickColumn}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[styles.quickCard, { borderLeftColor: action.accentColor }]}
              onPress={() => navigation.navigate(action.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.quickIcon, { backgroundColor: action.iconBg }]}>
                <Ionicons name={action.icon} size={22} color={action.iconColor} />
              </View>
              <View style={styles.quickInfo}>
                <Text style={styles.quickLabel}>{action.label}</Text>
                <Text style={styles.quickSub}>{action.sub}</Text>
              </View>
              <View style={[styles.countBadge, { backgroundColor: action.iconBg }]}>
                <Text style={[styles.countText, { color: action.iconColor }]}>
                  {action.count}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color="#D1D5DB"
                style={styles.chevron}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Services */}
        <View style={styles.divider} />
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Our Services</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Book')} activeOpacity={0.7}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {servicesLoading ? (
          <View style={styles.servicesLoader}>
            <ActivityIndicator color="#E94560" />
          </View>
        ) : (
          <View style={styles.servicesGrid}>
            {services.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.serviceCard}
                onPress={() => navigation.navigate('Book')}
                activeOpacity={0.8}
              >
                <View style={styles.priceBadge}>
                  <Text style={styles.priceBadgeText}>from ${s.priceFrom}</Text>
                </View>
                <View style={styles.serviceIconWrapper}>
                  <Ionicons name={serviceIconName(s.icon)} size={28} color="#E94560" />
                </View>
                <Text style={styles.serviceLabel}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  scroll: { paddingBottom: 40 },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#1A1A2E',
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  subGreeting: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 3,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E94560',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
  },

  // ── Hero Banner ───────────────────────────────────────────────────────────
  heroBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 130,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  shineCircleLarge: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#E94560',
    opacity: 0.09,
    right: -40,
    top: -50,
  },
  shineCircleSmall: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#E94560',
    opacity: 0.13,
    right: 55,
    bottom: -25,
  },
  heroContent: {
    flex: 1,
    marginRight: 14,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E94560',
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    letterSpacing: 0.2,
  },
  heroSub: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 7,
    lineHeight: 17,
  },
  heroButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 112,
    justifyContent: 'center',
  },
  heroButtonText: {
    color: '#1A1A2E',
    fontWeight: '700',
    fontSize: 13,
  },

  // ── Shared section layout ─────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: '#EBEBF0',
    marginHorizontal: 20,
    marginTop: 26,
    marginBottom: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A2E',
    letterSpacing: 0.2,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E94560',
  },

  // ── Quick Action Cards ────────────────────────────────────────────────────
  quickColumn: {
    marginHorizontal: 16,
    gap: 10,
  },
  quickCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  quickInfo: {
    flex: 1,
  },
  quickLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A2E',
    letterSpacing: 0.1,
  },
  quickSub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  countBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 13,
    fontWeight: '800',
  },
  chevron: {
    marginLeft: 8,
  },

  // ── Services Grid ─────────────────────────────────────────────────────────
  servicesLoader: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    gap: 12,
  },
  serviceCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    paddingTop: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  priceBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FFF1F3',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E94560',
    letterSpacing: 0.2,
  },
  serviceIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  serviceLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A2E',
    letterSpacing: 0.1,
  },
});
