import { Ionicons } from '@expo/vector-icons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { VehicleFormModal } from '../../components/VehicleFormModal';
import { useAuth } from '../../context/AuthContext';
import { CustomerTabParamList } from '../../navigation/CustomerNavigator';
import { db } from '../../services/firebase';
import { subscribeToVehicles, type Vehicle } from '../../services/vehicles';
import type { Service } from '../../types';

type Nav = BottomTabNavigationProp<CustomerTabParamList, 'Book'>;
type Step = 1 | 2 | 3 | 4 | 5 | 'success';

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
];

const STEP_LABELS = ['Service', 'Date', 'Vehicle', 'Type', 'Review'];

const today = new Date().toISOString().split('T')[0];

const ICON_MAP: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  sparkles: 'sparkles-outline',
  star: 'star-outline',
  shield: 'shield-checkmark-outline',
  palette: 'color-palette-outline',
};
function serviceIconName(icon: string): React.ComponentProps<typeof Ionicons>['name'] {
  return ICON_MAP[icon] ?? 'sparkles-outline';
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? '1 hr' : `${h} hrs`;
  return `${h} hr ${m} min`;
}

function formatTime(t: string): string {
  const h = parseInt(t.split(':')[0], 10);
  if (h === 12) return '12:00 PM';
  if (h > 12) return `${h - 12}:00 PM`;
  return `${h}:00 AM`;
}

function formatDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, 12).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function vehicleName(v: Vehicle): string {
  return v.nickname || [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unnamed Vehicle';
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={styles.stepRow}>
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const isActive = n === current;
        const isDone = n < current;
        return (
          <React.Fragment key={n}>
            {i > 0 && (
              <View style={[styles.stepConnector, isDone && styles.stepConnectorDone]} />
            )}
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isDone && styles.stepCircleDone,
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.stepNum, isActive && styles.stepNumActive]}>{n}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── BookingScreen ─────────────────────────────────────────────────────────────

export function BookingScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<Step>(1);

  // Step 1 — Service
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // Step 2 — Date & Time
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Step 3 — Vehicle
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  // Step 4 — Booking Type
  const [bookingType, setBookingType] = useState<'one-time' | 'biweekly' | null>(null);
  const [biweeklyPrice, setBiweeklyPrice] = useState<number>(89);

  // Step 5 — Confirm
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    getDocs(query(collection(db, 'services')))
      .then((snap) => {
        const data = snap.docs
          .map((d) => ({
            id: d.id,
            name: d.data().name ?? '',
            priceFrom: d.data().priceFrom ?? 0,
            duration: d.data().duration ?? 60,
            description: d.data().description ?? '',
            icon: d.data().icon ?? 'sparkles',
            updatedAt: d.data().updatedAt ?? null,
          }) as Service)
          .sort((a, b) => a.priceFrom - b.priceFrom);
        setServices(data);
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeToVehicles(
      user.uid,
      (data) => {
        setVehicles(data);
        setVehiclesLoading(false);
      },
      () => setVehiclesLoading(false),
    );
  }, [user]);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'biweekly'))
      .then((snap) => {
        if (snap.exists() && typeof snap.data().price === 'number') {
          setBiweeklyPrice(snap.data().price as number);
        }
      })
      .catch(() => {});
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDayPress = async (dateString: string) => {
    setSelectedDate(dateString);
    setSelectedSlot(null);
    setSlotsLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'appointments'), where('date', '==', dateString)),
      );
      const counts: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const slot = d.data().timeSlot as string;
        if (slot) counts[slot] = (counts[slot] ?? 0) + 1;
      });
      setSlotCounts(counts);
    } catch {
      setSlotCounts({});
    } finally {
      setSlotsLoading(false);
    }
  };

  const canProceed =
    (step === 1 && selectedService !== null) ||
    (step === 2 && selectedDate !== null && selectedSlot !== null) ||
    (step === 3 && selectedVehicle !== null) ||
    (step === 4 && bookingType !== null) ||
    (step === 5 && !submitting);

  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });

  const handleNext = () => {
    if (step === 'success' || step >= 5) return;
    scrollTop();
    setStep((step + 1) as Step);
  };

  const handleBack = () => {
    if (step === 'success' || step <= 1) return;
    scrollTop();
    setStep((step - 1) as Step);
  };

  const handleConfirm = async () => {
    if (!user || !selectedService || !selectedDate || !selectedSlot || !selectedVehicle || !bookingType) return;
    setSubmitting(true);
    setSubmitError(null);
    const estimatedPrice = bookingType === 'biweekly' ? biweeklyPrice : selectedService.priceFrom;
    try {
      await addDoc(collection(db, 'appointments'), {
        customerId: user.uid,
        customerName: user.displayName ?? '',
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        vehicleId: selectedVehicle.id,
        vehicleDetails: vehicleName(selectedVehicle),
        vehicleColor: selectedVehicle.color,
        date: selectedDate,
        timeSlot: selectedSlot,
        type: bookingType,
        status: 'pending',
        estimatedPrice,
        actualCharge: null,
        createdAt: serverTimestamp(),
      });
      if (bookingType === 'biweekly') {
        await addDoc(collection(db, 'subscriptions'), {
          customerId: user.uid,
          serviceId: selectedService.id,
          vehicleId: selectedVehicle.id,
          startDate: selectedDate,
          intervalDays: 14,
          fixedPrice: biweeklyPrice,
          active: true,
          nextDate: selectedDate,
          createdAt: serverTimestamp(),
        });
      }
      setStep('success');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlotCounts({});
    setSelectedVehicle(null);
    setBookingType(null);
    setSubmitError(null);
    navigation.navigate('Home');
  };

  // ── Step 1: Service ───────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepHeading}>Choose a Service</Text>
      <Text style={styles.stepSub}>Select the service that fits your needs</Text>
      {servicesLoading ? (
        <ActivityIndicator color="#E09010" style={styles.loader} />
      ) : (
        services.map((s) => {
          const isSelected = selectedService?.id === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.serviceCard, isSelected && styles.serviceCardSelected]}
              onPress={() => setSelectedService(s)}
              activeOpacity={0.8}
            >
              <View style={[styles.serviceIconWrap, isSelected && styles.serviceIconWrapSelected]}>
                <Ionicons
                  name={serviceIconName(s.icon)}
                  size={22}
                  color={isSelected ? '#FFFFFF' : '#E09010'}
                />
              </View>
              <View style={styles.serviceBody}>
                <Text style={[styles.serviceName, isSelected && styles.serviceNameSel]}>
                  {s.name}
                </Text>
                <Text style={[styles.serviceDesc, isSelected && styles.serviceDescSel]}>
                  {s.description}
                </Text>
                <View style={styles.serviceMeta}>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={isSelected ? '#D1D5DB' : '#9CA3AF'}
                  />
                  <Text style={[styles.serviceMetaText, isSelected && styles.serviceMetaTextSel]}>
                    {' '}{formatDuration(s.duration)}
                  </Text>
                </View>
              </View>
              <View style={styles.servicePriceCol}>
                <Text style={[styles.servicePrice, isSelected && styles.servicePriceSel]}>
                  From ${s.priceFrom}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={18} color="#E09010" style={styles.checkIcon} />
                )}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  // ── Step 2: Date & Time ───────────────────────────────────────────────────

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepHeading}>Pick a Date & Time</Text>
      <Text style={styles.stepSub}>Select when you'd like your appointment</Text>

      <View style={styles.calendarWrap}>
        <Calendar
          minDate={today}
          onDayPress={(day) => handleDayPress(day.dateString)}
          markedDates={
            selectedDate ? { [selectedDate]: { selected: true, selectedColor: '#E09010' } } : {}
          }
          theme={{
            calendarBackground: '#FFFFFF',
            textSectionTitleColor: '#6B7280',
            selectedDayBackgroundColor: '#E09010',
            selectedDayTextColor: '#FFFFFF',
            todayTextColor: '#E09010',
            dayTextColor: '#0A0A0A',
            textDisabledColor: '#D1D5DB',
            arrowColor: '#E09010',
            monthTextColor: '#0A0A0A',
            textMonthFontWeight: '700',
            textDayFontWeight: '500',
            textDayHeaderFontWeight: '600',
          }}
        />
      </View>

      {selectedDate && (
        <>
          <Text style={styles.slotHeading}>Available Times</Text>
          {slotsLoading ? (
            <ActivityIndicator color="#E09010" style={styles.loader} />
          ) : (
            <View style={styles.slotsGrid}>
              {TIME_SLOTS.map((slot) => {
                const count = slotCounts[slot] ?? 0;
                const unavailable = count >= 2;
                const isSelected = selectedSlot === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[
                      styles.slotPill,
                      isSelected && styles.slotPillSelected,
                      unavailable && styles.slotPillUnavailable,
                    ]}
                    onPress={() => !unavailable && setSelectedSlot(slot)}
                    disabled={unavailable}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.slotTime,
                        isSelected && styles.slotTimeSel,
                        unavailable && styles.slotTimeUnavail,
                      ]}
                    >
                      {formatTime(slot)}
                    </Text>
                    {unavailable && (
                      <Text style={styles.slotFullyBooked}>Fully Booked</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );

  // ── Step 3: Vehicle ───────────────────────────────────────────────────────

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepHeading}>Select Vehicle</Text>
      <Text style={styles.stepSub}>Which vehicle are we detailing?</Text>

      {vehiclesLoading ? (
        <ActivityIndicator color="#E09010" style={styles.loader} />
      ) : (
        <>
          {vehicles.map((v) => {
            const isSelected = selectedVehicle?.id === v.id;
            const sub = v.nickname
              ? [v.year, v.make, v.model].filter(Boolean).join(' ')
              : v.color;
            return (
              <TouchableOpacity
                key={v.id}
                style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
                onPress={() => setSelectedVehicle(v)}
                activeOpacity={0.8}
              >
                <View style={[styles.vehicleIconWrap, isSelected && styles.vehicleIconWrapSel]}>
                  <Ionicons
                    name="car-sport-outline"
                    size={20}
                    color={isSelected ? '#FFFFFF' : '#E09010'}
                  />
                </View>
                <View style={styles.vehicleBody}>
                  <Text style={[styles.vehicleName, isSelected && styles.vehicleNameSel]}>
                    {vehicleName(v)}
                  </Text>
                  {sub ? (
                    <Text style={[styles.vehicleSub, isSelected && styles.vehicleSubSel]}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={20} color="#E09010" />}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.addVehicleBtn}
            onPress={() => setShowAddVehicle(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color="#E09010" />
            <Text style={styles.addVehicleBtnText}>Add New Vehicle</Text>
          </TouchableOpacity>
        </>
      )}

      {user && (
        <VehicleFormModal
          visible={showAddVehicle}
          uid={user.uid}
          onClose={() => setShowAddVehicle(false)}
          onSuccess={() => setShowAddVehicle(false)}
        />
      )}
    </View>
  );

  // ── Step 4: Booking Type ──────────────────────────────────────────────────

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepHeading}>Booking Type</Text>
      <Text style={styles.stepSub}>How often would you like this service?</Text>

      {(['one-time', 'biweekly'] as const).map((type) => {
        const isSelected = bookingType === type;
        const isOneTime = type === 'one-time';
        return (
          <TouchableOpacity
            key={type}
            style={[styles.typeCard, isSelected && styles.typeCardSelected]}
            onPress={() => setBookingType(type)}
            activeOpacity={0.85}
          >
            <View style={[styles.typeIconCircle, isSelected && styles.typeIconCircleSel]}>
              <Ionicons
                name={isOneTime ? 'calendar-outline' : 'refresh-outline'}
                size={26}
                color={isSelected ? '#FFFFFF' : '#E09010'}
              />
            </View>
            <View style={styles.typeBody}>
              <Text style={[styles.typeTitle, isSelected && styles.typeTitleSel]}>
                {isOneTime ? 'One-Time Detail' : 'Biweekly Reset'}
              </Text>
              <Text style={[styles.typeDesc, isSelected && styles.typeDescSel]}>
                {isOneTime
                  ? 'Single appointment, no commitment'
                  : 'Recurring every 2 weeks for ongoing care'}
              </Text>
              {!isOneTime && (
                <View style={[styles.typePriceBadge, isSelected && styles.typePriceBadgeSel]}>
                  <Text style={[styles.typePriceBadgeText, isSelected && styles.typePriceBadgeTextSel]}>
                    ${biweeklyPrice} fixed / session
                  </Text>
                </View>
              )}
            </View>
            <View style={[styles.typeRadio, isSelected && styles.typeRadioSelected]}>
              {isSelected && <View style={styles.typeRadioInner} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Step 5: Review ────────────────────────────────────────────────────────

  const renderStep5 = () => {
    const estimatedPrice =
      bookingType === 'biweekly' ? biweeklyPrice : (selectedService?.priceFrom ?? 0);
    const reviewItems = [
      { icon: 'sparkles-outline' as const, label: 'Service', value: selectedService?.name ?? '—' },
      { icon: 'calendar-outline' as const, label: 'Date', value: selectedDate ? formatDate(selectedDate) : '—' },
      { icon: 'time-outline' as const, label: 'Time', value: selectedSlot ? formatTime(selectedSlot) : '—' },
      { icon: 'car-sport-outline' as const, label: 'Vehicle', value: selectedVehicle ? vehicleName(selectedVehicle) : '—' },
      { icon: 'refresh-outline' as const, label: 'Type', value: bookingType === 'biweekly' ? 'Biweekly Reset' : 'One-Time Detail' },
    ];
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepHeading}>Review Booking</Text>
        <Text style={styles.stepSub}>Confirm your details before booking</Text>

        <View style={styles.reviewCard}>
          {reviewItems.map(({ icon, label, value }, i) => (
            <View
              key={label}
              style={[styles.reviewRow, i < reviewItems.length - 1 && styles.reviewRowBorder]}
            >
              <View style={styles.reviewIconWrap}>
                <Ionicons name={icon} size={16} color="#E09010" />
              </View>
              <View style={styles.reviewBody}>
                <Text style={styles.reviewLabel}>{label}</Text>
                <Text style={styles.reviewValue}>{value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            {bookingType === 'biweekly' ? 'Fixed price per session' : 'Estimated price'}
          </Text>
          <Text style={styles.totalPrice}>
            {bookingType === 'biweekly' ? `$${estimatedPrice}` : `From $${estimatedPrice}`}
          </Text>
        </View>

        {submitError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}
      </View>
    );
  };

  // ── Success ───────────────────────────────────────────────────────────────

  const renderSuccess = () => {
    const estimatedPrice =
      bookingType === 'biweekly' ? biweeklyPrice : (selectedService?.priceFrom ?? 0);
    const rows = [
      { label: 'Service', value: selectedService?.name },
      { label: 'Date', value: selectedDate ? formatDate(selectedDate) : undefined },
      { label: 'Time', value: selectedSlot ? formatTime(selectedSlot) : undefined },
      { label: 'Vehicle', value: selectedVehicle ? vehicleName(selectedVehicle) : undefined },
    ].filter((r) => Boolean(r.value)) as { label: string; value: string }[];

    return (
      <View style={styles.successContainer}>
        <View style={styles.successIconCircle}>
          <Ionicons name="checkmark" size={36} color="#FFFFFF" />
        </View>
        <Text style={styles.successTitle}>Booking Confirmed!</Text>
        <Text style={styles.successSub}>
          We'll be in touch to finalize your appointment details.
        </Text>

        <View style={styles.successCard}>
          {rows.map(({ label, value }, i) => (
            <View
              key={label}
              style={[styles.successRow, i < rows.length && styles.successRowBorder]}
            >
              <Text style={styles.successRowLabel}>{label}</Text>
              <Text style={styles.successRowValue}>{value}</Text>
            </View>
          ))}
          <View style={styles.successRow}>
            <Text style={styles.successRowLabel}>
              {bookingType === 'biweekly' ? 'Fixed Price' : 'Est. Price'}
            </Text>
            <Text style={styles.successRowValueAccent}>
              {bookingType === 'biweekly' ? `$${estimatedPrice}` : `From $${estimatedPrice}`}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.homeBtn} onPress={handleReset} activeOpacity={0.85}>
          <Ionicons name="home-outline" size={18} color="#FFFFFF" />
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.successScroll}
          showsVerticalScrollIndicator={false}
        >
          {renderSuccess()}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StepIndicator current={step} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color="#6B7280" />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
          disabled={!canProceed || submitting}
          onPress={step === 5 ? handleConfirm : handleNext}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Text style={styles.nextBtnText}>
                {step === 5 ? 'Confirm Booking' : 'Continue'}
              </Text>
              {step !== 5 && <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FA' },
  scrollContent: { paddingBottom: 24 },
  successScroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  // ── Step indicator ─────────────────────────────────────────────────────────
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  stepItem: { alignItems: 'center', minWidth: 46 },
  stepConnector: { flex: 1, height: 2, marginTop: 13, backgroundColor: '#E5E7EB' },
  stepConnectorDone: { backgroundColor: '#E09010' },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  stepCircleActive: { borderColor: '#E09010', backgroundColor: '#E09010' },
  stepCircleDone: { borderColor: '#22C55E', backgroundColor: '#22C55E' },
  stepNum: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  stepNumActive: { color: '#FFFFFF' },
  stepLabel: { fontSize: 9, color: '#9CA3AF', marginTop: 4, textAlign: 'center' },
  stepLabelActive: { color: '#E09010', fontWeight: '600' },

  // ── Step content ───────────────────────────────────────────────────────────
  stepContent: { padding: 20 },
  stepHeading: { fontSize: 20, fontWeight: '800', color: '#0A0A0A', marginBottom: 4 },
  stepSub: { fontSize: 13, color: '#6B7280', marginBottom: 20 },
  loader: { marginTop: 40 },

  // ── Service cards (step 1) ─────────────────────────────────────────────────
  serviceCard: {
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
  serviceCardSelected: { borderColor: '#E09010', backgroundColor: '#0A0A0A' },
  serviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  serviceIconWrapSelected: { backgroundColor: '#E09010' },
  serviceBody: { flex: 1 },
  serviceName: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  serviceNameSel: { color: '#FFFFFF' },
  serviceDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  serviceDescSel: { color: '#9CA3AF' },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  serviceMetaText: { fontSize: 12, color: '#9CA3AF' },
  serviceMetaTextSel: { color: '#D1D5DB' },
  servicePriceCol: { alignItems: 'flex-end' },
  servicePrice: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  servicePriceSel: { color: '#FFFFFF' },
  checkIcon: { marginTop: 6 },

  // ── Calendar step (step 2) ─────────────────────────────────────────────────
  calendarWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  slotHeading: { fontSize: 15, fontWeight: '700', color: '#0A0A0A', marginBottom: 12 },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slotPill: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    minWidth: 82,
  },
  slotPillSelected: { borderColor: '#E09010', backgroundColor: '#FFF1F3' },
  slotPillUnavailable: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  slotTime: { fontSize: 13, fontWeight: '600', color: '#0A0A0A' },
  slotTimeSel: { color: '#E09010' },
  slotTimeUnavail: { color: '#D1D5DB' },
  slotFullyBooked: { fontSize: 9, color: '#D1D5DB', marginTop: 2, fontWeight: '500' },

  // ── Vehicle cards (step 3) ─────────────────────────────────────────────────
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
  vehicleCardSelected: { borderColor: '#E09010', backgroundColor: '#0A0A0A' },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleIconWrapSel: { backgroundColor: '#E09010' },
  vehicleBody: { flex: 1 },
  vehicleName: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  vehicleNameSel: { color: '#FFFFFF' },
  vehicleSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  vehicleSubSel: { color: '#9CA3AF' },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#E09010',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 4,
  },
  addVehicleBtnText: { fontSize: 14, fontWeight: '600', color: '#E09010' },

  // ── Booking type cards (step 4) ────────────────────────────────────────────
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  typeCardSelected: { borderColor: '#E09010', backgroundColor: '#0A0A0A' },
  typeIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  typeIconCircleSel: { backgroundColor: '#E09010' },
  typeBody: { flex: 1 },
  typeTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 4 },
  typeTitleSel: { color: '#FFFFFF' },
  typeDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  typeDescSel: { color: '#9CA3AF' },
  typePriceBadge: {
    marginTop: 8,
    backgroundColor: '#FFF1F3',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  typePriceBadgeSel: { backgroundColor: 'rgba(255,255,255,0.15)' },
  typePriceBadgeText: { fontSize: 11, fontWeight: '700', color: '#E09010' },
  typePriceBadgeTextSel: { color: '#FFFFFF' },
  typeRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  typeRadioSelected: { borderColor: '#E09010' },
  typeRadioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#E09010' },

  // ── Review (step 5) ────────────────────────────────────────────────────────
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  reviewRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  reviewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewBody: { flex: 1 },
  reviewLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 2 },
  reviewValue: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  totalCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  totalLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  totalPrice: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerText: { fontSize: 13, color: '#DC2626', flex: 1 },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  nextBtn: {
    flex: 1,
    backgroundColor: '#E09010',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextBtnDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0, elevation: 0 },
  nextBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // ── Success ────────────────────────────────────────────────────────────────
  successContainer: { alignItems: 'center' },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#0A0A0A', marginBottom: 8 },
  successSub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  successCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  successRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  successRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  successRowLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  successRowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
    maxWidth: '65%',
    textAlign: 'right',
  },
  successRowValueAccent: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E09010',
    maxWidth: '65%',
    textAlign: 'right',
  },
  homeBtn: {
    width: '100%',
    backgroundColor: '#E09010',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  homeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
