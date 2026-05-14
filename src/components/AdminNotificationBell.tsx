import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../services/firebase';

type AdminNotif = {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: { toDate: () => Date } | null;
};

function formatRelative(ts: AdminNotif['createdAt']): string {
  if (!ts) return '';
  try {
    const ms = Date.now() - ts.toDate().getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function AdminNotificationBell() {
  const [notifications, setNotifications] = useState<AdminNotif[]>([]);
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(500)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', 'admin'),
    );
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        title: d.data().title ?? '',
        message: d.data().message ?? '',
        type: d.data().type ?? 'system',
        read: d.data().read ?? false,
        createdAt: d.data().createdAt ?? null,
      }));
      data.sort((a, b) => {
        const aMs = a.createdAt?.toDate().getTime() ?? 0;
        const bMs = b.createdAt?.toDate().getTime() ?? 0;
        return bMs - aMs;
      });
      setNotifications(data.slice(0, 30));
    });
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const openPanel = () => {
    setVisible(true);
    slideAnim.setValue(500);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    // Mark all as read
    const unread = notifications.filter((n) => !n.read);
    if (unread.length > 0) {
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
      batch.commit().catch(() => undefined);
    }
  };

  const closePanel = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  };

  return (
    <>
      <TouchableOpacity
        onPress={openPanel}
        style={styles.bellBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="none" onRequestClose={closePanel}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
          pointerEvents="none"
        />
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closePanel} activeOpacity={1} />

        <Animated.View
          style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}
          pointerEvents="box-none"
        >
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Notifications</Text>
            <TouchableOpacity
              onPress={closePanel}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
            {notifications.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={36} color="#D1D5DB" />
                <Text style={styles.emptyText}>No notifications yet</Text>
              </View>
            ) : (
              notifications.map((n) => (
                <View key={n.id} style={[styles.notifRow, !n.read && styles.notifRowUnread]}>
                  <View
                    style={[
                      styles.notifDot,
                      { backgroundColor: n.read ? 'transparent' : '#E94560' },
                    ]}
                  />
                  <View style={styles.notifContent}>
                    <View style={styles.notifTopRow}>
                      <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
                      <Text style={styles.notifTime}>{formatRelative(n.createdAt)}</Text>
                    </View>
                    <Text style={styles.notifMessage} numberOfLines={2}>{n.message}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    marginRight: 16,
    position: 'relative',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#E94560',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#1A1A2E',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  panelTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  listContent: { paddingVertical: 8 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  notifRowUnread: { backgroundColor: '#FFFBFB' },
  notifDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  notifContent: { flex: 1 },
  notifTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A2E', flex: 1, marginRight: 8 },
  notifTime: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  notifMessage: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
});
