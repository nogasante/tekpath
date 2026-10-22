import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppStateProvider } from '@/context/AppState';
import { ThemeProvider, useTheme } from '@/context/Theme';
import { ToastProvider } from '@/context/Toast';
import { font } from '@/lib/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { colors, mode, reduceMotion } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          animation: reduceMotion ? 'none' : 'fade_from_bottom',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: font.semibold, fontSize: 17, color: colors.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, animation: reduceMotion ? 'none' : 'fade' }} />
        <Stack.Screen
          name="login"
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: reduceMotion ? 'none' : 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="feature/[id]" options={{ title: 'Accessibility point' }} />
        <Stack.Screen name="route" options={{ title: 'Step-free route' }} />
        <Stack.Screen name="guide" options={{ title: 'Guidance' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan a checkpoint' }} />
        <Stack.Screen name="pick-start" options={{ title: 'Choose your start' }} />
        <Stack.Screen name="qr" options={{ title: 'Print QR codes' }} />
        <Stack.Screen name="add-point" options={{ title: 'Add a point' }} />
        <Stack.Screen name="map-building" options={{ title: 'Map a building' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [ready] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <AppStateProvider>
        <ToastProvider>
          <RootNavigator />
        </ToastProvider>
      </AppStateProvider>
    </ThemeProvider>
  );
}
