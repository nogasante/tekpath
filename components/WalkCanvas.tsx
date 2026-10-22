import Svg, { Circle, G, Path, Polyline } from 'react-native-svg';
import { View } from 'react-native';

import { fitMetres, type XY } from '@/lib/footprint';
import { useTheme } from '@/context/Theme';

type NodeMark = XY & { id: string; name: string };

/** Outline, walked trace, and the current heading, in local metres with north up. */
export function WalkCanvas({
  outline,
  trace,
  nodes,
  heading,
}: {
  outline: XY[];
  trace: XY[];
  nodes: NodeMark[];
  heading: number;
}) {
  const { colors } = useTheme();
  const fitted = fitMetres(outline.length >= 3 ? outline : trace);
  const shell = fitted.points;
  const line = trace.map((point) => fitted.mapPoint(point));
  const here = line.length ? line[line.length - 1] : null;
  const shellPath = shell.length ? `${shell.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z` : '';
  const tracePath = line.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <View accessibilityLabel={`Building outline with ${Math.max(0, trace.length - 1)} steps. North is up.`}>
      <Svg viewBox="0 0 100 100" width="100%" height={300}>
        {shellPath ? <Path d={shellPath} fill={colors.primaryMuted} stroke={colors.primary} strokeWidth={1.4} /> : null}
        {line.length > 1 ? (
          <Polyline points={tracePath} fill="none" stroke={colors.accent} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {nodes.map((node) => {
          const spot = fitted.mapPoint(node);
          return <Circle key={node.id} cx={spot.x} cy={spot.y} r={1.7} fill={colors.ink} />;
        })}
        {here ? (
          <G transform={`translate(${here.x} ${here.y}) rotate(${heading})`}>
            <Path d="M 0 -3.4 L 2.1 2.2 L -2.1 2.2 Z" fill={colors.accent} />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}
