import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { type as typeScale } from '@/lib/theme';

type Room = { name: string; x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function FloorPlan({
  rooms,
  activeName,
  planX,
  planY,
  route = [],
}: {
  rooms: Room[];
  activeName?: string | null;
  planX?: number | null;
  planY?: number | null;
  route?: Point[];
}) {
  const { colors, reduceMotion } = useTheme();
  const pulse = useSharedValue(reduceMotion ? 3.2 : 2.2);
  const dash = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 3.2;
      dash.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(5.2, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, true);
    dash.value = withRepeat(withTiming(24, { duration: 1600, easing: Easing.linear }), -1, false);
  }, [dash, pulse, reduceMotion]);

  const pulseProps = useAnimatedProps(() => ({ r: pulse.value }));
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }));
  const here = planX != null && planY != null;

  return (
    <View accessibilityLabel="Floor diagram with the step-free line and your place. Follow the written landmark.">
      <Svg viewBox="0 0 100 100" width="100%" height={200}>
        <Rect x="1.5" y="1.5" width="97" height="97" rx="8" fill={colors.bg} stroke={colors.line} strokeWidth="1.2" />
        {rooms.map((room) => {
          const active = activeName != null && room.name.toLowerCase().includes(activeName.toLowerCase().slice(0, 10));
          return (
            <Rect
              key={room.name}
              x={room.x}
              y={room.y}
              width={room.w}
              height={room.h}
              rx={2.4}
              fill={active ? colors.primaryMuted : colors.bgElevated}
              stroke={active ? colors.primary : colors.line}
              strokeWidth={active ? 1.3 : 0.7}
            />
          );
        })}
        {rooms.map((room) => (
          <G key={`${room.name}-mark`}>
            <RoomGlyph name={room.name} x={room.x + room.w / 2} y={room.y + 4.6} color={colors.primary} />
            <SvgText
              x={room.x + room.w / 2}
              y={room.y + room.h - 2.4}
              fontSize={room.w > 18 ? 3.2 : 2.7}
              fontWeight="600"
              textAnchor="middle"
              fill={colors.ink}>
              {shortRoom(room.name)}
            </SvgText>
          </G>
        ))}
        {route.length > 1 ? (
          <AnimatedPath
            d={toPath(route)}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={reduceMotion ? undefined : '3 2'}
            animatedProps={lineProps}
          />
        ) : null}
        {here ? (
          <>
            <AnimatedCircle cx={Number(planX)} cy={Number(planY)} fill={colors.accentSoft} animatedProps={pulseProps} />
            <Circle cx={Number(planX)} cy={Number(planY)} r={2.1} fill={colors.primary} stroke={colors.bgElevated} strokeWidth={0.7} />
          </>
        ) : null}
      </Svg>
      <AppText size={typeScale.caption} color={colors.muted}>
        Diagram only. The written landmark is the instruction.
      </AppText>
    </View>
  );
}

function shortRoom(name: string) {
  return name.replace('Lecture Theatre', 'LT').replace('Accessible toilet', 'Toilet').replace('Ramp door', 'Ramp');
}

function RoomGlyph({ name, x, y, color }: { name: string; x: number; y: number; color: string }) {
  const key = name.toLowerCase();
  if (key.includes('lift')) {
    return (
      <G transform={`translate(${x - 1.6} ${y - 2})`}>
        <Path d="M0.6 3.2 V0.4 M0 1.2 L0.6 0.4 L1.2 1.2 M2.6 0.4 V3.2 M2 2.4 L2.6 3.2 L3.2 2.4" stroke={color} strokeWidth={0.45} fill="none" strokeLinecap="round" />
      </G>
    );
  }
  if (key.includes('stair')) {
    return <Path d={`M${x - 2} ${y + 1.4} h1.2 v-1.1 h1.2 v-1.1 h1.2`} stroke={color} strokeWidth={0.5} fill="none" strokeLinejoin="round" />;
  }
  if (key.includes('toilet')) {
    return (
      <G>
        <Circle cx={x} cy={y - 1.3} r={0.7} fill={color} />
        <Path d={`M${x} ${y - 0.3} v1.2 M${x - 1.1} ${y + 1.8} L${x} ${y + 0.8} L${x + 1.1} ${y + 1.8}`} stroke={color} strokeWidth={0.45} fill="none" strokeLinecap="round" />
      </G>
    );
  }
  if (key.includes('ramp')) {
    return <Path d={`M${x - 2} ${y + 1.6} L${x + 1.6} ${y - 1.2} h1.2 v1.2`} stroke={color} strokeWidth={0.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }
  return <Rect x={x - 1.5} y={y - 1.2} width={3} height={2.4} rx={0.4} fill="none" stroke={color} strokeWidth={0.45} />;
}

function toPath(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}
