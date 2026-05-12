import { Ionicons } from '@expo/vector-icons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { CustomerRootStackParamList, CustomerTabParamList } from '../../navigation/CustomerNavigator';
import { type Vehicle, subscribeToVehicles } from '../../services/vehicles';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<CustomerTabParamList, 'Book'>,
  NativeStackNavigationProp<CustomerRootStackParamList>
>;

const SERVICES = [
  {
    id: 'basic',
    icon: 'car-outline' as const,
    title: 'Basic Wash',
    description: 'Exterior hand wash, dry, and windows',
    price: '$49',
    duration: '45 min',
  },
  {
    id: 'interior',
    icon: 'sparkles-outline' as const,
    title: 'Interior Detail',
    description: 'Full vacuum, wipe-down, and conditioning',
    price: '$99',
    duration: '2 hrs',
  },
  {
    id: 'full',
    icon: 'star-outline' as const,
    title: 'Full Detail',
    description: 'Complete interior + exterior detail package',
    price: '$149',
    duration: '3 hrs',
  },
  {
    id: 'ceramic',
    icon: 'shield-checkmark-outline' as const,
    title: 'Ceramic Coating',
    description: 'Long-lasting paint protection and shine',
    price: 'From $599',
    duration: '1–2 days',
  },
  {
    id: 'paint',
    icon: 'color-palette-outline' as const,
    title: 'Paint Correction',
    description: 'Remove swirls, scratches, and oxidation',
    price: 'From $299',
    duration: '4–6 hrs',
  },
];

type Step = 'vehicle' | 'service';

export function BookScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();

  const [step, setStep] = useState<Step>('vehicle');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToVehicles(
      user.uid,
      (data) => {
        setVehicles(data);
        setVehiclesLoading(false);
        // Auto-select the first vehicle if none chosen yet
        if (data.length > 0 && !selectedVehicleId) {
          setSelectedVehicleId(data[0].id);
        }
      },
      () => setVehiclesLoading(false),
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;

  const vehicleDisplayName = (v: Vehicle) =>
    v.nickname || [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unnamed Vehicle';

  const vehicleSubLine = (v: Vehicle) => {
    if (v.nickname) {
      const spec = [v.year, v.make, v.model].filter(Boolean).join(' ');
      return [spec, v.color].filter(Boolean).join(' · ');
    }
    return v.color || '';
  };

  // ── Vehicle step ───────────────────────────────────────────────────────────
  if (step === 'vehicle') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Select a Vehicle</Text>
        <Text style={styles.subheading}>Which vehicle are we detailing?</Text>

        {vehiclesLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#E94560" />
          </View>
        ) : vehicles.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="car-outline" size={32} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyTitle}>No vehicles on your account</Text>
            <Text style={styles.emptySub}>Add a vehicle in your Profile to get started</Text>
            <TouchableOpacity
              style={styles.goToProfileBtn}
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.85}
            >
              <Text style={styles.goToProfileBtnText}>Go to Profile</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {vehicles.map((v) => {
              const isSelected = selectedVehicleId === v.id;
              const sub = vehicleSubLine(v);
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
                  onPress={() => setSelectedVehicleId(v.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.vehicleIconWrap, isSelected && styles.vehicleIconWrapSelected]}>
                    <Ionicons
                      name="car-sport-outline"
                      size={22}
                      color={isSelected ? '#FFFFFF' : '#E94560'}
                    />
                  </View>
                  <View style={styles.vehicleCardBody}>
                    <Text
                      style={[styles.vehicleCardName, isSelected && styles.vehicleCardNameSelected]}
                      numberOfLines={1}
                    >
                      {vehicleDisplayName(v)}
                    </Text>
                    {sub ? (
                      <Text
                        style={[styles.vehicleCardSub, isSelected && styles.vehicleCardSubSelected]}
                        numberOfLines={1}
                      >
                        {sub}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color="#E94560" />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.addVehicleInline}
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color="#E94560" />
              <Text style={styles.addVehicleInlineText}>Add another vehicle</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[styles.ctaButton, (!selectedVehicleId || vehiclesLoading) && styles.ctaDisabled]}
          disabled={!selectedVehicleId || vehiclesLoading}
          onPress={() => setStep('service')}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Service step ───────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back + vehicle context bar */}
      <TouchableOpacity
        style={styles.backRow}
        onPress={() => setStep('vehicle')}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={18} color="#E94560" />
        <Text style={styles.backText}>Change vehicle</Text>
      </TouchableOpacity>

      {selectedVehicle && (
        <View style={styles.contextChip}>
          <Ionicons name="car-sport-outline" size={14} color="#E94560" />
          <Text style={styles.contextChipText} numberOfLines={1}>
            {vehicleDisplayName(selectedVehicle)}
          </Text>
        </View>
      )}

      <Text style={styles.heading}>Choose a Service</Text>
      <Text style={styles.subheading}>Select the service that fits your needs</Text>

      {SERVICES.map((service) => {
        const isSelected = selectedServiceId === service.id;
        return (
          <TouchableOpacity
            key={service.id}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() => setSelectedServiceId(service.id)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconWrap, isSelected && styles.iconWrapSelected]}>
              <Ionicons
                name={service.icon}
                size={24}
                color={isSelected ? '#FFFFFF' : '#E94560'}
              />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>
                {service.title}
              </Text>
              <Text style={[styles.cardDesc, isSelected && styles.cardDescSelected]}>
                {service.description}
              </Text>
              <View style={styles.cardMeta}>
                <Ionicons
                  name="time-outline"
                  size={12}
                  color={isSelected ? '#D1D5DB' : '#9CA3AF'}
                />
                <Text style={[styles.metaText, isSelected && styles.metaTextSelected]}>
                  {' '}{service.duration}
                </Text>
              </View>
            </View>
            <Text style={[styles.price, isSelected && styles.priceSelected]}>
              {service.price}
            </Text>
            {isSelected && (
              <Ionicons name="checkmark-circle" size={20} color="#E94560" style={styles.check} />
            )}
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[styles.ctaButton, !selectedServiceId && styles.ctaDisabled]}
        disabled={!selectedServiceId}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 40 },

  // ── Vehicle step ────────────────────────────────────────────────────────────
  loadingWrap: { height: 200, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  goToProfileBtn: {
    marginTop: 12,
    backgroundColor: '#E94560',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  goToProfileBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  vehicleCardSelected: { borderColor: '#E94560', backgroundColor: '#1A1A2E' },
  vehicleIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleIconWrapSelected: { backgroundColor: '#E94560' },
  vehicleCardBody: { flex: 1, minWidth: 0 },
  vehicleCardName: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  vehicleCardNameSelected: { color: '#FFFFFF' },
  vehicleCardSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  vehicleCardSubSelected: { color: '#9CA3AF' },
  addVehicleInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  addVehicleInlineText: { fontSize: 14, fontWeight: '600', color: '#E94560' },

  // ── Service step ────────────────────────────────────────────────────────────
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 10,
  },
  backText: { fontSize: 14, fontWeight: '600', color: '#E94560' },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF1F3',
    borderRadius: 20,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    maxWidth: '80%',
  },
  contextChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E94560',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSelected: { borderColor: '#E94560', backgroundColor: '#1A1A2E' },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconWrapSelected: { backgroundColor: '#E94560' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  cardTitleSelected: { color: '#FFFFFF' },
  cardDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  cardDescSelected: { color: '#9CA3AF' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  metaText: { fontSize: 12, color: '#9CA3AF' },
  metaTextSelected: { color: '#D1D5DB' },
  price: { fontSize: 14, fontWeight: '700', color: '#1A1A2E', marginLeft: 8 },
  priceSelected: { color: '#FFFFFF' },
  check: { marginLeft: 8 },

  // ── Shared ──────────────────────────────────────────────────────────────────
  heading: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  ctaButton: {
    backgroundColor: '#E94560',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0, elevation: 0 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
