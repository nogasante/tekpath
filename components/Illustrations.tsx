import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/context/Theme';

const skin = ['#C68642', '#8D5524', '#E0AC69'];

export function KenteBand() {
  const stripes = ['#0F6E56', '#E8A06A', '#F7F4EF', '#8E4522', '#0F6E56', '#E8A06A', '#1C2420', '#F7F4EF'];
  return (
    <View aria-hidden style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
      {stripes.map((color, index) => (
        <View key={`${color}-${index}`} style={{ flex: index % 3 === 0 ? 1.4 : 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

function SceneFrame({ children }: { children: ReactNode }) {
  return (
    <Svg viewBox="0 0 320 200" width="100%" height={200}>
      <Rect x="0" y="0" width="320" height="200" rx="28" fill="#F3EBE3" />
      <Ellipse cx="160" cy="176" rx="128" ry="18" fill="#E7F3EE" />
      {children}
    </Svg>
  );
}

export function WheelchairScene() {
  return (
    <View accessibilityLabel="A student using a wheelchair approaches a campus ramp">
      <SceneFrame>
        <Path d="M248 78 H292 V168 H248 Z" fill="#FFFCF8" />
        <Path d="M248 78 H292" stroke="#0F6E56" strokeWidth="6" strokeLinecap="round" />
        <Rect x="262" y="98" width="16" height="28" rx="2" fill="#D7E8E2" />
        <Path d="M188 168 L236 124 H258" fill="none" stroke="#FFFCF8" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M188 168 L236 124 H258" fill="none" stroke="#0F6E56" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx="118" cy="78" r="15" fill={skin[0]} />
        <Path d="M108 70c6-10 18-10 22 0" fill="none" stroke="#1C2420" strokeWidth="3" strokeLinecap="round" />
        <Path d="M104 96c10-10 30-8 36 6l6 22h-16l-4 16h-14l6-16-10-8z" fill="#0F6E56" />
        <Path d="M128 118c8 6 18 8 22 16" fill="none" stroke={skin[0]} strokeWidth="7" strokeLinecap="round" />
        <Circle cx="96" cy="150" r="28" fill="#FFFCF8" stroke="#1C2420" strokeWidth="5" />
        <Path d="M96 126 V174 M74 150 H118 M80 134 L112 166 M80 166 L112 134" stroke="#1C2420" strokeWidth="2" />
        <Circle cx="96" cy="150" r="5" fill="#C46A3A" />
        <Path d="M112 138 H156" stroke="#1C2420" strokeWidth="5" strokeLinecap="round" />
        <Circle cx="162" cy="156" r="9" fill="none" stroke="#1C2420" strokeWidth="4" />
        <Path d="M148 138 L162 156" stroke="#1C2420" strokeWidth="4" strokeLinecap="round" />
        <Path d="M118 112 H142" stroke="#C46A3A" strokeWidth="5" strokeLinecap="round" />
      </SceneFrame>
    </View>
  );
}

export function CrutchesScene() {
  return (
    <View accessibilityLabel="A student with crutches waits beside a lift">
      <SceneFrame>
        <Rect x="196" y="36" width="86" height="132" rx="10" fill="#FFFCF8" />
        <Path d="M239 36 V168" stroke="#E4DCD2" strokeWidth="3" />
        <Path d="M214 92 L226 78" stroke="#0F6E56" strokeWidth="4" strokeLinecap="round" />
        <Path d="M214 92 L226 106" stroke="#0F6E56" strokeWidth="4" strokeLinecap="round" />
        <Circle cx="214" cy="92" r="4" fill="#0F6E56" />
        <Circle cx="132" cy="64" r="15" fill={skin[1]} />
        <Path d="M122 56c6-10 18-8 22 2" fill="none" stroke="#1C2420" strokeWidth="3" strokeLinecap="round" />
        <Path d="M118 82c8-8 26-6 32 6l2 28h-14l2 18h-12l-2-18-12-10z" fill="#8E4522" />
        <Path d="M124 128c-6 10-4 22 2 30" fill="none" stroke={skin[1]} strokeWidth="7" strokeLinecap="round" />
        <Path d="M142 130c8 6 10 18 6 30" fill="none" stroke={skin[1]} strokeWidth="7" strokeLinecap="round" />
        <Path d="M108 78 L86 168" stroke="#1C2420" strokeWidth="5" strokeLinecap="round" />
        <Path d="M156 84 L174 168" stroke="#1C2420" strokeWidth="5" strokeLinecap="round" />
        <Path d="M80 96 H112" stroke="#C46A3A" strokeWidth="5" strokeLinecap="round" />
        <Path d="M150 100 H180" stroke="#C46A3A" strokeWidth="5" strokeLinecap="round" />
        <Path d="M78 164 H96" stroke="#1C2420" strokeWidth="4" strokeLinecap="round" />
        <Path d="M166 164 H184" stroke="#1C2420" strokeWidth="4" strokeLinecap="round" />
      </SceneFrame>
    </View>
  );
}

export function CaneScene() {
  return (
    <View accessibilityLabel="A student with a white cane walks a campus path beside a friend">
      <SceneFrame>
        <Path d="M36 168 H150" stroke="#F7F4EF" strokeWidth="10" strokeLinecap="round" />
        {[48, 66, 84, 102, 120].map((x) => (
          <Rect key={x} x={x} y="164" width="8" height="8" rx="1.5" fill="#E8A06A" />
        ))}
        <Circle cx="112" cy="70" r="15" fill={skin[2]} />
        <Path d="M102 62c6-10 18-8 22 2" fill="none" stroke="#1C2420" strokeWidth="3" strokeLinecap="round" />
        <Path d="M100 88c8-8 26-6 30 6l4 26h-14l-2 24h-12l4-24-12-8z" fill="#0F6E56" />
        <Path d="M128 118 L168 166" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
        <Path d="M156 154 L168 166" stroke="#9B1C1C" strokeWidth="6" strokeLinecap="round" />
        <Circle cx="196" cy="74" r="15" fill={skin[0]} />
        <Path d="M186 66c6-10 18-8 22 2" fill="none" stroke="#1C2420" strokeWidth="3" strokeLinecap="round" />
        <Path d="M184 92c8-8 26-6 30 6l2 24h-14l-2 22h-12l4-22-12-8z" fill="#C46A3A" />
        <Rect x="236" y="78" width="52" height="40" rx="8" fill="#FFFCF8" />
        <Path d="M248 90 H276" stroke="#0F6E56" strokeWidth="4" strokeLinecap="round" />
        <Path d="M248 102 H268" stroke="#E8A06A" strokeWidth="4" strokeLinecap="round" />
      </SceneFrame>
    </View>
  );
}

export function BlockedRouteArt() {
  const { colors } = useTheme();
  return (
    <Svg viewBox="0 0 280 140" width="100%" height={140} accessibilityLabel="A ramp is blocked, and another path is still open">
      <Rect x="0" y="0" width="280" height="140" rx="24" fill={colors.accentMuted} />
      <Path d="M28 108 H120 L92 72" fill="none" stroke={colors.primary} strokeWidth="6" strokeLinecap="round" />
      <Path d="M104 78 H132" stroke={colors.brokenFg} strokeWidth="6" strokeLinecap="round" />
      <Path d="M118 64 L132 92" stroke={colors.brokenFg} strokeWidth="6" strokeLinecap="round" />
      <Path d="M156 108 C190 108 190 64 230 64" fill="none" stroke={colors.primary} strokeWidth="5" strokeLinecap="round" strokeDasharray="2 8" />
      <Circle cx="230" cy="64" r="8" fill={colors.primary} />
    </Svg>
  );
}
