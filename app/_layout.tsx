import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppStateProvider } from '@/context/AppState';
import { ThemeProvider, useTheme } from '@/context/Theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { colors, mode, reduceMotion } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          animation: reduceMotion ? 'none' : 'default',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '700', fontSize: 18, color: colors.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, animation: reduceMotion ? 'none' : 'fade' }} />
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
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider>
      <AppStateProvider>
        <RootNavigator />
      </AppStateProvider>
    </ThemeProvider>
  );
}
