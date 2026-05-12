import {
  type Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface Vehicle {
  id: string;
  nickname: string;
  year: string;
  make: string;
  model: string;
  color: string;
  createdAt: Timestamp | null;
}

export type VehicleInput = Omit<Vehicle, 'id' | 'createdAt'>;

function vehiclesCol(uid: string) {
  return collection(db, 'users', uid, 'vehicles');
}

function vehicleDocRef(uid: string, vehicleId: string) {
  return doc(db, 'users', uid, 'vehicles', vehicleId);
}

/** Subscribe to all vehicles for a user, ordered by creation time. Returns unsubscribe fn. */
export function subscribeToVehicles(
  uid: string,
  onData: (vehicles: Vehicle[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(vehiclesCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          nickname: d.data().nickname ?? '',
          year: d.data().year ?? '',
          make: d.data().make ?? '',
          model: d.data().model ?? '',
          color: d.data().color ?? '',
          createdAt: d.data().createdAt ?? null,
        })),
      );
    },
    onError,
  );
}

export async function addVehicle(uid: string, data: VehicleInput): Promise<void> {
  await addDoc(vehiclesCol(uid), { ...data, createdAt: serverTimestamp() });
}

export async function updateVehicle(
  uid: string,
  vehicleId: string,
  data: VehicleInput,
): Promise<void> {
  await updateDoc(vehicleDocRef(uid, vehicleId), data as Record<string, string>);
}

export async function deleteVehicle(uid: string, vehicleId: string): Promise<void> {
  await deleteDoc(vehicleDocRef(uid, vehicleId));
}

/**
 * One-time migration: if the user document still has the old single-vehicle
 * fields (vehicleMake / vehicleModel) and the vehicles subcollection is empty,
 * create one vehicle document from those legacy fields.
 */
export async function migrateVehicleIfNeeded(
  uid: string,
  vehicleMake: string,
  vehicleModel: string,
): Promise<void> {
  if (!vehicleMake && !vehicleModel) return;
  const snap = await getDocs(vehiclesCol(uid));
  if (snap.empty) {
    await addDoc(vehiclesCol(uid), {
      nickname: '',
      year: '',
      make: vehicleMake,
      model: vehicleModel,
      color: '',
      createdAt: serverTimestamp(),
    });
  }
}
