import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';

export function Mark({ size = 32, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const ink = color ?? colors.primary;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <Path
        d="M5 25 C10 25 12 18 16 15.5 C19.2 13.4 21 10.5 23 7.5"
        stroke={ink}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="23" cy="7.2" r="2.5" fill={ink} />
    </Svg>
  );
}

export function Wordmark({ size = 22, light = false }: { size?: number; light?: boolean }) {
  const { colors } = useTheme();
  const ink = light ? '#FFFFFF' : colors.ink;
  const accent = light ? '#D7F6EA' : colors.primary;
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="TekPath"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Mark size={size + 8} color={light ? '#FFFFFF' : colors.primary} />
      <AppText size={size} weight="700" color={ink} style={{ letterSpacing: -0.4 }}>
        Tek<AppText size={size} weight="700" color={accent}>Path</AppText>
      </AppText>
    </View>
  );
}
