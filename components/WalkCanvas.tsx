import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Polyline, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { fitMetres, type XY } from '@/lib/footprint';
import { radii, spacing } from '@/lib/theme';

type NodeMark = XY & { id: string; name: string; n?: number };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Outline, walked trace, and a heading arrow. North is up. */
export function WalkCanvas({
  outline,
  trace,
  nodes,
  heading,
  floorName,
  stepCount,
  distanceLabel,
  showYou = true,
}: {
  outline: XY[];
  trace: XY[];
  nodes: NodeMark[];
  heading: number;
  floorName?: string;
  stepCount?: number;
  distanceLabel?: string;
  showYou?: boolean;
}) {
  const { colors, reduceMotion } = useTheme();
  const pulse = useSharedValue(reduceMotion ? 4.6 : 2.8);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 4.6;
      return;
    }
    pulse.value = withRepeat(withTiming(6.2, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse, reduceMotion]);

  const pulseProps = useAnimatedProps(() => ({ r: pulse.value }));
  const [box, setBox] = useState({ width: 0, height: 0 });
  const fitted = fitMetres(outline.length >= 3 ? outline : trace);
  const shell = fitted.points;
  const line = trace.map((point) => fitted.mapPoint(point));
  const here = line.length ? line[line.length - 1] : null;
  const shellPath = shell.length ? `${shell.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z` : '';
  const tracePath = line.map((point) => `${point.x},${point.y}`).join(' ');
  const showStats = floorName != null || stepCount != null || distanceLabel != null;

  return (
    <View
      style={{ flex: 1, minHeight: 220, backgroundColor: colors.bg }}
      accessibilityLabel="Building outline, the path you have walked, and your heading. North is up."
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}>
      {box.width > 0 && box.height > 0 ? (
      <Svg viewBox="0 0 100 100" width={box.width} height={box.height} preserveAspectRatio="xMidYMid meet">
        {shellPath ? <Path d={shellPath} fill={colors.primaryMuted} stroke={colors.primary} strokeWidth={1.5} /> : null}
        {line.length > 1 ? (
          <Polyline points={tracePath} fill="none" stroke={colors.accent} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {nodes.map((node) => {
          const spot = fitted.mapPoint(node);
          const numbered = node.n != null;
          return (
            <G key={node.id}>
              <Circle cx={spot.x} cy={spot.y} r={numbered ? 3.4 : 1.8} fill={colors.bgElevated} stroke={colors.primary} strokeWidth={0.5} />
              {numbered ? (
                <SvgText x={spot.x} y={spot.y + 1.2} fontSize={3.1} fontWeight="700" fill={colors.primary} textAnchor="middle">
                  {node.n}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {showYou && here ? (
          <G transform={`translate(${here.x} ${here.y})`}>
            <AnimatedCircle animatedProps={pulseProps} cx={0} cy={0} fill={colors.accent} opacity={0.28} />
            <G rotation={heading}>
              <Path d="M 0 -4.4 L 2.5 2.8 L 0 1.2 L -2.5 2.8 Z" fill={colors.accent} />
            </G>
          </G>
        ) : null}
      </Svg>
      ) : null}
      {showStats ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: spacing.md,
            right: spacing.md,
            top: spacing.md,
            borderRadius: radii.md,
            backgroundColor: colors.bgElevated,
            borderWidth: 1,
            borderColor: colors.line,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}>
          {floorName != null ? (
            <AppText weight="700" numberOfLines={1}>
              {floorName}
            </AppText>
          ) : null}
          {stepCount != null ? (
            <AppText weight="600" color={colors.muted}>
              {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            </AppText>
          ) : null}
          {distanceLabel != null ? (
            <AppText weight="600" color={colors.muted}>
              {distanceLabel}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
