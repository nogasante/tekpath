import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { WalkCanvas } from '@/components/WalkCanvas';
import { FloorPlan } from '@/components/FloorPlan';
import { AppText, Button, Card, EmptyState, Field, Notice, Screen, Skeleton } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { useToast } from '@/context/Toast';
import { floorOutline, floorRooms, placeCountLabel, submissionTitle } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { spacing, type as typeScale } from '@/lib/theme';

type QueueItem = {
  submission_id: string;
  title: string | null;
  display_name: string | null;
  created_at: string;
  place_count: number;
};

type FloorRow = { id: string; name: string; level: number; layout: unknown };
type NodeRow = { id: string; name: string; plan_x: number | null; plan_y: number | null; floor_id: string | null };

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function PlanPreview({ floors, nodes }: { floors: FloorRow[]; nodes: NodeRow[] }) {
  const { colors } = useTheme();
  const [floorId, setFloorId] = useState(floors[0]?.id ?? null);
  const floor = floors.find((item) => item.id === floorId) ?? floors[0];
  if (!floor && nodes.length === 0) {
    return <AppText color={colors.muted}>No floor plan with this one.</AppText>;
  }
  const outline = floor ? floorOutline(floor.layout) : [];
  const rooms = floor ? floorRooms(floor.layout) : [];
  const marks = nodes
    .filter((node) => (floor ? node.floor_id === floor.id : true) && node.plan_x != null && node.plan_y != null)
    .map((node, index) => ({ id: node.id, name: node.name, x: Number(node.plan_x), y: Number(node.plan_y), n: index + 1 }));

  return (
    <View style={{ gap: spacing.sm }}>
      {floors.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {floors.map((item) => (
            <Button
              key={item.id}
              label={item.name}
              variant={item.id === floor?.id ? 'primary' : 'secondary'}
              onPress={() => setFloorId(item.id)}
            />
          ))}
        </View>
      ) : null}
      {outline.length >= 3 ? (
        <View style={{ height: 200 }}>
          <WalkCanvas outline={outline} trace={[]} nodes={marks} heading={0} floorName={floor?.name} showYou={false} minHeight={200} />
        </View>
      ) : rooms.length > 0 ? (
        <FloorPlan rooms={rooms} />
      ) : (
        <AppText color={colors.muted}>{nodes.map((node) => node.name).filter(Boolean).join(' · ') || 'No floor plan with this one.'}</AppText>
      )}
    </View>
  );
}

export default function ReviewQueueScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await supabase.rpc('pending_submissions');
    if (result.error) {
      setError(result.error.message);
      setItems([]);
    } else {
      setError(null);
      setItems((result.data ?? []) as QueueItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    Promise.all([
      supabase.from('floors').select('id,name,level,layout').eq('submission_id', openId).order('level'),
      supabase.from('nodes').select('id,name,plan_x,plan_y,floor_id').eq('submission_id', openId),
    ]).then(([floorResult, nodeResult]) => {
      if (cancelled) return;
      setFloors((floorResult.data ?? []) as FloorRow[]);
      setNodes((nodeResult.data ?? []) as NodeRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  async function review(item: QueueItem, approve: boolean) {
    setBusy(true);
    setError(null);
    const result = await supabase.rpc('review_submission', {
      submission_id: item.submission_id,
      approve,
      note: notes[item.submission_id]?.trim() || null,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      toast.show(approve ? 'Could not approve this map.' : 'Could not reject this map.', 'bad');
      return;
    }
    toast.show(approve ? 'Approved. It is on the campus map.' : 'Rejected.');
    setOpenId(null);
    await load();
  }

  return (
    <Screen scroll>
      <AppText color={colors.muted}>New maps wait here until you accept them. The person who sent one sees your note.</AppText>
      {loading ? <Skeleton height={160} /> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!loading && items.length === 0 && !error ? (
        <EmptyState icon="map" title="Nothing is waiting" body="New maps show up here." />
      ) : null}
      {items.map((item) => {
        const open = openId === item.submission_id;
        return (
          <Card key={item.submission_id}>
            <AppText weight="700" size={typeScale.headline}>
              {submissionTitle(item.title)}
            </AppText>
            <AppText color={colors.muted}>
              {[item.display_name ? `From ${item.display_name}` : 'From a student', placeCountLabel(item.place_count), when(item.created_at)]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
            <Button label={open ? 'Hide the plan' : 'See the plan'} variant="secondary" onPress={() => setOpenId(open ? null : item.submission_id)} />
            {open ? (
              <>
                <PlanPreview floors={floors} nodes={nodes} />
                <Field
                  label="Note"
                  value={notes[item.submission_id] ?? ''}
                  onChangeText={(value) => setNotes((current) => ({ ...current, [item.submission_id]: value }))}
                  placeholder="Optional. The person who sent this can read it."
                  multiline
                />
                <Button label="Approve" icon="checkmark" haptic="success" disabled={busy} onPress={() => void review(item, true)} />
                <Button label="Reject" variant="danger" icon="close" disabled={busy} onPress={() => void review(item, false)} />
              </>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
