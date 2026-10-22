import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { FloorPlan } from '@/components/FloorPlan';
import { ConfirmedArt } from '@/components/Illustrations';
import { AppText, Button, Card, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { haptic } from '@/lib/haptics';
import { fetchRoute, floorSpoken, spokenStep } from '@/lib/indoor';
import { useResumeWhenSignedIn } from '@/lib/resumeAuth';
import { formatDistance } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { radii, spacing, type as typeScale } from '@/lib/theme';

type Room = { name: string; x: number; y: number; w: number; h: number };

export default function GuideScreen() {
  const params = useLocalSearchParams<{ to?: string }>();
  const toId = typeof params.to === 'string' ? params.to : undefined;
  const { colors } = useTheme();
  const { route, setRoute, floor, correctFloor, session, startNode } = useAppState();
  const [index, setIndex] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [lengths, setLengths] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reportRef = useRef<() => void>(() => undefined);
  const armReport = useResumeWhenSignedIn(Boolean(session), () => reportRef.current());

  const step = route?.ok ? route.steps[index] : undefined;
  const upcoming = route?.ok ? route.steps[index + 1] : undefined;

  useEffect(() => {
    if (!toId || !startNode || route?.ok) return;
    let cancelled = false;
    fetchRoute(startNode.id, toId)
      .then((next) => {
        if (!cancelled) setRoute(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [route?.ok, setRoute, startNode, toId]);

  useEffect(() => {
    setAutoNote(null);
    setBlockNote(null);
  }, [index]);

  useEffect(() => {
    if (!step || step.edge_type !== 'lift') return;
    if (floor.source !== 'barometer' || floor.level == null || step.floor_level == null) return;
    if (floor.level !== step.floor_level) return;
    if (index === 0) return;
    const previous = route?.steps[index - 1];
    if (previous?.floor_level != null && previous.floor_level === floor.level) return;
    const timer = setTimeout(() => {
      setAutoNote(`Floor ${floorSpoken(floor.level)} detected. Moving to the next landmark.`);
      setIndex((current) => Math.min((route?.steps.length ?? 1) - 1, current + 1));
      void haptic('success');
    }, 900);
    return () => clearTimeout(timer);
  }, [floor.level, floor.source, index, route?.steps, step]);

  useEffect(() => {
    if (!route?.ok) return;
    const edgeIds = route.steps.map((item) => item.edge_id).filter((id): id is string => !!id);
    const nodeIds = route.steps.map((item) => item.node_id);
    if (edgeIds.length) {
      supabase
        .from('edges')
        .select('id,length_m')
        .in('id', edgeIds)
        .then(({ data }) => {
          const next: Record<string, number> = {};
          for (const row of data ?? []) next[row.id as string] = Number(row.length_m);
          setLengths(next);
        });
    }
    supabase
      .from('nodes')
      .select('id,photo_url')
      .in('id', nodeIds)
      .then(({ data, error }) => {
        if (error || !data) return;
        const next: Record<string, string> = {};
        for (const row of data) {
          const photo = (row as { photo_url?: string | null }).photo_url;
          if (photo) next[row.id as string] = photo;
        }
        setPhotos(next);
      });
  }, [route]);

  useEffect(() => {
    if (!step?.floor_id) {
      setRooms([]);
      return;
    }
    supabase
      .from('floors')
      .select('layout')
      .eq('id', step.floor_id)
      .maybeSingle()
      .then(({ data }) => {
        const layout = data?.layout as { rooms?: Room[] } | null;
        setRooms(Array.isArray(layout?.rooms) ? layout.rooms : []);
      });
  }, [step?.floor_id]);

  async function reportBlocked() {
    if (!step || !route?.ok || !toId) return;
    if (!session) {
      armReport(true);
      router.push({ pathname: '/login', params: { next: `/guide?to=${toId}` } });
      return;
    }
    setBusy(true);
    setBlockNote(null);
    try {
      const ids = [step.node_id, route.steps[index - 1]?.node_id].filter((id): id is string => !!id);
      const { data, error } = await supabase.from('nodes').select('id,feature_id').in('id', ids);
      if (error) throw new Error(error.message);
      const current = data?.find((row) => row.id === step.node_id && row.feature_id);
      const previous = data?.find((row) => row.feature_id && row.id !== step.node_id);
      const featureId = (current?.feature_id || previous?.feature_id) as string | undefined;
      if (!featureId) {
        setBlockNote('This landmark is not a lift or ramp TekPath can mark broken. Choose another place nearby.');
        return;
      }
      const { error: insertError } = await supabase.from('reports').insert({
        feature_id: featureId,
        node_id: step.node_id,
        user_id: session.user.id,
        status: 'broken',
        note: 'I could not get through here.',
      });
      if (insertError) throw new Error(insertError.message);
      const next = await fetchRoute(step.node_id, toId);
      setRoute(next);
      setIndex(0);
      setBlockNote(next.ok ? 'Reported. Here is another step-free way.' : next.message || 'No other step-free way from here.');
      void haptic(next.ok ? 'success' : 'warning');
    } catch (err) {
      setBlockNote(err instanceof Error ? err.message : 'The report did not save.');
      void haptic('warning');
    } finally {
      setBusy(false);
    }
  }

  reportRef.current = () => {
    void reportBlocked();
  };

  if (arrived && step) {
    return (
      <Screen scroll>
        <ConfirmedArt />
        <AppText accessibilityRole="header" size={typeScale.title} weight="700">
          You have arrived
        </AppText>
        <AppText color={colors.muted}>
          {step.node_name}
          {step.building_name ? `, ${step.building_name}` : ''}
          {step.floor_level != null ? `, ${floorSpoken(step.floor_level, step.floor_name)}` : ''}.
        </AppText>
        <Button label="Back to the map" icon="map" haptic="success" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!route?.ok || !step) {
    return (
      <Screen scroll>
        <Notice>{route && !route.ok ? route.message || 'No step-free way from here.' : 'Plan a step-free route first. Guidance shows one landmark at a time.'}</Notice>
        <Button label="Search for a room" onPress={() => router.push('/search')} />
        {route && !route.ok ? (
          <Button label="Choose where you are" variant="secondary" onPress={() => router.push({ pathname: '/pick-start', params: { to: toId } })} />
        ) : null}
      </Screen>
    );
  }

  const last = index >= route.steps.length - 1;
  const ahead = upcoming?.edge_id ? lengths[upcoming.edge_id] : undefined;
  const floorRoute = route.steps
    .filter((item) => item.floor_id === step.floor_id && item.plan_x != null && item.plan_y != null)
    .map((item) => ({ x: Number(item.plan_x), y: Number(item.plan_y) }));
  const floorName = step.floor_level != null ? floorSpoken(step.floor_level, step.floor_name) : 'Outdoors';
  const photo = photos[step.node_id];

  return (
    <Screen padded={false}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
        <AppText size={typeScale.label} weight="600" color={colors.muted}>
          Step {index + 1} of {route.steps.length}
          {step.building_name ? ` · ${step.building_name}` : ''}
        </AppText>
        <Card>
          <AppText size={typeScale.caption} weight="700" color={colors.accent}>
            {floorName}
          </AppText>
          <AppText accessibilityRole="header" accessibilityLiveRegion="polite" size={typeScale.title} weight="700">
            {spokenStep(step)}
          </AppText>
          <AppText weight="700">{step.node_name}</AppText>
          {step.landmark_description ? <AppText color={colors.muted}>{step.landmark_description}</AppText> : null}
          {ahead != null && Number.isFinite(ahead) ? (
            <AppText weight="700" color={colors.primary}>
              {formatDistance(ahead)} to the next landmark
            </AppText>
          ) : null}
          {photo ? (
            <Image source={{ uri: photo }} accessibilityLabel={`Photo of ${step.node_name}`} style={{ width: '100%', height: 160, borderRadius: radii.md }} />
          ) : (
            <View
              accessibilityLabel="No photo for this landmark"
              style={{
                minHeight: 72,
                borderRadius: radii.md,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.line,
                alignItems: 'center',
                justifyContent: 'center',
                padding: spacing.md,
              }}>
              <AppText size={typeScale.label} color={colors.muted}>
                No photo for this landmark yet
              </AppText>
            </View>
          )}
        </Card>
        {rooms.length > 0 ? (
          <FloorPlan rooms={rooms} activeName={step.node_name} planX={step.plan_x} planY={step.plan_y} route={floorRoute} />
        ) : null}
        <Notice tone={floor.source === 'barometer' ? 'good' : 'info'}>
          {floor.source === 'barometer'
            ? `Estimated floor: ${floor.label}. A lift step moves on when this matches the next floor.`
            : floor.source === 'none'
              ? `Floor is ${floor.label}. Correct it if the phone has no barometer.`
              : `You started ${floor.label}. Indoor steps begin at the entrance.`}
        </Notice>
        {autoNote ? <Notice tone="good">{autoNote}</Notice> : null}
        {blockNote ? <Notice tone={blockNote.startsWith('Reported') ? 'good' : 'info'}>{blockNote}</Notice> : null}
        {step.floor_level != null ? (
          <View
            style={{
              minHeight: 48,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.bgElevated,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="One floor down"
              onPress={() => correctFloor((floor.level ?? step.floor_level ?? 0) - 1)}
              style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="chevron-down" size={22} color={colors.ink} aria-hidden />
            </Pressable>
            <AppText weight="700" style={{ flex: 1, textAlign: 'center' }}>
              {floor.label}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="One floor up"
              onPress={() => correctFloor((floor.level ?? step.floor_level ?? 0) + 1)}
              style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="chevron-up" size={22} color={colors.ink} aria-hidden />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm, backgroundColor: colors.bg }}>
        {!last ? (
          <Button label={busy ? 'Checking another way…' : "I can't get through here"} variant="secondary" icon="warning" onPress={() => void reportBlocked()} disabled={busy} />
        ) : null}
        {index > 0 ? <Button label="Previous landmark" variant="secondary" onPress={() => setIndex((value) => value - 1)} /> : null}
        <Button
          label={last ? "I've arrived" : "I'm here — next"}
          icon={last ? 'checkmark' : 'arrow-forward'}
          onPress={() => {
            void haptic(last ? 'success' : 'light');
            if (step?.floor_level != null) correctFloor(step.floor_level);
            if (last) setArrived(true);
            else setIndex((value) => value + 1);
          }}
        />
      </View>
    </Screen>
  );
}
