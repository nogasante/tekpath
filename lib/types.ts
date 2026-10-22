export type FeatureStatus = 'working' | 'broken' | 'unknown';

export type AccessFeature = {
  id: string;
  node_id: string | null;
  building_id: string | null;
  kind: string;
  name: string;
  status: FeatureStatus;
  last_reported_at: string | null;
  latitude: number;
  longitude: number;
};

export type RouteStep = {
  order: number;
  node_id: string;
  node_name: string;
  node_type: string;
  landmark_description: string | null;
  instruction: string;
  floor_level: number | null;
  floor_name: string | null;
  floor_id: string | null;
  building_name: string | null;
  edge_type: string | null;
  edge_id: string | null;
  qr_code: string | null;
  plan_x: number | null;
  plan_y: number | null;
};

export type RouteBlocker = {
  id: string;
  name: string;
  kind: string;
  status: string;
};

export type RouteResult = {
  ok: boolean;
  message: string | null;
  distance_m: number | null;
  steps: RouteStep[];
  blockers: RouteBlocker[];
};

export type StartNode = {
  id: string;
  name: string;
  qrCode: string | null;
  type: string;
  latitude: number;
  longitude: number;
  floorLevel: number | null;
  floorName: string | null;
  floorId: string | null;
  buildingId: string | null;
  buildingName: string | null;
  floorHeightM: number;
  hpaPerM: number;
};

export type FloorMotion = 'unknown' | 'still' | 'moving' | 'lift' | 'stairs';

export type FloorReading = {
  level: number | null;
  label: string;
  source: 'barometer' | 'manual' | 'none' | 'outdoor';
  pressure: number | null;
  available: boolean;
  /** Smoothed height relative to the last anchor. Positive is up. */
  heightM: number | null;
  confidence: number | null;
  needsRecalibration: boolean;
  motion: FloorMotion | null;
};

export function asRoute(data: unknown): RouteResult {
  const row = (data ?? {}) as Partial<RouteResult>;
  return {
    ok: row.ok === true,
    message: row.message ?? null,
    distance_m: typeof row.distance_m === 'number' ? row.distance_m : null,
    steps: Array.isArray(row.steps) ? row.steps : [],
    blockers: Array.isArray(row.blockers) ? row.blockers : [],
  };
}

export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function kindLabel(kind: string) {
  switch (kind) {
    case 'ramp':
      return 'Ramp';
    case 'lift':
      return 'Lift';
    case 'toilet':
      return 'Accessible toilet';
    case 'parking':
      return 'Accessible parking';
    case 'entrance':
      return 'Step-free entrance';
    default:
      return kind;
  }
}

export function statusLabel(status: string) {
  switch (status) {
    case 'working':
      return 'Working';
    case 'broken':
      return 'Broken';
    default:
      return 'Unknown';
  }
}

export function floorLabel(level: number | null, name?: string | null) {
  if (level == null) return 'Outdoors';
  if (name) return name;
  return level === 0 ? 'Ground' : `Level ${level}`;
}
