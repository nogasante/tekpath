import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/context/Theme';
import { haptic } from '@/lib/haptics';
import { elevation, radii } from '@/lib/theme';

export function Sheet({
  snaps,
  focus = 0,
  children,
}: {
  snaps: number[];
  focus?: number;
  children: ReactNode;
}) {
  const { colors, reduceMotion } = useTheme();
  const limits = useRef({ snaps, reduceMotion });
  limits.current = { snaps, reduceMotion };
  const height = useSharedValue(snaps[0] ?? 240);
  const [index, setIndex] = useState(focus);
  const indexRef = useRef(index);
  indexRef.current = index;

  function move(next: number, announce: boolean) {
    const list = limits.current.snaps;
    const safe = Math.max(0, Math.min(list.length - 1, next));
    setIndex(safe);
    const target = list[safe] ?? list[0] ?? 240;
    if (announce) void haptic('selection');
    if (limits.current.reduceMotion) height.value = target;
    else height.value = withTiming(target, { duration: 280 });
  }

  useEffect(() => {
    move(focus, false);
    // The parent chooses the snap when the selection changes. Dragging still owns the gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, snaps.join('|')]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
        onPanResponderMove: (_, gesture) => {
          const list = limits.current.snaps;
          const base = list[indexRef.current] ?? list[0];
          const next = base - gesture.dy;
          const min = (list[0] ?? 180) * 0.86;
          const max = list[list.length - 1] ?? base;
          height.value = Math.min(max, Math.max(min, next));
        },
        onPanResponderRelease: (_, gesture) => {
          const list = limits.current.snaps;
          let next = nearest(height.value, list);
          if (gesture.vy < -0.45) next = Math.min(list.length - 1, next + 1);
          else if (gesture.vy > 0.45) next = Math.max(0, next - 1);
          move(next, true);
        },
      }),
    [height],
  );

  const animated = useAnimatedStyle(() => ({ height: height.value }));
  const names = ['peek', 'half', 'full'];

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
          overflow: 'hidden',
        },
        elevation(colors, 3),
        animated,
      ]}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={`Campus points, ${names[index] ?? 'open'}`}
        accessibilityHint="Double tap to change the sheet height. You can also drag this handle."
        accessibilityValue={{ min: 0, max: snaps.length - 1, now: index }}
        onPress={() => move((index + 1) % snaps.length, true)}
        style={{ alignItems: 'center', paddingTop: 8, minHeight: 48, justifyContent: 'center' }}
        {...pan.panHandlers}>
        <View style={{ width: 42, height: 5, borderRadius: radii.pill, backgroundColor: colors.line }} />
      </Pressable>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}

function nearest(value: number, snaps: number[]) {
  let best = 0;
  let dist = Number.POSITIVE_INFINITY;
  snaps.forEach((snap, item) => {
    const delta = Math.abs(snap - value);
    if (delta < dist) {
      dist = delta;
      best = item;
    }
  });
  return best;
}
