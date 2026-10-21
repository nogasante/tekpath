import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppState } from '@/context/AppState';
import { colors, statusColors } from '@/lib/theme';
import { kindLabel, statusLabel } from '@/lib/types';

export function AppText({
  size = 18,
  weight = '400',
  color = colors.ink,
  style,
  ...props
}: TextProps & { size?: number; weight?: TextStyle['fontWeight']; color?: string }) {
  const { textScale } = useAppState();
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={[{ fontSize: size * textScale, color, fontWeight: weight, lineHeight: size * textScale * 1.35 }, style]}
      {...props}
    />
  );
}

export function Screen({
  children,
  scroll = false,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const palette =
    variant === 'primary'
      ? { bg: colors.forest, fg: '#FFFFFF', border: colors.forestDark }
      : variant === 'danger'
        ? { bg: colors.clay, fg: '#FFFFFF', border: '#5E1A10' }
        : { bg: colors.card, fg: colors.ink, border: colors.line };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {icon ? (
        <Ionicons name={icon} size={22} color={palette.fg} importantForAccessibility="no" accessibilityElementsHidden />
      ) : null}
      <AppText size={18} weight="700" color={palette.fg}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={styles.field}>
      <AppText size={16} weight="700" nativeID={`${label}-label`}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const palette = statusColors(status);
  const icon =
    status === 'working' ? 'checkmark-circle' : status === 'broken' ? 'close-circle' : 'help-circle';
  const label = statusLabel(status);
  return (
    <View
      accessibilityLabel={`Status: ${label}`}
      style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.fg }]}>
      <Ionicons name={icon} size={18} color={palette.fg} importantForAccessibility="no" accessibilityElementsHidden />
      <AppText size={15} weight="700" color={palette.fg}>
        {label}
      </AppText>
    </View>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  const icon =
    kind === 'lift'
      ? 'swap-vertical'
      : kind === 'ramp'
        ? 'trending-up'
        : kind === 'toilet'
          ? 'body'
          : kind === 'parking'
            ? 'car'
            : 'enter-outline';
  const label = kindLabel(kind);
  return (
    <View accessibilityLabel={label} style={styles.kind}>
      <Ionicons name={icon} size={18} color={colors.ink} importantForAccessibility="no" accessibilityElementsHidden />
      <AppText size={15} weight="700">
        {label}
      </AppText>
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'bad' | 'good'; children: ReactNode }) {
  const bg = tone === 'bad' ? colors.brokenBg : tone === 'good' ? colors.workingBg : colors.unknownBg;
  const border = tone === 'bad' ? colors.clay : tone === 'good' ? colors.forest : colors.gold;
  return (
    <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: bg, borderColor: border }]}>
      <AppText size={17}>{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  button: {
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  field: { gap: 6 },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    color: colors.ink,
    fontSize: 18,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minHeight: 32,
  },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notice: { borderWidth: 2, borderRadius: 14, padding: 14 },
});

export type { PressableProps };
