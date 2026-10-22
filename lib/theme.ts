export const campus = {
  latitude: 6.6745,
  longitude: -1.5716,
};

export const onCampusMetres = 800;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const type = {
  display: 34,
  title: 28,
  headline: 22,
  body: 17,
  label: 15,
  caption: 13,
} as const;

/** Status inks for markers on the light OpenStreetMap tiles. */
export const markerInk = {
  working: '#0B5C34',
  broken: '#9B1C1C',
  unknown: '#8A5A00',
  halo: '#FFFFFF',
  brand: '#0F6E56',
} as const;

export type Palette = {
  bg: string;
  bgElevated: string;
  ink: string;
  muted: string;
  line: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primaryMuted: string;
  danger: string;
  onDanger: string;
  focus: string;
  shadow: string;
  workingFg: string;
  workingBg: string;
  brokenFg: string;
  brokenBg: string;
  unknownFg: string;
  unknownBg: string;
  infoFg: string;
  infoBg: string;
  overlay: string;
};

export const light: Palette = {
  bg: '#F3F6F4',
  bgElevated: '#FFFFFF',
  ink: '#10211A',
  muted: '#3E534A',
  line: '#D5DED8',
  primary: '#0F6E56',
  primaryPressed: '#0A5644',
  onPrimary: '#FFFFFF',
  primaryMuted: '#E5F4EF',
  danger: '#9B1C1C',
  onDanger: '#FFFFFF',
  focus: '#0B4F8A',
  shadow: '#10211A',
  workingFg: '#0B5C34',
  workingBg: '#E5F6EC',
  brokenFg: '#8E1B12',
  brokenBg: '#FDECEA',
  unknownFg: '#6B4508',
  unknownBg: '#FFF6DE',
  infoFg: '#0B4F8A',
  infoBg: '#E7F1FB',
  overlay: 'rgba(16, 33, 26, 0.45)',
};

export const dark: Palette = {
  bg: '#0E1512',
  bgElevated: '#17211C',
  ink: '#F4F7F5',
  muted: '#C5D1CB',
  line: '#2C3B34',
  primary: '#0F6E56',
  primaryPressed: '#14866A',
  onPrimary: '#FFFFFF',
  primaryMuted: '#14332B',
  danger: '#E57A72',
  onDanger: '#2A0C0A',
  focus: '#9CC4F0',
  shadow: '#000000',
  workingFg: '#B6F0D2',
  workingBg: '#12382A',
  brokenFg: '#FFB4A8',
  brokenBg: '#3A1816',
  unknownFg: '#FFD58A',
  unknownBg: '#3A2A10',
  infoFg: '#C5DDF8',
  infoBg: '#13283A',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export type StatusTone = { fg: string; bg: string; symbol: string };

export function statusTone(colors: Palette, status: string): StatusTone {
  if (status === 'working') return { fg: colors.workingFg, bg: colors.workingBg, symbol: '✓' };
  if (status === 'broken') return { fg: colors.brokenFg, bg: colors.brokenBg, symbol: '!' };
  return { fg: colors.unknownFg, bg: colors.unknownBg, symbol: '?' };
}

export function elevation(colors: Palette, level: 1 | 2 | 3) {
  const blur = level === 1 ? 10 : level === 2 ? 18 : 28;
  const height = level === 1 ? 3 : level === 2 ? 8 : 14;
  const opacity = level === 1 ? 0.1 : level === 2 ? 0.14 : 0.2;
  return {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height },
    shadowOpacity: opacity,
    shadowRadius: blur,
    elevation: level * 4,
  };
}
