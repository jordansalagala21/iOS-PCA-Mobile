import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AdminNavigator } from './AdminNavigator';
import { CustomerNavigator } from './CustomerNavigator';

export function RoleNavigator() {
  const { role } = useAuth();
  return role === 'admin' ? <AdminNavigator /> : <CustomerNavigator />;
}
