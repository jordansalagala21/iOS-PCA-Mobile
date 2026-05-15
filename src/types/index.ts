import type { Timestamp } from 'firebase/firestore';

export interface Service {
  id: string;
  name: string;
  priceFrom: number;
  duration: number;
  description: string;
  icon: string;
  active: boolean;
  updatedAt: Timestamp | null;
}

export interface Vehicle {
  id: string;
  nickname: string;
  year: string;
  make: string;
  model: string;
  color: string;
  createdAt: Timestamp | null;
}

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in-progress'
  | 'completed'
  | 'cancelled';

export interface Appointment {
  id: string;
  userId: string;
  vehicleId: string;
  serviceId: string;
  serviceName: string;
  scheduledAt: Timestamp;
  status: AppointmentStatus;
  notes?: string;
  priceCharged?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: 'monthly' | 'annual';
  status: 'active' | 'cancelled' | 'expired';
  startsAt: Timestamp;
  endsAt: Timestamp;
  createdAt: Timestamp;
}

export type NotificationType = 'appointment' | 'promotion' | 'system';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: Timestamp;
}

export type UserRole = 'admin' | 'customer';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  role: UserRole;
  pushToken?: string;
  createdAt: Timestamp;
}
