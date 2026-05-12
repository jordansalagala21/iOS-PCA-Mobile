import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { AnalyticsScreen } from '../screens/admin/AnalyticsScreen';
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

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof AdminTabParamList, [IconName, IconName]> = {
  Tasks: ['list', 'list-outline'],
  Services: ['pricetags', 'pricetags-outline'],
  Analytics: ['bar-chart', 'bar-chart-outline'],
  Promotions: ['pricetag', 'pricetag-outline'],
  Customers: ['people', 'people-outline'],
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

export function AdminNavigator() {
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
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Services" component={ServicesScreen} options={{ title: 'Services' }} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Promotions" component={PromotionsScreen} />
      <Tab.Screen name="Customers" component={CustomersScreen} />
    </Tab.Navigator>
  );
}
