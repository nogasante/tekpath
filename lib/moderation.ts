export const MODERATION_MIGRATION = '20261022154457_moderation_roles.sql';

export type CampusRole = 'admin' | 'moderator' | 'contributor';

export function normalizeRole(value: unknown): CampusRole {
  if (value === 'admin' || value === 'moderator' || value === 'contributor') return value;
  return 'contributor';
}

export function canOpenAdmin(role: CampusRole | null | undefined) {
  return role === 'admin' || role === 'moderator';
}

export function canManageTeam(role: CampusRole | null | undefined) {
  return role === 'admin';
}

export function roleLabel(role: CampusRole | string | null | undefined) {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'moderator':
      return 'Moderator';
    default:
      return 'Contributor';
  }
}

export function reviewBadge(status: string | null | undefined) {
  if (status === 'pending') return 'Pending review';
  if (status === 'rejected') return 'Not accepted';
  return null;
}

export function publishToast(sentForReview: boolean) {
  return sentForReview ? 'Sent for review' : 'This building is on the campus map.';
}

export function pointToast(sentForReview: boolean) {
  return sentForReview ? 'Sent for review' : 'Point saved.';
}

export function reportActionLabel(hidden: boolean) {
  return hidden ? 'Show this report' : 'Hide this report';
}

export function friendlyReportError(message: string) {
  if (/last 5 minutes/i.test(message)) {
    return 'You already reported this place in the last 5 minutes. Wait a moment and try again.';
  }
  return message;
}

export function submissionTitle(title: string | null | undefined) {
  const trimmed = title?.trim();
  return trimmed ? trimmed : 'Campus map';
}

export function placeCountLabel(count: number) {
  if (count === 1) return '1 place';
  return `${count} places`;
}

/** Drop optional columns named in a PostgREST error, so an older database still accepts the row. */
export function stripColumns(row: Record<string, unknown>, message: string, columns: string[]) {
  const hit = columns.filter((column) => message.includes(column));
  if (hit.length === 0) return null;
  const next = { ...row };
  for (const column of hit) delete next[column];
  return next;
}

export function floorOutline(layout: unknown) {
  if (!layout || typeof layout !== 'object') return [];
  const frame = (layout as { frame?: unknown }).frame;
  const outline = (layout as { outline?: unknown }).outline;
  if (frame !== 'metres' || !Array.isArray(outline)) return [];
  return outline.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const x = Number((point as { x?: unknown }).x);
    const y = Number((point as { y?: unknown }).y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{ x, y }];
  });
}

export function floorRooms(layout: unknown) {
  if (!layout || typeof layout !== 'object') return [];
  const rooms = (layout as { rooms?: unknown }).rooms;
  if (!Array.isArray(rooms)) return [];
  return rooms.flatMap((room) => {
    if (!room || typeof room !== 'object') return [];
    const name = String((room as { name?: unknown }).name ?? '');
    const x = Number((room as { x?: unknown }).x);
    const y = Number((room as { y?: unknown }).y);
    const w = Number((room as { w?: unknown }).w);
    const h = Number((room as { h?: unknown }).h);
    if (!name || ![x, y, w, h].every(Number.isFinite)) return [];
    return [{ name, x, y, w, h }];
  });
}
