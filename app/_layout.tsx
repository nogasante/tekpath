import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AppStateProvider } from '@/context/AppState';
import { colors } from '@/lib/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AppStateProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '700', fontSize: 20 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.paper },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="feature/[id]" options={{ title: 'Accessibility point' }} />
        <Stack.Screen name="route" options={{ title: 'Step-free route' }} />
        <Stack.Screen name="guide" options={{ title: 'Guidance' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan a checkpoint' }} />
        <Stack.Screen name="pick-start" options={{ title: 'Where are you?' }} />
        <Stack.Screen name="qr" options={{ title: 'Print QR codes' }} />
        <Stack.Screen name="add-point" options={{ title: 'Add a point' }} />
        <Stack.Screen name="map-building" options={{ title: 'Map a building' }} />
      </Stack>
    </AppStateProvider>
  );
}
