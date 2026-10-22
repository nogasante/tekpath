import { uploadReportPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { buildPublishPlan, type WalkDraft, type WalkNode } from '@/lib/walkGraph';

export const WALK_MIGRATION = '20261022110508_walk_footprint.sql';
export const ROOM_MIGRATION = '20261022100253_indoor_room_numbers.sql';

function qrFor(node: WalkNode) {
  const salt = globalThis.crypto.randomUUID().slice(0, 8).toUpperCase();
  return `TP-${node.kind.slice(0, 3).toUpperCase()}-${salt}`;
}

function missingColumn(message: string, column: string) {
  return message.includes(column);
}

export async function publishWalk(draft: WalkDraft, userId: string) {
  const plan = buildPublishPlan(draft, qrFor);
  let warning: string | null = null;
  let buildingId = plan.buildingId;
  let created: string | null = null;
  const insertedNodes: string[] = [];

  try {
    if (!buildingId) {
      if (!plan.building) throw new Error('Name the building before publishing.');
      let inserted = await supabase.from('buildings').insert(plan.building).select('id').single();
      if (inserted.error && (missingColumn(inserted.error.message, 'footprint_geojson') || missingColumn(inserted.error.message, 'area_m2'))) {
        const { footprint_geojson, area_m2, perimeter_m, ...rest } = plan.building;
        void footprint_geojson;
        void area_m2;
        void perimeter_m;
        inserted = await supabase.from('buildings').insert(rest).select('id').single();
        warning = `Saved. Area and perimeter show up after ${WALK_MIGRATION} is applied.`;
      }
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || 'Could not save the building.');
      buildingId = inserted.data.id as string;
      created = buildingId;
    } else {
      const updated = await supabase.from('buildings').update(plan.footprintUpdate).eq('id', buildingId).select('id');
      if (updated.error && (missingColumn(updated.error.message, 'footprint_geojson') || missingColumn(updated.error.message, 'area_m2'))) {
        warning = `Saved. The outline is kept on this phone until ${WALK_MIGRATION} is applied.`;
      }
    }

    const floorId = new Map<number, string>();
    const existingFloors = await supabase.from('floors').select('id,level').eq('building_id', buildingId);
    if (existingFloors.error) throw new Error(existingFloors.error.message);
    for (const floor of existingFloors.data ?? []) floorId.set(floor.level as number, floor.id as string);

    for (const floor of plan.floors) {
      if (floorId.has(floor.level)) {
        await supabase
          .from('floors')
          .update({
            name: floor.name,
            floor_height_m: floor.floor_height_m,
            pressure_hpa_per_m: floor.pressure_hpa_per_m,
            layout: floor.layout,
          })
          .eq('id', floorId.get(floor.level) as string);
        continue;
      }
      const inserted = await supabase
        .from('floors')
        .insert({
          building_id: buildingId,
          level: floor.level,
          name: floor.name,
          floor_height_m: floor.floor_height_m,
          pressure_hpa_per_m: floor.pressure_hpa_per_m,
          layout: floor.layout,
        })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || 'Could not save a floor.');
      floorId.set(floor.level, inserted.data.id as string);
    }

    const nodeId = new Map<string, string>();
    for (const node of plan.nodes) {
      let photoUrl: string | null = null;
      if (node.photoUri?.startsWith('http')) photoUrl = node.photoUri;
      else if (node.photoUri) {
        try {
          photoUrl = await uploadReportPhoto(userId, node.photoUri, 'image/jpeg');
        } catch {
          warning = warning ?? 'One photo could not be uploaded. The point was saved without it.';
        }
      }
      const row = {
        building_id: buildingId,
        floor_id: floorId.get(node.floorLevel) ?? null,
        type: node.type,
        name: node.name,
        landmark_description: node.landmark_description,
        latitude: node.latitude,
        longitude: node.longitude,
        step_free: node.step_free,
        plan_x: node.plan_x,
        plan_y: node.plan_y,
        qr_code: node.qr_code,
        room_number: node.room_number,
        photo_url: photoUrl,
      };
      let inserted = await supabase.from('nodes').insert(row).select('id').single();
      if (inserted.error && (missingColumn(inserted.error.message, 'room_number') || missingColumn(inserted.error.message, 'photo_url'))) {
        const { room_number, photo_url, ...rest } = row;
        void room_number;
        void photo_url;
        inserted = await supabase.from('nodes').insert(rest).select('id').single();
        warning = `Saved. Room numbers and photos show up after ${ROOM_MIGRATION} is applied.`;
      }
      if (inserted.error && /nodes_type_chk|check constraint/i.test(inserted.error.message)) {
        throw new Error(`Stairs, landmarks, and steps need ${WALK_MIGRATION} before they can be published.`);
      }
      if (inserted.error && /qr_code/i.test(inserted.error.message)) {
        const { qr_code, ...rest } = row;
        void qr_code;
        inserted = await supabase.from('nodes').insert(rest).select('id').single();
      }
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || `Could not save ${node.name}.`);
      const id = inserted.data.id as string;
      nodeId.set(node.localId, id);
      insertedNodes.push(id);

      if (node.featureKind) {
        const feature = await supabase
          .from('features')
          .insert({
            node_id: id,
            building_id: buildingId,
            kind: node.featureKind,
            name: node.name,
            status: 'working',
            latitude: node.latitude,
            longitude: node.longitude,
          })
          .select('id')
          .single();
        if (feature.data?.id) {
          await supabase.from('nodes').update({ feature_id: feature.data.id }).eq('id', id);
        }
      }
    }

    for (const edge of plan.edges) {
      const from = nodeId.get(edge.fromLocalId);
      const to = nodeId.get(edge.toLocalId);
      if (!from || !to || from === to) continue;
      const inserted = await supabase.from('edges').insert({
        from_node: from,
        to_node: to,
        type: edge.type,
        step_free: edge.step_free,
        length_m: edge.length_m,
        instruction_text: edge.instruction_text,
        reverse_instruction_text: edge.reverse_instruction_text,
        bidirectional: edge.bidirectional,
      });
      if (inserted.error) throw new Error(inserted.error.message);
    }

    return { buildingId, warning };
  } catch (error) {
    if (created) await supabase.from('buildings').delete().eq('id', created);
    else if (insertedNodes.length) await supabase.from('nodes').delete().in('id', insertedNodes);
    throw error;
  }
}
