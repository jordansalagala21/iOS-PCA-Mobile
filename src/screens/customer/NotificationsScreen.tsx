import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function NotificationsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="notifications-outline" size={40} color="#9CA3AF" />
        </View>
        <Text style={styles.title}>All Caught Up</Text>
        <Text style={styles.body}>
          You'll receive updates here about your appointments, promotions, and service reminders.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8FA' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', marginBottom: 10 },
  body: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
});
