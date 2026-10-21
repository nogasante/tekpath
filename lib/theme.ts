export const colors = {
  paper: '#F4F0E6',
  ink: '#102017',
  card: '#FFFFFF',
  line: '#1C2B23',
  forest: '#0C5C3B',
  forestDark: '#083D27',
  gold: '#6E5206',
  clay: '#8C2F1B',
  muted: '#3A4A42',
  workingBg: '#E5F6EC',
  brokenBg: '#FDE8E4',
  unknownBg: '#FFF3CC',
  focus: '#0B4F8A',
};

export const campus = {
  latitude: 6.6745,
  longitude: -1.5716,
};

export const onCampusMetres = 800;

export function statusColors(status: string) {
  if (status === 'working') return { fg: colors.forest, bg: colors.workingBg };
  if (status === 'broken') return { fg: colors.clay, bg: colors.brokenBg };
  return { fg: colors.gold, bg: colors.unknownBg };
}
