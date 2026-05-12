import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

const SEED = [
  {
    id: 'basic-wash',
    name: 'Basic Wash',
    priceFrom: 49,
    duration: 60,
    description: 'Exterior hand wash, dry, and windows',
    icon: 'sparkles',
  },
  {
    id: 'full-detail',
    name: 'Full Detail',
    priceFrom: 149,
    duration: 180,
    description: 'Full interior and exterior detail',
    icon: 'star',
  },
  {
    id: 'ceramic-coat',
    name: 'Ceramic Coat',
    priceFrom: 599,
    duration: 300,
    description: 'Long-lasting ceramic coating',
    icon: 'shield',
  },
  {
    id: 'paint-correct',
    name: 'Paint Correction',
    priceFrom: 299,
    duration: 240,
    description: 'Remove swirls and scratches',
    icon: 'palette',
  },
] as const;

export async function seedServices(): Promise<void> {
  await Promise.all(
    SEED.map(async ({ id, ...data }) => {
      const ref = doc(db, 'services', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
      }
    }),
  );
}
