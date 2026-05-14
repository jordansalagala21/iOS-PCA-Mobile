import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// ── Health check ──────────────────────────────────────────────────────────────

export const helloWorld = onRequest((_req, res) => {
  res.json({ message: 'Hello from Cloud Functions!' });
});

// ── Appointment completed → FCM push + in-app notif + advance subscription ───

export const onAppointmentComplete = onDocumentUpdated(
  '/appointments/{appointmentId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;
    if (before.status === 'completed' || after.status !== 'completed') return;

    const appointmentId = event.params.appointmentId;
    const customerId = after.customerId as string;
    const serviceName = after.serviceName as string;
    const serviceId = after.serviceId as string;
    const vehicleDetails = (after.vehicleDetails as string | undefined) ?? 'your vehicle';
    const apptType = after.type as string;

    const TITLE = 'Your car is ready!';
    const body = `Your ${serviceName} is complete. Come pick up your ${vehicleDetails}!`;

    let fcmToken: string | undefined;
    try {
      const userSnap = await db.doc(`users/${customerId}`).get();
      const raw = userSnap.data()?.fcmToken;
      if (typeof raw === 'string' && raw.length > 0) fcmToken = raw;
    } catch (err) {
      logger.warn('Could not fetch FCM token', { customerId, error: err });
    }

    const sendPush: Promise<unknown> = fcmToken
      ? messaging.send({
          notification: { title: TITLE, body },
          data: { appointmentId, type: 'job_complete' },
          token: fcmToken,
        })
      : Promise.resolve('skipped — no FCM token');

    const writeNotif = db.collection('notifications').add({
      recipientId: customerId,
      title: TITLE,
      message: body,
      type: 'job_complete',
      appointmentId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const advanceSubs: Promise<unknown> =
      apptType === 'biweekly'
        ? (async () => {
            const snap = await db
              .collection('subscriptions')
              .where('customerId', '==', customerId)
              .where('serviceId', '==', serviceId)
              .where('active', '==', true)
              .limit(1)
              .get();

            if (snap.empty) {
              logger.info('No active biweekly subscription found', { customerId, serviceId });
              return;
            }

            const nextDay = new Date();
            nextDay.setDate(nextDay.getDate() + 14);
            const nextDate = nextDay.toISOString().split('T')[0];

            await snap.docs[0].ref.update({
              nextDate,
              updatedAt: FieldValue.serverTimestamp(),
            });

            logger.info('Biweekly subscription advanced', {
              subscriptionId: snap.docs[0].id,
              nextDate,
            });
          })()
        : Promise.resolve('skipped — one-time appointment');

    const [pushResult, notifResult, subsResult] = await Promise.allSettled([
      sendPush,
      writeNotif,
      advanceSubs,
    ]);

    if (pushResult.status === 'rejected') {
      logger.warn('FCM push failed (non-blocking)', { appointmentId, reason: pushResult.reason });
    }
    if (notifResult.status === 'rejected') {
      logger.error('In-app notification write failed', {
        appointmentId,
        reason: notifResult.reason,
      });
    }
    if (subsResult.status === 'rejected') {
      logger.error('Subscription advance failed', { appointmentId, reason: subsResult.reason });
    }

    logger.info('onAppointmentComplete finished', {
      appointmentId,
      customerId,
      pushSent: pushResult.status === 'fulfilled' && fcmToken !== undefined,
      notifWritten: notifResult.status === 'fulfilled',
      subsAdvanced: subsResult.status === 'fulfilled' && apptType === 'biweekly',
    });
  },
);

// ── Promotion created → FCM multicast + in-app notifications ─────────────────

export const onPromotionCreated = onDocumentCreated(
  '/promotions/{promotionId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const promotionId = event.params.promotionId;
    const title = data.title as string;
    const message = data.message as string;
    const targetAudience = data.targetAudience as 'all' | 'inactive' | 'individual';
    const scheduledAt = data.scheduledAt;

    // Scheduled promotions require Cloud Scheduler — skip for now.
    if (scheduledAt !== null && scheduledAt !== undefined) {
      logger.info('Promotion is scheduled, skipping immediate send', {
        promotionId,
        scheduledAt,
      });
      return;
    }

    // ── Individual nudge ─────────────────────────────────────────────────────
    if (targetAudience === 'individual') {
      const recipientId = data.recipientId as string | undefined;
      if (!recipientId) {
        logger.warn('Individual promotion missing recipientId', { promotionId });
        return;
      }

      const userSnap = await db.doc(`users/${recipientId}`).get();
      const userData = userSnap.data();
      if (!userData) {
        logger.warn('Individual promotion target user not found', { promotionId, recipientId });
        return;
      }

      let sentCount = 0;
      const token =
        typeof userData.fcmToken === 'string' && userData.fcmToken.length > 0
          ? (userData.fcmToken as string)
          : undefined;

      if (token) {
        try {
          await messaging.send({
            notification: { title, body: message },
            data: { promotionId, type: 'nudge' },
            token,
          });
          sentCount = 1;
        } catch (err) {
          logger.warn('FCM push failed for nudge (non-blocking)', { recipientId, err });
        }
      }

      const notifBatch = db.batch();
      notifBatch.set(db.collection('notifications').doc(), {
        recipientId,
        title,
        message,
        type: 'nudge',
        promotionId,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      const fName = (userData.fullName as string | undefined)?.split(' ')[0] ?? 'Customer';
      notifBatch.set(db.collection('notifications').doc(), {
        recipientId: 'admin',
        title: 'Nudge sent',
        message: `Nudge sent to ${fName}${sentCount === 0 ? ' (no push token)' : ''}.`,
        type: 'system',
        promotionId,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      await notifBatch.commit();

      await snap.ref.update({
        sent: true,
        sentCount,
        sentAt: FieldValue.serverTimestamp(),
      });

      logger.info('Individual nudge finished', { promotionId, recipientId, sentCount });
      return;
    }

    // ── Fetch target customers ───────────────────────────────────────────────
    const allCustomersSnap = await db
      .collection('users')
      .where('role', '==', 'customer')
      .get();

    let targetDocs = allCustomersSnap.docs;

    if (targetAudience === 'inactive') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      targetDocs = allCustomersSnap.docs.filter((d) => {
        const raw = d.data().lastAppointmentDate;
        if (!raw) return true;
        const last: Date = raw.toDate ? raw.toDate() : new Date(raw);
        return last < cutoff;
      });
    }

    const tokens = targetDocs
      .map((d) => d.data().fcmToken as string | undefined)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);

    const recipientIds = targetDocs.map((d) => d.id);

    logger.info('Sending promotion', {
      promotionId,
      targetAudience,
      recipientCount: recipientIds.length,
      tokenCount: tokens.length,
    });

    // ── FCM multicast in batches of 500 ─────────────────────────────────────
    let sentCount = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batchTokens = tokens.slice(i, i + BATCH_SIZE);
      try {
        const result = await messaging.sendEachForMulticast({
          tokens: batchTokens,
          notification: { title, body: message },
          data: { promotionId, type: 'promotion' },
        });
        sentCount += result.successCount;
        logger.info('FCM batch result', {
          batch: Math.floor(i / BATCH_SIZE),
          success: result.successCount,
          failure: result.failureCount,
        });
      } catch (err) {
        logger.warn('FCM batch failed (non-blocking)', { batch: Math.floor(i / BATCH_SIZE), err });
      }
    }

    // ── Write in-app notification for each recipient ─────────────────────────
    const WRITE_BATCH_SIZE = 499;
    const allWrites = [
      // Customer notifications
      ...recipientIds.map((recipientId) => ({
        recipientId,
        title,
        message,
        type: 'promotion' as const,
        promotionId,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })),
      // Admin notification
      {
        recipientId: 'admin',
        title: 'Promotion sent',
        message: `"${title}" was delivered to ${sentCount} customer${sentCount !== 1 ? 's' : ''}.`,
        type: 'system' as const,
        promotionId,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      },
    ];

    for (let i = 0; i < allWrites.length; i += WRITE_BATCH_SIZE) {
      const firestoreBatch = db.batch();
      for (const writeData of allWrites.slice(i, i + WRITE_BATCH_SIZE)) {
        firestoreBatch.set(db.collection('notifications').doc(), writeData);
      }
      await firestoreBatch.commit();
    }

    // ── Mark promotion as sent ───────────────────────────────────────────────
    await snap.ref.update({
      sent: true,
      sentCount,
      sentAt: FieldValue.serverTimestamp(),
    });

    logger.info('onPromotionCreated finished', { promotionId, sentCount });
  },
);
