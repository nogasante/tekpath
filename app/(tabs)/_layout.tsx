import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/Theme';
import { tabBarHeight } from '@/lib/safeArea';
import { font } from '@/lib/theme';

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      safeAreaInsets={{ top: insets.top, bottom: 0, left: 0, right: 0 }}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: font.semibold, fontSize: 20, color: colors.ink },
        headerShadowVisible: false,
        headerStatusBarHeight: insets.top,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: tabBarHeight(insets.bottom),
          paddingTop: 6,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
        tabBarItemStyle: { minHeight: 48 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          title: 'Map',
          tabBarLabel: 'Map',
          tabBarAccessibilityLabel: 'Campus map',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'map' : 'map-outline'} color={typeof color === 'string' ? color : colors.primary} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarAccessibilityLabel: 'Search buildings and rooms',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'search' : 'search-outline'} color={typeof color === 'string' ? color : colors.muted} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="contribute"
        options={{
          title: 'Contribute',
          tabBarAccessibilityLabel: 'Add accessibility information',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'add-circle' : 'add-circle-outline'} color={typeof color === 'string' ? color : colors.muted} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarAccessibilityLabel: 'Account and text size',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} color={typeof color === 'string' ? color : colors.muted} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  name,
  color,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minWidth: 48,
        minHeight: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.primaryMuted : 'transparent',
        paddingHorizontal: 12,
      }}>
      <Ionicons name={name} color={color} size={22} aria-hidden />
    </View>
  );
}
