import { BlurView } from 'expo-blur';
import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/context/Theme';
import { elevation } from '@/lib/theme';

export function Frosted({
  children,
  style,
  radius = 999,
  intensity = 64,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
}) {
  const { colors, mode } = useTheme();
  return (
    <BlurView
      intensity={intensity}
      tint={mode === 'dark' ? 'dark' : 'light'}
      style={[
        {
          overflow: 'hidden',
          borderRadius: radius,
          borderWidth: 1,
          borderColor: colors.glassBorder,
        },
        elevation(colors, 2),
        style,
      ]}>
      {children}
    </BlurView>
  );
}
