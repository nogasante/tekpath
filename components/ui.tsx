import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect } from 'react';
import {
  Pressable,
  ScrollView,
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
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { haptic, type HapticKind } from '@/lib/haptics';
import { elevation, radii, spacing, statusTone, type as typeScale } from '@/lib/theme';
import { kindLabel, statusLabel } from '@/lib/types';

type IonName = keyof typeof Ionicons.glyphMap;

export function AppText({
  size = typeScale.body,
  weight = '400',
  color,
  style,
  ...props
}: TextProps & { size?: number; weight?: TextStyle['fontWeight']; color?: string }) {
  const { colors } = useTheme();
  const { textScale } = useAppState();
  const fontSize = size * textScale;
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={[{ fontSize, color: color ?? colors.ink, fontWeight: weight, lineHeight: fontSize * 1.35 }, style]}
      {...props}
    />
  );
}

export function Screen({
  children,
  scroll = false,
  edges = ['left', 'right', 'bottom'],
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'left' | 'right' | 'bottom')[];
  padded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{
            padding: padded ? spacing.lg : 0,
            gap: spacing.md,
            paddingBottom: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
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
  haptic: hapticKind,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IonName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  haptic?: HapticKind;
}) {
  const { colors } = useTheme();
  const palette =
    variant === 'primary'
      ? { bg: colors.primary, fg: colors.onPrimary, border: colors.primary }
      : variant === 'danger'
        ? { bg: colors.danger, fg: colors.onDanger, border: colors.danger }
        : variant === 'ghost'
          ? { bg: 'transparent', fg: colors.primary, border: 'transparent' }
          : { bg: colors.bgElevated, fg: colors.ink, border: colors.line };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (hapticKind) void haptic(hapticKind);
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: 52,
          paddingHorizontal: spacing.lg,
          paddingVertical: 12,
          borderRadius: radii.md,
          borderWidth: variant === 'ghost' ? 0 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
        variant !== 'ghost' && variant !== 'secondary' ? elevation(colors, 1) : null,
        style,
      ]}>
      {icon ? (
        <Ionicons name={icon} size={22} color={palette.fg} aria-hidden />
      ) : null}
      <AppText size={typeScale.body} weight="700" color={palette.fg}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function IconButton({
  label,
  icon,
  onPress,
  style,
}: {
  label: string;
  icon: IonName;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void haptic('light');
        onPress();
      }}
      style={({ pressed }) => [
        {
          width: 48,
          height: 48,
          borderRadius: radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bgElevated,
          borderWidth: 1,
          borderColor: colors.line,
          opacity: pressed ? 0.85 : 1,
        },
        elevation(colors, 2),
        style,
      ]}>
      <Ionicons name={icon} size={22} color={colors.ink} aria-hidden />
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  const { colors } = useTheme();
  const { textScale } = useAppState();
  return (
    <View style={{ gap: 6 }}>
      <AppText size={typeScale.label} weight="700" nativeID={`${label}-label`}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          {
            minHeight: rest.multiline ? 96 : 52,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: colors.bgElevated,
            color: colors.ink,
            fontSize: 17 * textScale,
            textAlignVertical: rest.multiline ? 'top' : 'center',
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { colors } = useTheme();
  const tone = statusTone(colors, status);
  const icon = status === 'working' ? 'checkmark-circle' : status === 'broken' ? 'warning' : 'help-circle';
  const label = statusLabel(status);
  return (
    <View
      accessibilityLabel={`Status: ${label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        borderRadius: radii.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        minHeight: 32,
        backgroundColor: tone.bg,
      }}>
      <Ionicons name={icon} size={16} color={tone.fg} aria-hidden />
      <AppText size={typeScale.label} weight="700" color={tone.fg}>
        {label}
      </AppText>
    </View>
  );
}

const kindIcons: Record<string, IonName> = {
  lift: 'swap-vertical',
  ramp: 'trending-up',
  toilet: 'body',
  parking: 'car',
  entrance: 'enter-outline',
};

export function KindBadge({ kind }: { kind: string }) {
  const { colors } = useTheme();
  const label = kindLabel(kind);
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}>
      <Ionicons
        name={kindIcons[kind] ?? 'location'}
        size={18}
        color={colors.ink}
        aria-hidden
      />
      <AppText size={typeScale.label} weight="700">
        {label}
      </AppText>
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'bad' | 'good'; children: ReactNode }) {
  const { colors } = useTheme();
  const bg = tone === 'bad' ? colors.brokenBg : tone === 'good' ? colors.workingBg : colors.infoBg;
  const fg = tone === 'bad' ? colors.brokenFg : tone === 'good' ? colors.workingFg : colors.infoFg;
  const icon = tone === 'bad' ? 'alert-circle' : tone === 'good' ? 'checkmark-circle' : 'information-circle';
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderRadius: radii.md,
        padding: spacing.md,
        backgroundColor: bg,
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'flex-start',
      }}>
      <Ionicons name={icon} size={22} color={fg} aria-hidden />
      <AppText size={typeScale.body} color={fg} style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.bgElevated,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.lg,
          gap: spacing.sm,
        },
        elevation(colors, 1),
        style,
      ]}>
      {children}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        void haptic('selection');
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 16,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? colors.primary : colors.bgElevated,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.line,
        opacity: pressed ? 0.88 : 1,
      })}>
      <AppText size={typeScale.label} weight="700" color={selected ? colors.onPrimary : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  onPress,
  accessibilityLabel,
  icon,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  accessibilityLabel: string;
  icon?: IonName;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        void haptic('selection');
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 64,
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.primaryMuted : colors.bgElevated,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      })}>
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.primaryMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name={icon} size={20} color={colors.primary} aria-hidden />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="700">{title}</AppText>
        {subtitle ? (
          <AppText size={typeScale.label} color={colors.muted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} aria-hidden />
    </Pressable>
  );
}

export function EmptyState({ icon, title, body }: { icon: IonName; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm }}>
      <Ionicons name={icon} size={28} color={colors.primary} aria-hidden />
      <AppText size={typeScale.headline} weight="700">
        {title}
      </AppText>
      <AppText color={colors.muted}>{body}</AppText>
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%' as const }: { height?: number; width?: number | `${number}%` }) {
  const { colors, reduceMotion } = useTheme();
  const opacity = useSharedValue(reduceMotion ? 0.7 : 0.4);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      aria-hidden
      style={[{ height, width, borderRadius: radii.sm, backgroundColor: colors.line }, animated]}
    />
  );
}

export type { PressableProps };
