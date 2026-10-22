import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { spacing, type as typeScale } from '@/lib/theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={{ flex: 1, alignItems: 'flex-start', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg, gap: spacing.lg }}>
        <AppText accessibilityRole="header" size={typeScale.title} weight="700">
          That screen is not on the map.
        </AppText>
        <Link href="/" accessibilityRole="link" accessibilityLabel="Back to the campus map">
          <AppText weight="700" color={colors.primary}>
            Back to the campus map
          </AppText>
        </Link>
      </View>
    </>
  );
}
