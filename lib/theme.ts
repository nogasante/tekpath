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
  sm: 12,
  md: 18,
  lg: 28,
  pill: 999,
} as const;

export const type = {
  display: 32,
  title: 26,
  headline: 20,
  body: 16,
  label: 14,
  caption: 12,
} as const;

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export function fontFamily(weight?: string | number) {
  const value = String(weight ?? '400');
  if (value === '700' || value === 'bold' || value === '800' || value === '900') return font.bold;
  if (value === '600') return font.semibold;
  if (value === '500') return font.medium;
  return font.regular;
}

/** Status inks for markers. White pin bodies keep these readable on both basemaps. */
export const markerInk = {
  working: '#0B5C34',
  broken: '#9B1C1C',
  unknown: '#8A5A00',
  halo: '#FFFFFF',
  brand: '#0F6E56',
  accent: '#C46A3A',
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
  accent: string;
  accentSoft: string;
  accentMuted: string;
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
  glassBorder: string;
};

export const light: Palette = {
  bg: '#F7F4EF',
  bgElevated: '#FFFCF8',
  ink: '#1C2420',
  muted: '#3E534A',
  line: '#E4DCD2',
  primary: '#0F6E56',
  primaryPressed: '#0A5644',
  onPrimary: '#FFFFFF',
  primaryMuted: '#E5F3EE',
  accent: '#8E4522',
  accentSoft: '#E8A06A',
  accentMuted: '#F8E8DE',
  danger: '#9B1C1C',
  onDanger: '#FFFFFF',
  focus: '#0B4F8A',
  shadow: '#1C2420',
  workingFg: '#0B5C34',
  workingBg: '#E5F6EC',
  brokenFg: '#8E1B12',
  brokenBg: '#FDECEA',
  unknownFg: '#6B4508',
  unknownBg: '#FFF6DE',
  infoFg: '#0B4F8A',
  infoBg: '#E7F1FB',
  overlay: 'rgba(28, 36, 32, 0.42)',
  glassBorder: 'rgba(255, 252, 248, 0.85)',
};

export const dark: Palette = {
  bg: '#101614',
  bgElevated: '#1C2622',
  ink: '#F6F1E8',
  muted: '#C5D0C9',
  line: '#31403A',
  primary: '#117A63',
  primaryPressed: '#0F6E56',
  onPrimary: '#FFFFFF',
  primaryMuted: '#16352C',
  accent: '#F0C2A4',
  accentSoft: '#E8A06A',
  accentMuted: '#3A2A22',
  danger: '#FFB4A8',
  onDanger: '#2A0C0A',
  focus: '#B7D4F6',
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
  glassBorder: 'rgba(255, 248, 240, 0.16)',
};

export type StatusTone = { fg: string; bg: string; symbol: string };

export function statusTone(colors: Palette, status: string): StatusTone {
  if (status === 'working') return { fg: colors.workingFg, bg: colors.workingBg, symbol: '✓' };
  if (status === 'broken') return { fg: colors.brokenFg, bg: colors.brokenBg, symbol: '!' };
  return { fg: colors.unknownFg, bg: colors.unknownBg, symbol: '?' };
}

export function elevation(colors: Palette, level: 1 | 2 | 3) {
  const blur = level === 1 ? 12 : level === 2 ? 20 : 32;
  const height = level === 1 ? 4 : level === 2 ? 10 : 16;
  const opacity = level === 1 ? 0.08 : level === 2 ? 0.12 : 0.18;
  return {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height },
    shadowOpacity: opacity,
    shadowRadius: blur,
    elevation: level * 3,
  };
}
