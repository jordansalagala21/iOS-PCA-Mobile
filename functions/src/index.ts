import { initializeApp } from 'firebase-admin/app';
import * as functions from 'firebase-functions/v2';

initializeApp();

// Example callable function — replace with your own logic
export const helloWorld = functions.https.onRequest((_req, res) => {
  res.json({ message: 'Hello from Cloud Functions!' });
});
