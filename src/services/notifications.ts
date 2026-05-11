import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;

  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === 'granted';
}

async function getExpoPushToken(): Promise<string | null> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn(
      '[notifications] No EAS projectId found in app config. ' +
        'Add it under expo.extra.eas.projectId in app.json, or run `eas init`.',
    );
    return null;
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/**
 * Request notification permissions, fetch the Expo push token, and
 * write it to /users/{uid} so the backend can target this device.
 * Call this once after the user signs in.
 */
export async function registerAndSavePushToken(uid: string): Promise<void> {
  const granted = await requestPermissions();
  if (!granted) return;

  const token = await getExpoPushToken();
  if (!token) return;

  await setDoc(doc(db, 'users', uid), { fcmToken: token }, { merge: true });
}
