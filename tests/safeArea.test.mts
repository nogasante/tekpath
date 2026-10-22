import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TAB_BAR_BASE, mapPaddingForInsets, tabBarHeight } from '../lib/safeArea.ts';

const phone = { top: 48, right: 0, bottom: 48, left: 0 };
const gesture = { top: 48, right: 0, bottom: 24, left: 0 };
const landscape = { top: 0, right: 24, bottom: 20, left: 48 };

test('tab bar height is the base row plus the bottom inset', () => {
  assert.equal(TAB_BAR_BASE, 64);
  assert.equal(tabBarHeight(0), 64);
  assert.equal(tabBarHeight(48), 112);
  assert.equal(tabBarHeight(24), 88);
  assert.equal(tabBarHeight(-10), 64);
});

test('map padding clears the header, sheet, and side insets', () => {
  const padding = mapPaddingForInsets(phone, 248, false);
  assert.equal(padding.top, 48 + 128);
  assert.equal(padding.left, 72);
  assert.equal(padding.right, 20);
  assert.equal(padding.bottom, 248 + 12);

  const gesturePadding = mapPaddingForInsets(gesture, 248, false);
  assert.equal(gesturePadding.bottom, 248 + 12);

  const wide = mapPaddingForInsets(phone, 248, true);
  assert.equal(wide.bottom, 48);

  const side = mapPaddingForInsets(landscape, 200, false);
  assert.equal(side.left, 72 + 48);
  assert.equal(side.right, 20 + 24);
  assert.equal(side.top, 128);
  assert.equal(side.bottom, 200 + 12);
});
