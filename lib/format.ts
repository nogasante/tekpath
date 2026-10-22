export function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(metres: number) {
  if (!Number.isFinite(metres)) return '';
  if (metres < 950) return `${Math.max(1, Math.round(metres))} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

export function walkingMinutes(metres: number) {
  if (!Number.isFinite(metres) || metres <= 0) return null;
  return Math.max(1, Math.round(metres / 70));
}

export function formatAgo(iso: string | null) {
  if (!iso) return 'No reports yet';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'No reports yet';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `Updated ${days} d ago`;
  return `Updated ${new Date(iso).toLocaleDateString()}`;
}
