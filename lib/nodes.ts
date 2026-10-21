import { one, type StartNode } from '@/lib/types';

export const nodeSelect =
  'id,name,qr_code,type,latitude,longitude,landmark_description,building_id,floor_id,buildings(name),floors(level,name,floor_height_m,pressure_hpa_per_m)';

type FloorRow = {
  level: number;
  name: string;
  floor_height_m: number | string;
  pressure_hpa_per_m: number | string;
};

type BuildingRow = { name: string };

export function toStartNode(row: {
  id: string;
  name: string;
  qr_code: string | null;
  type: string;
  latitude: number;
  longitude: number;
  building_id: string | null;
  floor_id: string | null;
  buildings?: BuildingRow | BuildingRow[] | null;
  floors?: FloorRow | FloorRow[] | null;
}): StartNode {
  const floor = one(row.floors);
  const building = one(row.buildings);
  return {
    id: row.id,
    name: row.name,
    qrCode: row.qr_code,
    type: row.type,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    floorLevel: floor ? Number(floor.level) : null,
    floorName: floor?.name ?? null,
    floorId: row.floor_id,
    buildingId: row.building_id,
    buildingName: building?.name ?? null,
    floorHeightM: Number(floor?.floor_height_m ?? 3.5),
    hpaPerM: Number(floor?.pressure_hpa_per_m ?? 0.12),
  };
}

export function qrFromScan(raw: string) {
  const trimmed = raw.trim();
  const parts = trimmed.split(/[/:]/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || trimmed;
}
