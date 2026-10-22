/** OpenStreetMap building outlines. The campus catalog is checked before any network call. */

import { footprintsNear } from '@/lib/campusFootprints';
import { containsPoint, measureFootprint, nearestOnOutline, ringFromGeoJson, toLocal, type LngLat } from '@/lib/footprint';

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

export const OUTLINE_UNAVAILABLE = "We couldn't fetch a fresh outline. Tap the corners on the map.";

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const MIRROR_TIMEOUT_MS = 10_000;

export async function fetchBuildingFootprints(latitude: number, longitude: number, radiusM = 70) {
  const saved = footprintsNear(latitude, longitude, radiusM);
  if (saved.length) return saved;
  const hosted = await hostedFootprints(latitude, longitude, radiusM);
  if (hosted.length) return hosted;
  return fetchFromMirrors(latitude, longitude, radiusM);
}

async function fetchFromMirrors(latitude: number, longitude: number, radiusM: number) {
  const controllers = MIRRORS.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((controller) => controller.abort()), MIRROR_TIMEOUT_MS);
  try {
    const json = await Promise.any(MIRRORS.map((url, index) => postOverpass(url, latitude, longitude, radiusM, controllers[index].signal)));
    return parseOverpass(json, { latitude, longitude });
  } catch {
    throw new Error(OUTLINE_UNAVAILABLE);
  } finally {
    clearTimeout(timer);
    controllers.forEach((controller) => controller.abort());
  }
}

async function postOverpass(url: string, latitude: number, longitude: number, radiusM: number, signal: AbortSignal) {
  const body = new URLSearchParams({ data: overpassQuery(latitude, longitude, radiusM) });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'user-agent': 'TekPath/1.0 (campus accessibility map)',
    },
    body,
    signal,
  });
  if (!response.ok) throw new Error('outline unavailable');
  return response.json() as Promise<unknown>;
}

async function hostedFootprints(latitude: number, longitude: number, radiusM: number): Promise<OsmBuilding[]> {
  const deltaLat = radiusM / 111320 + 0.0008;
  const deltaLng = radiusM / (111320 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180))) + 0.0008;
  try {
    const { supabase } = await import('@/lib/supabase');
    const pending = supabase
      .from('campus_footprints')
      .select('osm_id,name,footprint_geojson,area_m2,perimeter_m,entrances')
      .gte('latitude', latitude - deltaLat)
      .lte('latitude', latitude + deltaLat)
      .gte('longitude', longitude - deltaLng)
      .lte('longitude', longitude + deltaLng)
      .limit(20);
    const { data, error } = await withTimeout(pending, 4000);
    if (error || !data) return [];
    const buildings: OsmBuilding[] = [];
    for (const row of data) {
      const ring = ringFromGeoJson(row.footprint_geojson);
      if (!ring) continue;
      const measured = measureFootprint(ring);
      const here = toLocal(ring[0], { latitude, longitude });
      if (!containsPoint(here, measured.local, radiusM) && nearestOnOutline(here, measured.local).distance > radiusM) continue;
      buildings.push({
        id: Number(row.osm_id) || 0,
        name: row.name ?? null,
        ring,
        areaM2: Number(row.area_m2) || measured.areaM2,
        perimeterM: Number(row.perimeter_m) || measured.perimeterM,
        axisDeg: measured.axisDeg,
        entrances: readEntrances(row.entrances),
      });
    }
    return buildings;
  } catch {
    return [];
  }
}

function readEntrances(value: unknown): OsmEntrance[] {
  if (!Array.isArray(value)) return [];
  const entrances: OsmEntrance[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const record = row as { name?: unknown; latitude?: unknown; longitude?: unknown };
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    entrances.push({ name: typeof record.name === 'string' && record.name ? record.name : 'Entrance', latitude, longitude });
  }
  return entrances;
}

function withTimeout<T>(pending: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(pending).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
