import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { haptic } from '@/lib/haptics';
import { elevation, radii, spacing } from '@/lib/theme';

export function Sheet({
  collapsed,
  expanded,
  children,
}: {
  collapsed: number;
  expanded: number;
  children: ReactNode;
}) {
  const { colors, reduceMotion } = useTheme();
  const height = useSharedValue(collapsed);
  const limits = useRef({ collapsed, expanded, reduceMotion });
  limits.current = { collapsed, expanded, reduceMotion };
  const [open, setOpen] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    if (!ready.current) {
      height.value = collapsed;
      ready.current = true;
    }
  }, [collapsed, height]);

  function snap(nextOpen: boolean) {
    const target = nextOpen ? limits.current.expanded : limits.current.collapsed;
    setOpen(nextOpen);
    void haptic('selection');
    if (limits.current.reduceMotion) height.value = target;
    else height.value = withTiming(target, { duration: 220 });
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
        onPanResponderGrant: () => undefined,
        onPanResponderMove: (_, gesture) => {
          const base = open ? limits.current.expanded : limits.current.collapsed;
          const next = base - gesture.dy;
          height.value = Math.min(limits.current.expanded, Math.max(limits.current.collapsed * 0.72, next));
        },
        onPanResponderRelease: (_, gesture) => {
          const mid = (limits.current.collapsed + limits.current.expanded) / 2;
          const nextOpen = gesture.vy < -0.4 || (gesture.vy < 0.4 && height.value > mid);
          snap(nextOpen);
        },
      }),
    [height, open],
  );

  const animated = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: radii.lg,
          borderTopRightRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.line,
          overflow: 'hidden',
        },
        elevation(colors, 3),
        animated,
      ]}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={open ? 'Campus sheet expanded' : 'Campus sheet collapsed'}
        accessibilityHint="Double tap to expand or collapse the point list. You can also drag this handle."
        onPress={() => snap(!open)}
        style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6, minHeight: 48, justifyContent: 'center' }}
        {...pan.panHandlers}>
        <View style={{ width: 48, height: 5, borderRadius: radii.pill, backgroundColor: colors.line }} />
        <AppText size={13} weight="700" color={colors.muted} style={{ marginTop: 4 }}>
          {open ? 'Show the map' : 'Drag up for every point'}
        </AppText>
      </Pressable>
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, gap: spacing.sm }}>{children}</View>
    </Animated.View>
  );
}
