import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/customer/HomeScreen';

export type CustomerStackParamList = {
  Home: undefined;
};

const Stack = createNativeStackNavigator<CustomerStackParamList>();

export function CustomerStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} />
    </Stack.Navigator>
  );
}
