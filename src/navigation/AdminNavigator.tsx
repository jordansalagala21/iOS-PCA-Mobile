import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen } from '../screens/admin/DashboardScreen';

export type AdminStackParamList = {
  Dashboard: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export function AdminStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
    </Stack.Navigator>
  );
}
