import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

export const helloWorld = onRequest((_req, res) => {
  res.json({ message: 'Hello from Cloud Functions!' });
});

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
  }
);
