import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../services/firebase';
import type { Service } from '../../types';
import { seedServices } from '../../utils/seedServices';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type EditFormErrors = Partial<Record<'priceFrom' | 'duration' | 'description', string>>;
type EditFormState = { priceFrom: string; duration: string; description: string };
type AddFormErrors = Partial<Record<'name' | 'description' | 'priceFrom' | 'duration', string>>;
type AddFormState = {
  name: string;
  description: string;
  priceFrom: string;
  duration: string;
  selectedIcon: string;
  active: boolean;
};

const ICON_MAP: Record<string, IoniconsName> = {
  sparkles: 'sparkles-outline',
  star: 'star-outline',
  shield: 'shield-checkmark-outline',
  palette: 'color-palette-outline',
  car: 'car-outline',
  droplets: 'water-outline',
  wrench: 'construct-outline',
  zap: 'flash-outline',
};

const SELECTABLE_ICONS = ['sparkles', 'star', 'shield', 'palette', 'car', 'droplets', 'wrench', 'zap'];

function serviceIconName(icon: string): IoniconsName {
  return ICON_MAP[icon] ?? 'sparkles-outline';
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? '1 hr' : `${h} hrs`;
  return `${h} hr ${m} min`;
}

function openSheet(slide: Animated.Value, backdrop: Animated.Value) {
  slide.setValue(600);
  backdrop.setValue(0);
  Animated.parallel([
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
    Animated.timing(backdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
  ]).start();
}

function closeSheet(slide: Animated.Value, backdrop: Animated.Value, onDone: () => void) {
  Animated.parallel([
    Animated.timing(slide, { toValue: 600, duration: 220, useNativeDriver: true }),
    Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
  ]).start(onDone);
}

const DEFAULT_ADD_FORM: AddFormState = {
  name: '',
  description: '',
  priceFrom: '',
  duration: '',
  selectedIcon: 'sparkles',
  active: true,
};

// ── ServicesScreen ────────────────────────────────────────────────────────────

export function ServicesScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Edit sheet state
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ priceFrom: '', duration: '', description: '' });
  const [editErrors, setEditErrors] = useState<EditFormErrors>({});
  const [editSaving, setEditSaving] = useState(false);

  // Add sheet state
  const [addVisible, setAddVisible] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(DEFAULT_ADD_FORM);
  const [addErrors, setAddErrors] = useState<AddFormErrors>({});
  const [addSaving, setAddSaving] = useState(false);

  // Animation refs
  const editSlide = useRef(new Animated.Value(600)).current;
  const editBackdrop = useRef(new Animated.Value(0)).current;
  const addSlide = useRef(new Animated.Value(600)).current;
  const addBackdrop = useRef(new Animated.Value(0)).current;

  // ── Real-time service subscription ───────────────────────────────────────

  useEffect(() => {
    const q = query(collection(db, 'services'), orderBy('priceFrom', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setLoading(false);
          setSeeding(true);
          seedServices().finally(() => setSeeding(false));
          return;
        }
        setServices(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name ?? '',
            priceFrom: d.data().priceFrom ?? 0,
            duration: d.data().duration ?? 60,
            description: d.data().description ?? '',
            icon: d.data().icon ?? 'sparkles',
            active: d.data().active !== false,
            updatedAt: d.data().updatedAt ?? null,
          }) as Service),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  // ── Animate edit sheet ───────────────────────────────────────────────────

  useEffect(() => {
    if (!editingService) return;
    openSheet(editSlide, editBackdrop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingService]);

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const openEdit = (service: Service) => {
    setEditForm({
      priceFrom: String(service.priceFrom),
      duration: String(service.duration),
      description: service.description,
    });
    setEditErrors({});
    setEditSaving(false);
    setEditingService(service);
  };

  const closeEdit = () => closeSheet(editSlide, editBackdrop, () => setEditingService(null));

  const setEditField = (key: keyof EditFormState, value: string) => {
    setEditForm((f) => ({ ...f, [key]: value }));
    if (editErrors[key as keyof EditFormErrors]) setEditErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleEditSave = async () => {
    const priceFVal = parseFloat(editForm.priceFrom);
    const durationVal = parseInt(editForm.duration, 10);
    const newErrors: EditFormErrors = {};
    if (!editForm.priceFrom.trim() || isNaN(priceFVal) || priceFVal <= 0)
      newErrors.priceFrom = 'Enter a valid price greater than 0.';
    if (!editForm.duration.trim() || isNaN(durationVal) || durationVal <= 0)
      newErrors.duration = 'Enter a valid duration in minutes.';
    if (!editForm.description.trim()) newErrors.description = 'Description is required.';
    if (Object.keys(newErrors).length > 0) { setEditErrors(newErrors); return; }

    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'services', editingService!.id), {
        priceFrom: priceFVal,
        duration: durationVal,
        description: editForm.description.trim(),
        updatedAt: serverTimestamp(),
      });
      closeEdit();
    } catch {
      setEditErrors({ description: 'Failed to save. Please try again.' });
      setEditSaving(false);
    }
  };

  // ── Add handlers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setAddForm(DEFAULT_ADD_FORM);
    setAddErrors({});
    setAddSaving(false);
    setAddVisible(true);
    openSheet(addSlide, addBackdrop);
  };

  const closeAdd = () => closeSheet(addSlide, addBackdrop, () => setAddVisible(false));

  const setAddField = <K extends keyof AddFormState>(key: K, value: AddFormState[K]) => {
    setAddForm((f) => ({ ...f, [key]: value }));
    if (addErrors[key as keyof AddFormErrors]) setAddErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleAddSave = async () => {
    const priceFVal = parseFloat(addForm.priceFrom);
    const durationVal = parseInt(addForm.duration, 10);
    const newErrors: AddFormErrors = {};
    if (!addForm.name.trim()) newErrors.name = 'Service name is required.';
    if (!addForm.description.trim()) newErrors.description = 'Description is required.';
    else if (addForm.description.length > 100) newErrors.description = 'Max 100 characters.';
    if (!addForm.priceFrom.trim() || isNaN(priceFVal) || priceFVal <= 0)
      newErrors.priceFrom = 'Enter a valid price greater than 0.';
    if (!addForm.duration.trim() || isNaN(durationVal) || durationVal <= 0)
      newErrors.duration = 'Enter a valid duration in minutes.';
    if (Object.keys(newErrors).length > 0) { setAddErrors(newErrors); return; }

    setAddSaving(true);
    try {
      await addDoc(collection(db, 'services'), {
        name: addForm.name.trim(),
        description: addForm.description.trim(),
        priceFrom: priceFVal,
        duration: durationVal,
        icon: addForm.selectedIcon,
        active: addForm.active,
        createdAt: serverTimestamp(),
      });
      closeAdd();
    } catch {
      setAddErrors({ name: 'Failed to save. Please try again.' });
      setAddSaving(false);
    }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────

  const handleToggleActive = async (service: Service) => {
    try {
      await updateDoc(doc(db, 'services', service.id), {
        active: !service.active,
        updatedAt: serverTimestamp(),
      });
    } catch { /* silent */ }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Add Service button */}
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={20} color="#0A0A0A" />
          <Text style={styles.addBtnText}>Add Service</Text>
        </TouchableOpacity>

        {loading || seeding ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color="#E09010" size="large" />
            <Text style={styles.emptySub}>{seeding ? 'Setting up services catalog…' : 'Loading…'}</Text>
          </View>
        ) : services.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetags-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No services found</Text>
            <TouchableOpacity
              style={styles.seedBtn}
              onPress={() => { setSeeding(true); seedServices().finally(() => setSeeding(false)); }}
              activeOpacity={0.8}
            >
              <Text style={styles.seedBtnText}>Populate Service Catalog</Text>
            </TouchableOpacity>
          </View>
        ) : (
          services.map((s) => (
            <View key={s.id} style={[styles.card, !s.active && styles.cardHidden]}>
              {!s.active && (
                <View style={styles.hiddenBanner}>
                  <Ionicons name="eye-off-outline" size={12} color="#6B7280" />
                  <Text style={styles.hiddenBannerText}>Hidden from customers</Text>
                </View>
              )}
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconWrap, !s.active && styles.cardIconWrapHidden]}>
                  <Ionicons name={serviceIconName(s.icon)} size={22} color={s.active ? '#E09010' : '#9CA3AF'} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardName, !s.active && styles.cardNameHidden]}>{s.name}</Text>
                  <Text style={styles.cardDesc} numberOfLines={2}>{s.description}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceBadgeText}>From ${s.priceFrom}</Text>
                    </View>
                    <View style={styles.durationBadge}>
                      <Ionicons name="time-outline" size={11} color="#6B7280" />
                      <Text style={styles.durationBadgeText}> {formatDuration(s.duration)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => openEdit(s)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pencil-outline" size={15} color="#E09010" />
                  <Text style={styles.editBtnText}>Edit Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.visibilityBtn}
                  onPress={() => handleToggleActive(s)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={s.active ? 'eye-off-outline' : 'eye-outline'}
                    size={15}
                    color={s.active ? '#6B7280' : '#059669'}
                  />
                  <Text style={[styles.visibilityBtnText, !s.active && styles.visibilityBtnTextOn]}>
                    {s.active ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Edit sheet ──────────────────────────────────────────────────────── */}
      <Modal
        visible={editingService !== null}
        transparent
        animationType="none"
        onRequestClose={closeEdit}
      >
        <Animated.View style={[styles.backdrop, { opacity: editBackdrop }]} pointerEvents="none" />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeEdit} activeOpacity={1} />
        <KeyboardAvoidingView
          style={styles.sheetPositioner}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY: editSlide }] }]}>
            <View style={styles.handleWrap}><View style={styles.dragHandle} /></View>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={1}>Edit — {editingService?.name}</Text>
              <TouchableOpacity onPress={closeEdit} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Price From ($)</Text>
                <View style={[styles.prefixWrap, editErrors.priceFrom && styles.fieldInputError]}>
                  <Text style={styles.prefix}>$</Text>
                  <TextInput
                    style={styles.prefixInput}
                    value={editForm.priceFrom}
                    onChangeText={(v) => setEditField('priceFrom', v)}
                    placeholder="49"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
                {editErrors.priceFrom && <Text style={styles.errorText}>{editErrors.priceFrom}</Text>}
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Duration (minutes)</Text>
                <View style={[styles.prefixWrap, editErrors.duration && styles.fieldInputError]}>
                  <TextInput
                    style={[styles.prefixInput, { paddingLeft: 14 }]}
                    value={editForm.duration}
                    onChangeText={(v) => setEditField('duration', v)}
                    placeholder="60"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    returnKeyType="next"
                  />
                  <Text style={styles.suffix}>min</Text>
                </View>
                {editErrors.duration && <Text style={styles.errorText}>{editErrors.duration}</Text>}
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.fieldInput, styles.textArea, editErrors.description && styles.fieldInputError]}
                  value={editForm.description}
                  onChangeText={(v) => setEditField('description', v)}
                  placeholder="Brief service description"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                />
                {editErrors.description && <Text style={styles.errorText}>{editErrors.description}</Text>}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, editSaving && styles.saveBtnDisabled]}
                onPress={handleEditSave}
                disabled={editSaving}
                activeOpacity={0.85}
              >
                {editSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Service sheet ───────────────────────────────────────────────── */}
      <Modal
        visible={addVisible}
        transparent
        animationType="none"
        onRequestClose={closeAdd}
      >
        <Animated.View style={[styles.backdrop, { opacity: addBackdrop }]} pointerEvents="none" />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeAdd} activeOpacity={1} />
        <KeyboardAvoidingView
          style={styles.sheetPositioner}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, styles.addSheet, { transform: [{ translateY: addSlide }] }]}>
            <View style={styles.handleWrap}><View style={styles.dragHandle} /></View>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>New Service</Text>
              <TouchableOpacity onPress={closeAdd} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
              {/* Name */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Service Name *</Text>
                <TextInput
                  style={[styles.fieldInput, addErrors.name && styles.fieldInputError]}
                  value={addForm.name}
                  onChangeText={(v) => setAddField('name', v)}
                  placeholder="e.g. Full Detail"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                {addErrors.name && <Text style={styles.errorText}>{addErrors.name}</Text>}
              </View>

              {/* Description */}
              <View style={styles.fieldWrap}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Description * </Text>
                  <Text style={styles.fieldLabelCount}>{addForm.description.length}/100</Text>
                </View>
                <TextInput
                  style={[styles.fieldInput, styles.textArea, addErrors.description && styles.fieldInputError]}
                  value={addForm.description}
                  onChangeText={(v) => setAddField('description', v)}
                  placeholder="What does this service include?"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  maxLength={100}
                />
                {addErrors.description && <Text style={styles.errorText}>{addErrors.description}</Text>}
              </View>

              {/* Price + Duration row */}
              <View style={styles.rowFields}>
                <View style={[styles.fieldWrap, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.fieldLabel}>From $  *</Text>
                  <View style={[styles.prefixWrap, addErrors.priceFrom && styles.fieldInputError]}>
                    <Text style={styles.prefix}>$</Text>
                    <TextInput
                      style={styles.prefixInput}
                      value={addForm.priceFrom}
                      onChangeText={(v) => setAddField('priceFrom', v)}
                      placeholder="49"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                    />
                  </View>
                  {addErrors.priceFrom && <Text style={styles.errorText}>{addErrors.priceFrom}</Text>}
                </View>

                <View style={[styles.fieldWrap, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Duration *</Text>
                  <View style={[styles.prefixWrap, addErrors.duration && styles.fieldInputError]}>
                    <TextInput
                      style={[styles.prefixInput, { paddingLeft: 14 }]}
                      value={addForm.duration}
                      onChangeText={(v) => setAddField('duration', v)}
                      placeholder="60"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      returnKeyType="done"
                    />
                    <Text style={styles.suffix}>min</Text>
                  </View>
                  {addErrors.duration && <Text style={styles.errorText}>{addErrors.duration}</Text>}
                </View>
              </View>

              {/* Icon selector */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Icon</Text>
                <View style={styles.iconGrid}>
                  {SELECTABLE_ICONS.map((iconKey) => {
                    const isSelected = addForm.selectedIcon === iconKey;
                    return (
                      <TouchableOpacity
                        key={iconKey}
                        style={[styles.iconCell, isSelected && styles.iconCellSelected]}
                        onPress={() => setAddField('selectedIcon', iconKey)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={serviceIconName(iconKey)}
                          size={24}
                          color={isSelected ? '#FFFFFF' : '#6B7280'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Active toggle */}
              <View style={styles.fieldWrap}>
                <View style={styles.toggleRow}>
                  <View>
                    <Text style={styles.fieldLabel}>Visible to customers</Text>
                    <Text style={styles.toggleSub}>
                      {addForm.active ? 'Customers can see and book this service' : 'Service is hidden from customers'}
                    </Text>
                  </View>
                  <Switch
                    value={addForm.active}
                    onValueChange={(v) => setAddField('active', v)}
                    trackColor={{ false: '#E5E7EB', true: '#E09010' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, addSaving && styles.saveBtnDisabled]}
                onPress={handleAddSave}
                disabled={addSaving}
                activeOpacity={0.85}
              >
                {addSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.saveBtnText}>Create Service</Text>}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  content: { padding: 16, paddingBottom: 32 },

  // ── Add button ─────────────────────────────────────────────────────────────
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E09010',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
  seedBtn: { marginTop: 8, backgroundColor: '#E09010', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  seedBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // ── Service card ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHidden: { opacity: 0.55 },
  hiddenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  hiddenBannerText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 14 },
  cardIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(224,144,16,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapHidden: { backgroundColor: '#F3F4F6' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 4 },
  cardNameHidden: { color: '#6B7280' },
  cardDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 10 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  priceBadge: { backgroundColor: 'rgba(224,144,16,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priceBadgeText: { fontSize: 11, fontWeight: '700', color: '#E09010' },
  durationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  durationBadgeText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  cardDivider: { height: 1, backgroundColor: '#F3F4F6' },
  cardActions: { flexDirection: 'row' },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 6,
    borderRightWidth: 1,
    borderRightColor: '#F3F4F6',
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: '#E09010' },
  visibilityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 6,
  },
  visibilityBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  visibilityBtnTextOn: { color: '#059669' },

  // ── Bottom sheet shared ────────────────────────────────────────────────────
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetPositioner: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    maxHeight: '85%',
  },
  addSheet: { maxHeight: '95%' },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0A0A0A', flex: 1, marginRight: 12 },

  // ── Form ───────────────────────────────────────────────────────────────────
  formScroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  rowFields: { flexDirection: 'row' },
  fieldWrap: { marginBottom: 18 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', letterSpacing: 0.2, marginBottom: 7 },
  fieldLabelCount: { fontSize: 11, color: '#9CA3AF' },
  prefixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    overflow: 'hidden',
  },
  prefix: { paddingLeft: 14, paddingRight: 4, fontSize: 15, fontWeight: '600', color: '#6B7280' },
  suffix: { paddingRight: 14, paddingLeft: 4, fontSize: 15, fontWeight: '600', color: '#6B7280' },
  prefixInput: { flex: 1, paddingVertical: 12, paddingRight: 14, fontSize: 15, color: '#0A0A0A' },
  fieldInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0A0A0A',
  },
  textArea: { minHeight: 80, paddingTop: 12 },
  fieldInputError: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  errorText: { fontSize: 12, color: '#DC2626', marginTop: 4 },

  // ── Icon grid ──────────────────────────────────────────────────────────────
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iconCell: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconCellSelected: { backgroundColor: '#E09010', borderColor: '#E09010' },

  // ── Toggle ─────────────────────────────────────────────────────────────────
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2, marginBottom: 7 },

  // ── Save button ────────────────────────────────────────────────────────────
  saveBtn: {
    backgroundColor: '#E09010',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    shadowColor: '#E09010',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
