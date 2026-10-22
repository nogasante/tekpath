/**
 * Walk-mode graph: captures, edges, floor changes, loop closure, and publish rows.
 * Local positions are metres, x east and y north, with the snapped entrance at the origin.
 */

import {
  clampTrace,
  closeLngLatRing,
  measureFootprint,
  nearestOnOutline,
  ringToGeoJson,
  toLngLat,
  toLocal,
  type LngLat,
  type XY,
} from '@/lib/footprint';
import { appendStep, closeLoop, DEFAULT_STEP_LENGTH_M, straighten } from '@/lib/pdr';

export type CaptureKind =
  | 'entrance'
  | 'room'
  | 'junction'
  | 'lift'
  | 'stairs'
  | 'ramp'
  | 'toilet'
  | 'obstacle'
  | 'landmark';

export type EdgeType = 'corridor' | 'ramp' | 'lift' | 'stairs' | 'path';

export type TracePoint = XY & { floorLevel: number };

export type WalkNode = {
  id: string;
  kind: CaptureKind;
  name: string;
  roomNumber: string | null;
  landmark: string | null;
  floorLevel: number;
  floorName: string;
  x: number;
  y: number;
  traceIndex: number;
  photoUri: string | null;
};

export type WalkEdge = {
  id: string;
  fromId: string;
  toId: string;
  type: EdgeType;
  stepFree: boolean;
  lengthM: number;
  instruction: string;
  reverseInstruction: string;
};

export type WalkFloor = {
  level: number;
  name: string;
  floorHeightM: number;
  hpaPerM: number;
};

export type WalkDraft = {
  seq: number;
  buildingId: string | null;
  buildingName: string;
  buildingCode: string;
  description: string;
  entrance: LngLat;
  axisDeg: number;
  ring: LngLat[];
  localRing: XY[];
  areaM2: number;
  perimeterM: number;
  floors: WalkFloor[];
  nodes: WalkNode[];
  edges: WalkEdge[];
  trace: TracePoint[];
  stepLengthM: number;
  activeLevel: number;
  lastHeadingDeg: number;
  rescaled: boolean;
  stage: 'ready' | 'walking' | 'review';
};

const NODE_TYPE: Record<CaptureKind, string> = {
  entrance: 'entrance',
  room: 'room',
  junction: 'junction',
  lift: 'lift',
  stairs: 'stairs',
  ramp: 'ramp',
  toilet: 'toilet',
  obstacle: 'obstacle',
  landmark: 'landmark',
};

export function suggestCode(name: string) {
  const words = name
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const initials = words.map((word) => word[0]).join('');
  const compact = words.join('');
  const raw = (words.length > 1 ? initials : compact).toUpperCase();
  const code = raw.replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return code || 'BLD';
}

export function saneFloorMetrics(heightM: number, hpaDelta: number | null) {
  let height = Math.abs(heightM);
  if (!(height > 0.4 && height < 30)) height = 3.6;
  let hpa = 0.12;
  if (hpaDelta != null && Number.isFinite(hpaDelta) && height > 0) {
    const rate = Math.abs(hpaDelta) / height;
    if (rate > 0 && rate < 2) hpa = rate;
  }
  return {
    floorHeightM: Math.round(height * 100) / 100,
    hpaPerM: Math.round(hpa * 1000) / 1000,
  };
}

function takeId(draft: WalkDraft) {
  const seq = draft.seq + 1;
  return { draft: { ...draft, seq }, id: `w${seq}` };
}

export function createDraft(input: {
  buildingName: string;
  buildingCode?: string;
  buildingId?: string | null;
  description?: string;
  ring: LngLat[];
  entrance: LngLat;
  headingDeg?: number;
  floorName?: string;
  stepLengthM?: number;
}): WalkDraft {
  const measured = measureFootprint(input.ring);
  const entranceLocal = toLocal(input.ring[0], input.entrance);
  const snapped = nearestOnOutline(entranceLocal, measured.local).point;
  const entrance = toLngLat(input.ring[0], snapped);
  const localRing = input.ring.map((point) => toLocal(entrance, point));
  const floorName = input.floorName?.trim() || 'Ground';
  let draft: WalkDraft = {
    seq: 0,
    buildingId: input.buildingId ?? null,
    buildingName: input.buildingName.trim() || 'Untitled building',
    buildingCode: (input.buildingCode?.trim() || suggestCode(input.buildingName)).toUpperCase().slice(0, 16),
    description: input.description?.trim() || 'Mapped by walking the outline.',
    entrance,
    axisDeg: measured.axisDeg,
    ring: closeLngLatRing(input.ring),
    localRing,
    areaM2: measured.areaM2,
    perimeterM: measured.perimeterM,
    floors: [{ level: 0, name: floorName, floorHeightM: 3.6, hpaPerM: 0.12 }],
    nodes: [],
    edges: [],
    trace: [{ x: 0, y: 0, floorLevel: 0 }],
    stepLengthM: input.stepLengthM && input.stepLengthM > 0 ? input.stepLengthM : DEFAULT_STEP_LENGTH_M,
    activeLevel: 0,
    lastHeadingDeg: input.headingDeg ?? measured.axisDeg,
    rescaled: false,
    stage: 'ready',
  };
  draft = addCapture(draft, {
    kind: 'entrance',
    name: 'Entrance',
    floorName,
  });
  return { ...draft, stage: 'ready' };
}

function floorByLevel(draft: WalkDraft, level: number) {
  return draft.floors.find((floor) => floor.level === level) ?? null;
}

function defaultName(kind: CaptureKind, roomNumber: string | null) {
  if (kind === 'room' && roomNumber) return `Room ${roomNumber}`;
  switch (kind) {
    case 'entrance':
      return 'Entrance';
    case 'room':
      return 'Door';
    case 'junction':
      return 'Junction';
    case 'lift':
      return 'Lift';
    case 'stairs':
      return 'Stairs';
    case 'ramp':
      return 'Ramp';
    case 'toilet':
      return 'Toilet';
    case 'obstacle':
      return 'Step';
    case 'landmark':
      return 'Landmark';
    default:
      return 'Point';
  }
}

export function traceDistance(trace: XY[], fromIndex: number, toIndex: number) {
  const start = Math.max(0, Math.min(fromIndex, toIndex));
  const end = Math.min(trace.length - 1, Math.max(fromIndex, toIndex));
  let sum = 0;
  for (let i = start + 1; i <= end; i += 1) {
    sum += Math.hypot(trace[i].x - trace[i - 1].x, trace[i].y - trace[i - 1].y);
  }
  return sum;
}

export function appendWalkStep(draft: WalkDraft, headingDeg: number): WalkDraft {
  const next = appendStep({
    trace: draft.trace,
    headingDeg,
    stepLengthM: draft.stepLengthM,
    ring: draft.localRing,
    axisDeg: draft.axisDeg,
  });
  const trace: TracePoint[] = next.trace.map((point, index) => ({
    x: point.x,
    y: point.y,
    floorLevel: draft.trace[index]?.floorLevel ?? draft.activeLevel,
  }));
  return {
    ...draft,
    trace,
    stepLengthM: next.stepLengthM,
    lastHeadingDeg: next.headingDeg,
    rescaled: draft.rescaled || next.rescaled,
    stage: 'walking',
  };
}

export function addCapture(
  draft: WalkDraft,
  input: {
    kind: CaptureKind;
    name?: string;
    roomNumber?: string | null;
    landmark?: string | null;
    photoUri?: string | null;
    floorName?: string;
  },
): WalkDraft {
  const roomNumber = input.roomNumber?.trim() || null;
  const name = input.name?.trim() || defaultName(input.kind, roomNumber);
  const floor = floorByLevel(draft, draft.activeLevel);
  const floorName = input.floorName?.trim() || floor?.name || (draft.activeLevel === 0 ? 'Ground' : `Level ${draft.activeLevel}`);
  const here = draft.trace[draft.trace.length - 1] ?? { x: 0, y: 0, floorLevel: draft.activeLevel };
  const ided = takeId(draft);
  const node: WalkNode = {
    id: ided.id,
    kind: input.kind,
    name,
    roomNumber,
    landmark: input.landmark?.trim() || null,
    floorLevel: draft.activeLevel,
    floorName,
    x: here.x,
    y: here.y,
    traceIndex: Math.max(0, draft.trace.length - 1),
    photoUri: input.photoUri ?? null,
  };
  let next: WalkDraft = {
    ...ided.draft,
    floors: floor ? draft.floors.map((item) => (item.level === draft.activeLevel ? { ...item, name: floorName } : item)) : [...draft.floors, { level: draft.activeLevel, name: floorName, floorHeightM: 3.6, hpaPerM: 0.12 }],
    nodes: [...draft.nodes, node],
    stage: draft.stage === 'ready' ? 'ready' : 'walking',
  };
  const previous = [...draft.nodes].reverse().find((item) => item.floorLevel === draft.activeLevel);
  if (!previous || previous.id === node.id) return next;
  const edgeId = takeId(next);
  const length = Math.max(0.5, traceDistance(draft.trace, previous.traceIndex, node.traceIndex) || Math.hypot(node.x - previous.x, node.y - previous.y));
  const stepFree = input.kind !== 'obstacle';
  const type: EdgeType = input.kind === 'ramp' ? 'ramp' : 'corridor';
  const edge: WalkEdge = {
    id: edgeId.id,
    fromId: previous.id,
    toId: node.id,
    type,
    stepFree,
    lengthM: Math.round(length * 100) / 100,
    instruction: stepFree ? `Continue to ${name}.` : `There is a step on the way to ${name}.`,
    reverseInstruction: stepFree ? `Continue to ${previous.name}.` : `There is a step on the way to ${previous.name}.`,
  };
  next = { ...edgeId.draft, nodes: next.nodes, floors: next.floors, edges: [...draft.edges, edge] };
  return next;
}

export function connectFloors(
  draft: WalkDraft,
  input: { toLevel: number; toName: string; via: 'lift' | 'stairs'; heightM: number; hpaDelta: number | null },
): WalkDraft {
  if (input.toLevel === draft.activeLevel) return draft;
  const metrics = saneFloorMetrics(input.heightM, input.hpaDelta);
  const toName = input.toName.trim() || (input.toLevel === 0 ? 'Ground' : `Level ${input.toLevel}`);
  let next = draft;
  let shaft = [...draft.nodes].reverse().find((node) => node.floorLevel === draft.activeLevel && node.kind === input.via);
  if (!shaft) {
    next = addCapture(next, { kind: input.via, name: input.via === 'lift' ? 'Lift' : 'Stairs' });
    shaft = next.nodes[next.nodes.length - 1];
  }
  const floors = next.floors.some((floor) => floor.level === input.toLevel)
    ? next.floors.map((floor) => (floor.level === input.toLevel ? { ...floor, name: toName, floorHeightM: metrics.floorHeightM, hpaPerM: metrics.hpaPerM } : floor))
    : [...next.floors, { level: input.toLevel, name: toName, floorHeightM: metrics.floorHeightM, hpaPerM: metrics.hpaPerM }];
  const here = next.trace[next.trace.length - 1] ?? { x: shaft.x, y: shaft.y, floorLevel: input.toLevel };
  const trace = [...next.trace, { x: here.x, y: here.y, floorLevel: input.toLevel }];
  const upperId = takeId({ ...next, floors, trace, activeLevel: input.toLevel });
  const upper: WalkNode = {
    id: upperId.id,
    kind: input.via,
    name: shaft.name,
    roomNumber: null,
    landmark: shaft.landmark,
    floorLevel: input.toLevel,
    floorName: toName,
    x: shaft.x,
    y: shaft.y,
    traceIndex: trace.length - 1,
    photoUri: null,
  };
  const edgeId = takeId(upperId.draft);
  const edge: WalkEdge = {
    id: edgeId.id,
    fromId: shaft.id,
    toId: upper.id,
    type: input.via,
    stepFree: input.via === 'lift',
    lengthM: metrics.floorHeightM,
    instruction: input.via === 'lift' ? `Take ${shaft.name} to ${toName}.` : `Take the stairs to ${toName}.`,
    reverseInstruction: input.via === 'lift' ? `Take ${shaft.name} to ${shaft.floorName}.` : `Take the stairs to ${shaft.floorName}.`,
  };
  return {
    ...edgeId.draft,
    floors,
    trace,
    nodes: [...next.nodes, upper],
    edges: [...next.edges, edge],
    activeLevel: input.toLevel,
    stage: 'walking',
  };
}

export function updateNode(
  draft: WalkDraft,
  id: string,
  patch: Partial<Pick<WalkNode, 'name' | 'roomNumber' | 'landmark' | 'photoUri'>>,
): WalkDraft {
  return {
    ...draft,
    nodes: draft.nodes.map((node) => (node.id === id ? { ...node, ...patch, name: patch.name?.trim() || node.name } : node)),
  };
}

export function deleteNode(draft: WalkDraft, id: string): WalkDraft {
  const node = draft.nodes.find((item) => item.id === id);
  if (!node || node.kind === 'entrance') return draft;
  return {
    ...draft,
    nodes: draft.nodes.filter((item) => item.id !== id),
    edges: draft.edges.filter((edge) => edge.fromId !== id && edge.toId !== id),
  };
}

export function closeWalk(draft: WalkDraft): WalkDraft {
  if (draft.trace.length < 2) return { ...draft, stage: 'review' };
  let xy: TracePoint[] = closeLoop(draft.trace);
  xy = straighten(xy, draft.axisDeg, 18);
  xy = closeLoop(xy);
  xy = clampTrace(xy, draft.localRing).map((point, index) => ({
    ...xy[index],
    x: point.x,
    y: point.y,
  }));
  if (xy.length) xy[xy.length - 1] = { ...xy[xy.length - 1], x: xy[0].x, y: xy[0].y };
  const trace = xy.map((point, index) => ({
    x: point.x,
    y: point.y,
    floorLevel: draft.trace[index]?.floorLevel ?? draft.activeLevel,
  }));
  let nodes = draft.nodes.map((node) => {
    const point = trace[Math.min(node.traceIndex, trace.length - 1)];
    return point ? { ...node, x: point.x, y: point.y } : node;
  });
  for (const edge of draft.edges) {
    if (edge.type !== 'lift' && edge.type !== 'stairs') continue;
    const lower = nodes.find((node) => node.id === edge.fromId);
    const upperIndex = nodes.findIndex((node) => node.id === edge.toId);
    if (lower && upperIndex >= 0) nodes[upperIndex] = { ...nodes[upperIndex], x: lower.x, y: lower.y };
  }
  const edges = draft.edges.map((edge) => {
    if (edge.type === 'lift' || edge.type === 'stairs') return edge;
    const from = nodes.find((node) => node.id === edge.fromId);
    const to = nodes.find((node) => node.id === edge.toId);
    if (!from || !to) return edge;
    const length = Math.max(0.5, traceDistance(trace, from.traceIndex, to.traceIndex) || Math.hypot(to.x - from.x, to.y - from.y));
    return { ...edge, lengthM: Math.round(length * 100) / 100 };
  });
  return { ...draft, trace, nodes, edges, stage: 'review' };
}

export type PublishNode = {
  localId: string;
  floorLevel: number;
  type: string;
  name: string;
  landmark_description: string | null;
  room_number: string | null;
  latitude: number;
  longitude: number;
  step_free: boolean;
  plan_x: number;
  plan_y: number;
  qr_code: string | null;
  photoUri: string | null;
  featureKind: 'entrance' | 'lift' | 'ramp' | 'toilet' | null;
};

export type PublishPlan = {
  building: {
    name: string;
    code: string;
    description: string;
    latitude: number;
    longitude: number;
    footprint_geojson: ReturnType<typeof ringToGeoJson>;
    area_m2: number;
    perimeter_m: number;
  } | null;
  buildingId: string | null;
  footprintUpdate: {
    footprint_geojson: ReturnType<typeof ringToGeoJson>;
    area_m2: number;
    perimeter_m: number;
  };
  floors: {
    level: number;
    name: string;
    floor_height_m: number;
    pressure_hpa_per_m: number;
    layout: { frame: 'metres'; outline: XY[] };
  }[];
  nodes: PublishNode[];
  edges: {
    fromLocalId: string;
    toLocalId: string;
    type: EdgeType;
    step_free: boolean;
    length_m: number;
    instruction_text: string;
    reverse_instruction_text: string;
    bidirectional: boolean;
  }[];
};

function featureKind(kind: CaptureKind): PublishNode['featureKind'] {
  if (kind === 'entrance' || kind === 'lift' || kind === 'ramp' || kind === 'toilet') return kind;
  return null;
}

export function buildPublishPlan(draft: WalkDraft, qr?: (node: WalkNode) => string | null): PublishPlan {
  const footprint_geojson = ringToGeoJson(draft.ring);
  const building = draft.buildingId
    ? null
    : {
        name: draft.buildingName,
        code: draft.buildingCode,
        description: draft.description,
        latitude: draft.entrance.latitude,
        longitude: draft.entrance.longitude,
        footprint_geojson,
        area_m2: Math.round(draft.areaM2 * 10) / 10,
        perimeter_m: Math.round(draft.perimeterM * 10) / 10,
      };
  return {
    building,
    buildingId: draft.buildingId,
    footprintUpdate: {
      footprint_geojson,
      area_m2: Math.round(draft.areaM2 * 10) / 10,
      perimeter_m: Math.round(draft.perimeterM * 10) / 10,
    },
    floors: [...draft.floors]
      .sort((a, b) => a.level - b.level)
      .map((floor) => ({
        level: floor.level,
        name: floor.name,
        floor_height_m: floor.floorHeightM,
        pressure_hpa_per_m: floor.hpaPerM,
        layout: { frame: 'metres' as const, outline: draft.localRing },
      })),
    nodes: draft.nodes.map((node) => {
      const geo = toLngLat(draft.entrance, node);
      const makeQr = node.kind === 'entrance' || node.kind === 'room';
      return {
        localId: node.id,
        floorLevel: node.floorLevel,
        type: NODE_TYPE[node.kind],
        name: node.name,
        landmark_description: node.landmark,
        room_number: node.roomNumber,
        latitude: geo.latitude,
        longitude: geo.longitude,
        step_free: node.kind !== 'obstacle' && node.kind !== 'stairs',
        plan_x: Math.round(node.x * 100) / 100,
        plan_y: Math.round(node.y * 100) / 100,
        qr_code: makeQr ? (qr ? qr(node) : null) : null,
        photoUri: node.photoUri,
        featureKind: featureKind(node.kind),
      };
    }),
    edges: draft.edges.map((edge) => ({
      fromLocalId: edge.fromId,
      toLocalId: edge.toId,
      type: edge.type,
      step_free: edge.stepFree,
      length_m: edge.lengthM,
      instruction_text: edge.instruction,
      reverse_instruction_text: edge.reverseInstruction,
      bidirectional: true,
    })),
  };
}
