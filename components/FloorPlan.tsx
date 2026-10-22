import { Circle, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { type as typeScale } from '@/lib/theme';

type Room = { name: string; x: number; y: number; w: number; h: number };

export function FloorPlan({
  rooms,
  activeName,
  planX,
  planY,
}: {
  rooms: Room[];
  activeName?: string | null;
  planX?: number | null;
  planY?: number | null;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel="Simple floor diagram. The written step is the guidance.">
      <Svg viewBox="0 0 100 100" width="100%" height={220}>
        <Rect x={1} y={1} width={98} height={98} rx={3} fill={colors.bgElevated} stroke={colors.line} strokeWidth={1} />
        {rooms.map((room) => {
          const active = activeName != null && room.name.toLowerCase().includes(activeName.toLowerCase().slice(0, 12));
          return (
            <Rect
              key={room.name}
              x={room.x}
              y={room.y}
              width={room.w}
              height={room.h}
              fill={active ? colors.primaryMuted : colors.bg}
              stroke={colors.ink}
              strokeWidth={active ? 1.6 : 0.8}
            />
          );
        })}
        {rooms.map((room) => (
          <SvgText key={`${room.name}-label`} x={room.x + 1.5} y={room.y + 5} fontSize={3.2} fill={colors.ink}>
            {room.name}
          </SvgText>
        ))}
        {planX != null && planY != null ? (
          <Circle cx={Number(planX)} cy={Number(planY)} r={2.4} fill={colors.primary} stroke={colors.bgElevated} strokeWidth={0.6} />
        ) : null}
      </Svg>
      <AppText size={typeScale.caption} color={colors.muted}>
        Diagram only. Follow the written landmark, not the drawing alone.
      </AppText>
    </View>
  );
}
