/** OpenStreetMap building outlines and entrance=* nodes, via Overpass. */

import { containsPoint, measureFootprint, nearestOnOutline, toLocal, type LngLat } from '@/lib/footprint';

export type OsmEntrance = LngLat & { name: string };
export type OsmBuilding = {
  id: number;
  name: string | null;
  ring: LngLat[];
  areaM2: number;
  perimeterM: number;
  axisDeg: number;
  entrances: OsmEntrance[];
};

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

export function overpassQuery(latitude: number, longitude: number, radiusM = 50) {
  const radius = Math.max(15, Math.min(120, Math.round(radiusM)));
  return `[out:json][timeout:20];
(
  way["building"](around:${radius},${latitude},${longitude});
  node["entrance"](around:${radius},${latitude},${longitude});
);
out geom;`;
}

function centroid(ring: LngLat[]): LngLat {
  const sum = ring.reduce(
    (acc, point) => ({ longitude: acc.longitude + point.longitude, latitude: acc.latitude + point.latitude }),
    { longitude: 0, latitude: 0 },
  );
  return { longitude: sum.longitude / ring.length, latitude: sum.latitude / ring.length };
}

export function parseOverpass(payload: unknown, near: LngLat): OsmBuilding[] {
  const elements = (payload as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const ways = elements.filter((element) => element.type === 'way' && Array.isArray(element.geometry) && element.geometry.length >= 4);
  const entrances: OsmEntrance[] = elements
    .filter((element) => element.type === 'node' && element.tags && 'entrance' in element.tags && Number.isFinite(element.lat) && Number.isFinite(element.lon))
    .map((element) => ({
      latitude: Number(element.lat),
      longitude: Number(element.lon),
      name: element.tags?.name || element.tags?.ref || 'Entrance',
    }));

  const buildings: OsmBuilding[] = ways.map((way) => {
    const ring = (way.geometry ?? []).map((point) => ({ latitude: point.lat, longitude: point.lon }));
    const measured = measureFootprint(ring);
    const local = measured.local;
    const matched = entrances.filter((entrance) => {
      const point = toLocal(ring[0], entrance);
      return containsPoint(point, local, 12) || nearestOnOutline(point, local).distance <= 12;
    });
    return {
      id: Number(way.id) || 0,
      name: way.tags?.name || way.tags?.['addr:housename'] || null,
      ring,
      areaM2: measured.areaM2,
      perimeterM: measured.perimeterM,
      axisDeg: measured.axisDeg,
      entrances: matched,
    };
  });

  return buildings.sort((a, b) => rank(a, near) - rank(b, near));
}

function rank(building: OsmBuilding, origin: LngLat) {
  const local = measureFootprint(building.ring).local;
  const inside = containsPoint(toLocal(building.ring[0], origin), local, 1) ? 0 : 1;
  const centre = centroid(building.ring);
  const dist = Math.hypot(centre.longitude - origin.longitude, centre.latitude - origin.latitude);
  return inside * 10 + dist;
}

export async function fetchBuildingFootprints(latitude: number, longitude: number, radiusM = 50) {
  const body = new URLSearchParams({ data: overpassQuery(latitude, longitude, radiusM) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal: controller.signal,
    });
  } catch {
    throw new Error('OpenStreetMap took too long. Trace the corners on the map instead.');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const busy = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
    throw new Error(busy ? 'OpenStreetMap is busy right now. Trace the corners on the map.' : `OpenStreetMap returned ${response.status}. Trace the corners on the map instead.`);
  }
  const json: unknown = await response.json();
  return parseOverpass(json, { latitude, longitude });
}
