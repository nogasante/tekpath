import { nodeSelect, toStartNode } from '@/lib/nodes';
import { supabase } from '@/lib/supabase';
import { asRoute, floorLabel, type RouteResult, type RouteStep, type StartNode } from '@/lib/types';

/** Arrival at a building entrance, in metres. Inside this, indoor guidance starts. */
export const ARRIVAL_METRES = 25;

export function searchNeedle(value: string) {
  return value.replace(/[%_,]/g, ' ').replace(/\brooms?\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function roomNumber(name: string) {
  const match = name.match(/\b(\d{2,4})\b/);
  return match?.[1] ?? null;
}

export function floorSpoken(level: number | null, name?: string | null) {
  if (level == null) return 'Outdoors';
  if (level === 0) return 'Ground';
  if (name && /floor|level|ground/i.test(name)) {
    return level === 0 ? 'Ground' : `Floor ${level}`;
  }
  return floorLabel(level, name);
}

export function liftName(nodeName: string) {
  const match = nodeName.match(/lift\s+[a-z0-9]+/i);
  if (match) return match[0].replace(/^lift/i, 'Lift');
  return nodeName.split(',')[0]?.trim() || 'the lift';
}

/** Lift steps read as a floor change. Other steps keep the router's instruction. */
export function spokenStep(step: RouteStep) {
  if (step.edge_type !== 'lift') return step.instruction;
  const floor = step.floor_level === 0 ? 'Ground' : `Floor ${step.floor_level ?? ''}`.trim();
  const extra = /step out/i.test(step.instruction) ? ' Step out when the doors open.' : '';
  return `Take ${liftName(step.node_name)} to ${floor}.${extra}`;
}

export function placeLine(node: { name: string; buildingName?: string | null; floorLevel: number | null; floorName?: string | null }) {
  const room = roomNumber(node.name);
  return [node.buildingName, floorSpoken(node.floorLevel, node.floorName), room ? `Room ${room}` : null].filter(Boolean).join(' · ');
}

export function startBucket(node: StartNode): 'entrance' | 'lift' | 'room' | 'landmark' {
  if (node.type === 'room') return 'room';
  if (node.type === 'lift') return 'lift';
  if (node.type === 'entrance' || node.type === 'ramp' || node.type === 'outdoor') return 'entrance';
  return 'landmark';
}

export function pickEntrance(nodes: StartNode[]) {
  const doors = nodes.filter((node) => node.type === 'ramp' || node.type === 'entrance');
  return (
    doors.find((node) => node.floorLevel === 0) ??
    doors.find((node) => node.floorLevel == null) ??
    doors[0] ??
    nodes.find((node) => node.type === 'outdoor') ??
    null
  );
}

export async function loadNode(id: string) {
  const { data, error } = await supabase.from('nodes').select(nodeSelect).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toStartNode(data) : null;
}

export async function loadEntrance(buildingId: string | null) {
  if (!buildingId) return null;
  const { data, error } = await supabase.from('nodes').select(nodeSelect).eq('building_id', buildingId).in('type', ['ramp', 'entrance', 'outdoor']);
  if (error) throw new Error(error.message);
  return pickEntrance((data ?? []).map((row) => toStartNode(row)));
}

export async function fetchRoute(fromId: string, toId: string): Promise<RouteResult> {
  const { data, error } = await supabase.rpc('find_step_free_route', { p_from: fromId, p_to: toId });
  if (error) throw new Error(error.message);
  return asRoute(data);
}
