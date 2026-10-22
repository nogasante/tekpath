export const TAB_BAR_BASE = 64;

export type BoxInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Tab bar height is the content row plus the system navigation inset. */
export function tabBarHeight(bottomInset: number) {
  return TAB_BAR_BASE + nonNegative(bottomInset);
}

/**
 * Padding for the native map. The Google logo and my-location control sit inside
 * this box, so it has to clear the floating header, side controls, the sheet, and
 * any inset the map itself still draws into.
 */
export function mapPaddingForInsets(insets: BoxInsets, peek: number, wide: boolean) {
  const sheet = wide ? 48 : Math.max(0, peek) + 12;
  const bottomInset = nonNegative(insets.bottom);
  return {
    top: nonNegative(insets.top) + 128,
    right: 20 + nonNegative(insets.right),
    bottom: Math.max(sheet, bottomInset),
    left: 72 + nonNegative(insets.left),
  };
}
