import { SvgXml } from 'react-native-svg';

import { glyph } from '@/components/glyphs';

/** A Lucide outline icon, coloured by the caller. */
export function GlyphIcon({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const body = glyph[name] || glyph.entrance;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}
