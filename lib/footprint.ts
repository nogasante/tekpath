/** Building outlines in geographic coordinates and local metres. Pure functions. */

export type LngLat = { longitude: number; latitude: number };
export type XY = { x: number; y: number };

const M_PER_DEG_LAT = 111_320;

export function metresPerDegLng(latitude: number) {
  return M_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180);
}

export function toLocal(origin: LngLat, point: LngLat): XY {
  return {
    x: (point.longitude - origin.longitude) * metresPerDegLng(origin.latitude),
    y: (point.latitude - origin.latitude) * M_PER_DEG_LAT,
  };
}

export function toLngLat(origin: LngLat, point: XY): LngLat {
  const lngScale = metresPerDegLng(origin.latitude);
  return {
    longitude: origin.longitude + (lngScale === 0 ? 0 : point.x / lngScale),
    latitude: origin.latitude + point.y / M_PER_DEG_LAT,
  };
}

export function samePoint(a: LngLat, b: LngLat, epsilon = 1e-10) {
  return Math.abs(a.longitude - b.longitude) <= epsilon && Math.abs(a.latitude - b.latitude) <= epsilon;
}

export function openRing<T extends XY>(ring: T[]): T[] {
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) return ring.slice(0, -1);
  }
  return ring;
}

export function closeLngLatRing(ring: LngLat[]): LngLat[] {
  if (ring.length < 3) return ring.slice();
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (samePoint(first, last)) return ring.slice();
  return [...ring, { ...first }];
}

export function normDeg(deg: number) {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function angleDelta(a: number, b: number) {
  const delta = Math.abs(normDeg(a) - normDeg(b)) % 360;
  return delta > 180 ? 360 - delta : delta;
}

/** Compass bearing of the longest wall, folded into [0, 180). East-west is 90. */
export function dominantAxisDeg(ring: XY[]) {
  const open = openRing(ring);
  if (open.length < 2) return 90;
  let bestLen = -1;
  let best = 90;
  for (let i = 0; i < open.length; i += 1) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      const bearing = normDeg((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI);
      best = bearing % 180;
    }
  }
  return best;
}

export function polygonArea(ring: XY[]) {
  const open = openRing(ring);
  if (open.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < open.length; i += 1) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(ring: XY[]) {
  const open = openRing(ring);
  if (open.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < open.length; i += 1) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

export function pointInPolygon(point: XY, ring: XY[]) {
  const open = openRing(ring);
  if (open.length < 3) return false;
  let inside = false;
  for (let i = 0, j = open.length - 1; i < open.length; j = i, i += 1) {
    const a = open[i];
    const b = open[j];
    const crosses = a.y > point.y !== b.y > point.y;
    if (!crosses) continue;
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < x) inside = !inside;
  }
  return inside;
}

export function projectToSegment(point: XY, a: XY, b: XY): XY {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return { x: a.x, y: a.y };
  const t = Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby) / len2));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

export function nearestOnOutline(point: XY, ring: XY[]) {
  const open = openRing(ring);
  let best = { x: point.x, y: point.y };
  let distance = Number.POSITIVE_INFINITY;
  let edgeIndex = 0;
  if (open.length < 2) return { point: best, distance: 0, edgeIndex };
  for (let i = 0; i < open.length; i += 1) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    const projected = projectToSegment(point, a, b);
    const gap = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (gap < distance) {
      distance = gap;
      best = projected;
      edgeIndex = i;
    }
  }
  return { point: best, distance, edgeIndex };
}

export function containsPoint(point: XY, ring: XY[], epsilon = 1e-4) {
  if (ring.length < 3) return true;
  if (pointInPolygon(point, ring)) return true;
  return nearestOnOutline(point, ring).distance <= epsilon;
}

/** Keep a drifted position inside the outline by projecting it onto the boundary. */
export function clampToPolygon(point: XY, ring: XY[]): XY {
  if (ring.length < 3) return point;
  if (pointInPolygon(point, ring)) return point;
  const nearest = nearestOnOutline(point, ring);
  if (nearest.distance <= 1e-4) return point;
  return nearest.point;
}

export function clampTrace(trace: XY[], ring: XY[]): XY[] {
  if (ring.length < 3) return trace.map((point) => ({ ...point }));
  return trace.map((point) => clampToPolygon(point, ring));
}

export function snapToOutline(point: XY, ring: XY[]) {
  return nearestOnOutline(point, ring);
}

/** Full span of the outline along a compass bearing and the axis 90° from it. */
export function buildingExtents(ring: XY[], axisDeg: number) {
  const open = openRing(ring);
  if (!open.length) return { along: 0, across: 0 };
  const rad = (axisDeg * Math.PI) / 180;
  const alongX = Math.sin(rad);
  const alongY = Math.cos(rad);
  const acrossX = Math.sin(rad + Math.PI / 2);
  const acrossY = Math.cos(rad + Math.PI / 2);
  let minA = Number.POSITIVE_INFINITY;
  let maxA = Number.NEGATIVE_INFINITY;
  let minC = Number.POSITIVE_INFINITY;
  let maxC = Number.NEGATIVE_INFINITY;
  for (const point of open) {
    const along = point.x * alongX + point.y * alongY;
    const across = point.x * acrossX + point.y * acrossY;
    minA = Math.min(minA, along);
    maxA = Math.max(maxA, along);
    minC = Math.min(minC, across);
    maxC = Math.max(maxC, across);
  }
  return { along: Math.max(0, maxA - minA), across: Math.max(0, maxC - minC) };
}

export function measureFootprint(ring: LngLat[]) {
  if (ring.length < 3) return { areaM2: 0, perimeterM: 0, axisDeg: 90, local: [] as XY[] };
  const origin = ring[0];
  const local = ring.map((point) => toLocal(origin, point));
  return {
    areaM2: polygonArea(local),
    perimeterM: polygonPerimeter(local),
    axisDeg: dominantAxisDeg(local),
    local,
  };
}

export function ringToGeoJson(ring: LngLat[]) {
  const closed = closeLngLatRing(ring);
  return {
    type: 'Polygon' as const,
    coordinates: [closed.map((point) => [point.longitude, point.latitude])],
  };
}

export function ringFromGeoJson(value: unknown): LngLat[] | null {
  if (!value || typeof value !== 'object') return null;
  const polygon = value as { type?: string; coordinates?: unknown };
  if (polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates)) return null;
  const outer = polygon.coordinates[0];
  if (!Array.isArray(outer)) return null;
  const ring: LngLat[] = [];
  for (const pair of outer) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const longitude = Number(pair[0]);
    const latitude = Number(pair[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    ring.push({ longitude, latitude });
  }
  return ring.length >= 4 ? ring : null;
}

/** Fit a local-metre ring into the 0–100 floor-plan square, north up. */
export function fitMetres(ring: XY[], pad = 8) {
  const open = openRing(ring);
  if (!open.length) {
    return { points: [] as XY[], mapPoint: (point: XY) => point };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of open) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(maxX - minX, 0.001);
  const spanY = Math.max(maxY - minY, 0.001);
  const scale = Math.min((100 - pad * 2) / spanX, (100 - pad * 2) / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const ox = (100 - usedW) / 2;
  const oy = (100 - usedH) / 2;
  const mapPoint = (point: XY): XY => ({
    x: ox + (point.x - minX) * scale,
    y: oy + (maxY - point.y) * scale,
  });
  return { points: open.map(mapPoint), mapPoint };
}

/** Stretch a geographic outline into the diagram square the seeded rooms already use. */
export function diagramOutline(ring: LngLat[], pad = 4): XY[] {
  if (ring.length < 3) return [];
  const local = ring.map((point) => toLocal(ring[0], point));
  const open = openRing(local);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of open) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(maxX - minX, 0.001);
  const spanY = Math.max(maxY - minY, 0.001);
  return open.map((point) => ({
    x: pad + ((point.x - minX) / spanX) * (100 - pad * 2),
    y: pad + ((maxY - point.y) / spanY) * (100 - pad * 2),
  }));
}

export function formatArea(areaM2: number) {
  return `${Math.round(areaM2).toLocaleString('en-GB')} m²`;
}

export function formatPerimeter(perimeterM: number) {
  return `${Math.round(perimeterM).toLocaleString('en-GB')} m perimeter`;
}

export function footprintCaption(areaM2: number | null | undefined, perimeterM: number | null | undefined) {
  const parts: string[] = [];
  if (typeof areaM2 === 'number' && Number.isFinite(areaM2)) parts.push(formatArea(areaM2));
  if (typeof perimeterM === 'number' && Number.isFinite(perimeterM)) parts.push(formatPerimeter(perimeterM));
  return parts.length ? parts.join(' · ') : null;
}
