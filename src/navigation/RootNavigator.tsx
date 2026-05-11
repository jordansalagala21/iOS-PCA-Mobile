import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CustomerStackNavigator } from './CustomerNavigator';
import { AdminStackNavigator } from './AdminNavigator';

export type RootStackParamList = {
  Customer: undefined;
  Admin: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Customer" component={CustomerStackNavigator} />
      <Stack.Screen name="Admin" component={AdminStackNavigator} />
    </Stack.Navigator>
  );
}
