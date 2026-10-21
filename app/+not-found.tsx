import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper, gap: 16 }}>
        <AppText size={24} weight="700">That screen is not on the map.</AppText>
        <Link href="/" accessibilityRole="link">
          <AppText weight="700" color={colors.forest}>Back to the campus map</AppText>
        </Link>
      </View>
    </>
  );
}
