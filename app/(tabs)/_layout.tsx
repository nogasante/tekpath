import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '@/lib/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '700', fontSize: 22 },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.ink,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.ink,
          borderTopWidth: 2,
          minHeight: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'TekPath',
          tabBarLabel: 'Map',
          tabBarAccessibilityLabel: 'Campus map',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" color={typeof color === 'string' ? color : colors.forest} size={size ?? 26} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarAccessibilityLabel: 'Search buildings and rooms',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" color={typeof color === 'string' ? color : colors.ink} size={size ?? 26} />
          ),
        }}
      />
      <Tabs.Screen
        name="contribute"
        options={{
          title: 'Contribute',
          tabBarAccessibilityLabel: 'Add accessibility information',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" color={typeof color === 'string' ? color : colors.ink} size={size ?? 26} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarAccessibilityLabel: 'Account and text size',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" color={typeof color === 'string' ? color : colors.ink} size={size ?? 26} />
          ),
        }}
      />
    </Tabs>
  );
}
