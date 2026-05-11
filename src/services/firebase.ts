import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBITxRLJAXcmEpyC2zjrjAnPYinUrry7rI',
  authDomain: 'iosmobile-928ab.firebaseapp.com',
  projectId: 'iosmobile-928ab',
  storageBucket: 'iosmobile-928ab.firebasestorage.app',
  messagingSenderId: '455793437641',
  appId: '1:455793437641:ios:e8424a49502eacd8a55618',
};

const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
