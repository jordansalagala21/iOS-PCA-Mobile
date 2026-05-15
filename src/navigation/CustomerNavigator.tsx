import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AppointmentsScreen } from '../screens/customer/AppointmentsScreen';
import { BookingScreen } from '../screens/customer/BookingScreen';
import { HomeScreen } from '../screens/customer/HomeScreen';
import { NotificationsScreen } from '../screens/customer/NotificationsScreen';
import { ProfileScreen } from '../screens/customer/ProfileScreen';

export type CustomerTabParamList = {
  Home: undefined;
  Book: undefined;
  Appointments: undefined;
  Notifications: undefined;
};

export type CustomerRootStackParamList = {
  Tabs: NavigatorScreenParams<CustomerTabParamList>;
  Profile: undefined;
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof CustomerTabParamList, [IconName, IconName]> = {
  Home: ['home', 'home-outline'],
  Book: ['calendar', 'calendar-outline'],
  Appointments: ['time', 'time-outline'],
  Notifications: ['notifications', 'notifications-outline'],
};

const Tab = createBottomTabNavigator<CustomerTabParamList>();
const Stack = createNativeStackNavigator<CustomerRootStackParamList>();

function CustomerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = ICONS[route.name as keyof CustomerTabParamList];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#E09010',
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopColor: '#222222',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: '#0A0A0A' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Book" component={BookingScreen} options={{ title: 'Book a Service' }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
    </Tab.Navigator>
  );
}

export function CustomerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={CustomerTabs} />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
