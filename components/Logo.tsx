import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { glyph } from '@/components/glyphs';
import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';

export function Mark({ size = 32, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const ink = color ?? colors.primary;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph.route}</svg>`;
  return (
    <View aria-hidden>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
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
