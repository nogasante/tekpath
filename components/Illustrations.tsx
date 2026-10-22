import { useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { confirmed, directions, lost, navigation, walking_together } from '@/components/undraw';

function viewBoxSize(xml: string) {
  const match = xml.match(/viewBox="([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)"/);
  if (!match) return { width: 1, height: 1 };
  return { width: Number(match[3]), height: Number(match[4]) };
}

function Scene({ xml, label, maxHeight = 248 }: { xml: string; label: string; maxHeight?: number }) {
  const { width } = useWindowDimensions();
  const frame = Math.min(Math.max(width - 72, 240), 420);
  const box = viewBoxSize(xml);
  const aspect = box.width / box.height;
  const height = Math.min(maxHeight, frame / aspect);
  const artWidth = Math.round(height * aspect);
  return (
    <View
      accessibilityLabel={label}
      style={{ width: '100%', height, borderRadius: 28, backgroundColor: '#FFFCF8', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <SvgXml xml={xml} width={artWidth} height={height} />
    </View>
  );
}

export function DirectionsArt() {
  return <Scene xml={directions} label="A person checking a map" />;
}

export function WalkingTogetherArt() {
  return <Scene xml={walking_together} label="Two people walking together" />;
}

export function NavigationArt() {
  return <Scene xml={navigation} label="A person following directions on a phone" />;
}

export function LostArt() {
  return <Scene xml={lost} label="A person with a map, looking for another way" />;
}

export function ConfirmedArt() {
  return <Scene xml={confirmed} label="A phone showing a confirmed check" maxHeight={188} />;
}
