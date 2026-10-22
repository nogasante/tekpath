import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canManageTeam,
  canOpenAdmin,
  floorOutline,
  floorRooms,
  friendlyReportError,
  normalizeRole,
  placeCountLabel,
  pointToast,
  publishToast,
  reportActionLabel,
  reviewBadge,
  roleLabel,
  stripColumns,
  submissionTitle,
} from '../lib/moderation.ts';

test('roles and review copy stay human', () => {
  assert.equal(normalizeRole('admin'), 'admin');
  assert.equal(normalizeRole('nope'), 'contributor');
  assert.equal(canOpenAdmin('moderator'), true);
  assert.equal(canOpenAdmin('contributor'), false);
  assert.equal(canManageTeam('admin'), true);
  assert.equal(canManageTeam('moderator'), false);
  assert.equal(roleLabel('moderator'), 'Moderator');
  assert.equal(reviewBadge('pending'), 'Pending review');
  assert.equal(reviewBadge('rejected'), 'Not accepted');
  assert.equal(reviewBadge('approved'), null);
  assert.equal(publishToast(true), 'Sent for review');
  assert.equal(publishToast(false), 'This building is on the campus map.');
  assert.equal(pointToast(true), 'Sent for review');
  assert.equal(reportActionLabel(true), 'Show this report');
  assert.equal(reportActionLabel(false), 'Hide this report');
  assert.match(friendlyReportError('You already reported this place in the last 5 minutes.'), /5 minutes/);
  assert.equal(submissionTitle('  '), 'Campus map');
  assert.equal(submissionTitle('Library'), 'Library');
  assert.equal(placeCountLabel(1), '1 place');
  assert.equal(placeCountLabel(3), '3 places');
});

test('optional columns drop only when the database names them', () => {
  const row = { name: 'Library', submission_id: 'abc', area_m2: 12 };
  assert.equal(stripColumns(row, 'null value in column name', ['submission_id']), null);
  const next = stripColumns(row, 'Could not find the submission_id column', ['submission_id', 'area_m2']);
  assert.deepEqual(next, { name: 'Library', area_m2: 12 });
});

test('floor preview reads a walked outline or a room diagram', () => {
  assert.deepEqual(floorOutline({ frame: 'metres', outline: [{ x: 0, y: 0 }, { x: 1, y: 2 }] }), [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
  ]);
  assert.deepEqual(floorOutline({ rooms: [{ name: 'Lobby', x: 1, y: 2, w: 3, h: 4 }] }), []);
  assert.deepEqual(floorRooms({ rooms: [{ name: 'Lobby', x: 1, y: 2, w: 3, h: 4 }, { name: '' }] }), [
    { name: 'Lobby', x: 1, y: 2, w: 3, h: 4 },
  ]);
});
