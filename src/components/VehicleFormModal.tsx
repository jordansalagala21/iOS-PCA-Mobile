import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { type Vehicle, type VehicleInput, addVehicle, updateVehicle } from '../services/vehicles';

interface Props {
  visible: boolean;
  uid: string;
  /** Pass an existing vehicle to pre-fill the form for editing. Omit for add mode. */
  vehicle?: Vehicle;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

type FormState = {
  nickname: string;
  year: string;
  make: string;
  model: string;
  color: string;
};

const EMPTY_FORM: FormState = {
  nickname: '',
  year: '',
  make: '',
  model: '',
  color: '',
};

const CURRENT_YEAR = new Date().getFullYear();

function validateForm(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const yearNum = parseInt(form.year, 10);
  if (!form.year.trim()) errors.year = 'Year is required.';
  else if (!/^\d{4}$/.test(form.year.trim())) errors.year = 'Enter a 4-digit year.';
  else if (yearNum < 1900 || yearNum > CURRENT_YEAR + 1)
    errors.year = `Year must be 1900–${CURRENT_YEAR + 1}.`;
  if (!form.make.trim()) errors.make = 'Make is required.';
  if (!form.model.trim()) errors.model = 'Model is required.';
  if (!form.color.trim()) errors.color = 'Color is required.';
  return errors;
}

export function VehicleFormModal({ visible, uid, vehicle, onClose, onSuccess }: Props) {
  const isEdit = Boolean(vehicle);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  // ── Animation ──────────────────────────────────────────────────────────────
  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    slideAnim.setValue(600);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, backdropAnim]);

  const animateOut = useCallback(
    (callback: () => void) => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 600,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(callback);
    },
    [slideAnim, backdropAnim],
  );

  useEffect(() => {
    if (visible) {
      // Reset form whenever the modal opens
      setForm(
        vehicle
          ? {
              nickname: vehicle.nickname,
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model,
              color: vehicle.color,
            }
          : EMPTY_FORM,
      );
      setErrors({});
      setSaving(false);
      animateIn();
    }
  }, [visible, vehicle, animateIn]);

  const handleClose = () => {
    animateOut(onClose);
  };

  const handleSubmit = async () => {
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setSaving(true);
    const payload: VehicleInput = {
      nickname: form.nickname.trim(),
      year: form.year.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      color: form.color.trim(),
    };
    try {
      if (isEdit && vehicle) {
        await updateVehicle(uid, vehicle.id, payload);
        animateOut(() => {
          onClose();
          onSuccess('Vehicle updated!');
        });
      } else {
        await addVehicle(uid, payload);
        animateOut(() => {
          onClose();
          onSuccess('Vehicle added!');
        });
      }
    } catch {
      setErrors({ make: 'Failed to save. Please try again.' });
      setSaving(false);
    }
  };

  const setField = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      {/* Animated backdrop — pointerEvents none so touches reach the TouchableOpacity below */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents="none"
      />

      {/* Tap-outside-to-close target */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={handleClose}
        activeOpacity={1}
      />

      {/* Sheet — rendered after TouchableOpacity so it sits on top */}
      <KeyboardAvoidingView
        style={styles.sheetPositioner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formScroll}
          >
            {/* Nickname (optional) */}
            <FormField
              label="Nickname"
              optional
              placeholder='e.g. "My Daily Driver"'
              value={form.nickname}
              onChangeText={(v) => setField('nickname', v)}
              autoCapitalize="sentences"
            />

            {/* Year */}
            <FormField
              label="Year"
              placeholder="2024"
              value={form.year}
              onChangeText={(v) => setField('year', v)}
              keyboardType="number-pad"
              maxLength={4}
              error={errors.year}
            />

            {/* Make + Model on same row */}
            <View style={styles.formRow}>
              <View style={[styles.flex1, { marginRight: 10 }]}>
                <FormField
                  label="Make"
                  placeholder="Toyota"
                  value={form.make}
                  onChangeText={(v) => setField('make', v)}
                  autoCapitalize="words"
                  error={errors.make}
                />
              </View>
              <View style={styles.flex1}>
                <FormField
                  label="Model"
                  placeholder="Camry"
                  value={form.model}
                  onChangeText={(v) => setField('model', v)}
                  autoCapitalize="words"
                  error={errors.model}
                />
              </View>
            </View>

            {/* Color */}
            <FormField
              label="Color"
              placeholder="Silver"
              value={form.color}
              onChangeText={(v) => setField('color', v)}
              autoCapitalize="words"
              error={errors.color}
            />

            <TouchableOpacity
              style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isEdit ? 'Save Changes' : 'Add Vehicle'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Helper sub-component ──────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  optional?: boolean;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  autoCapitalize?: React.ComponentProps<typeof TextInput>['autoCapitalize'];
  maxLength?: number;
  error?: string;
}

function FormField({
  label,
  optional,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  maxLength,
  error,
}: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {optional && <Text style={styles.optionalTag}>optional</Text>}
      </View>
      <TextInput
        style={[styles.fieldInput, error && styles.fieldInputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'none'}
        maxLength={maxLength}
        returnKeyType="next"
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Overlay layers ──────────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetPositioner: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  // ── Bottom sheet ───────────────────────────────────────────────────────────
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    maxHeight: '90%',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A2E',
    letterSpacing: 0.2,
  },

  // ── Form ───────────────────────────────────────────────────────────────────
  formScroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  formRow: { flexDirection: 'row' },
  flex1: { flex: 1 },
  fieldWrap: { marginBottom: 16 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 7,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.2,
  },
  optionalTag: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  fieldInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A1A2E',
  },
  fieldInputError: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
  },
  submitBtn: {
    backgroundColor: '#E94560',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
