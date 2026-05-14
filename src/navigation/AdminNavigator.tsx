import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AdminNotificationBell } from '../components/AdminNotificationBell';
import { AnalyticsScreen } from '../screens/admin/AnalyticsScreen';
import { CustomerDetailScreen } from '../screens/admin/CustomerDetailScreen';
import { CustomersScreen } from '../screens/admin/CustomersScreen';
import { PromotionsScreen } from '../screens/admin/PromotionsScreen';
import { ServicesScreen } from '../screens/admin/ServicesScreen';
import { TasksScreen } from '../screens/admin/TasksScreen';

export type AdminTabParamList = {
  Tasks: undefined;
  Services: undefined;
  Analytics: undefined;
  Promotions: undefined;
  Customers: undefined;
};

export type AdminRootStackParamList = {
  Tabs: NavigatorScreenParams<AdminTabParamList>;
  CustomerDetail: { uid: string; customerName: string };
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof AdminTabParamList, [IconName, IconName]> = {
  Tasks: ['list', 'list-outline'],
  Services: ['pricetags', 'pricetags-outline'],
  Analytics: ['bar-chart', 'bar-chart-outline'],
  Promotions: ['pricetag', 'pricetag-outline'],
  Customers: ['people', 'people-outline'],
};

const Tab = createBottomTabNavigator<AdminTabParamList>();
const Stack = createNativeStackNavigator<AdminRootStackParamList>();

function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = ICONS[route.name as keyof AdminTabParamList];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#E94560',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: '#1A1A2E' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
      })}
    >
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{ headerRight: () => <AdminNotificationBell /> }}
      />
      <Tab.Screen name="Services" component={ServicesScreen} options={{ title: 'Services' }} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Promotions" component={PromotionsScreen} />
      <Tab.Screen name="Customers" component={CustomersScreen} />
    </Tab.Navigator>
  );
}

export function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={AdminTabs} />
      <Stack.Screen
        name="CustomerDetail"
        component={CustomerDetailScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
