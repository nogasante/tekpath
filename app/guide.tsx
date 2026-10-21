import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { FloorPlan } from '@/components/FloorPlan';
import { AppText, Button, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { floorLabel } from '@/lib/types';

type Room = { name: string; x: number; y: number; w: number; h: number };

export default function GuideScreen() {
  const { route, floor, correctFloor } = useAppState();
  const [index, setIndex] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const startedFloor = useRef<number | null>(null);

  const step = route?.ok ? route.steps[index] : undefined;

  useEffect(() => {
    startedFloor.current = floor.level;
    setAutoNote(null);
  }, [index]);

  useEffect(() => {
    if (!step || step.edge_type !== 'lift') return;
    if (floor.source !== 'barometer' || floor.level == null || step.floor_level == null) return;
    if (floor.level !== step.floor_level) return;
    if (floor.level === startedFloor.current) return;
    const timer = setTimeout(() => {
      setAutoNote(`Barometer detected ${floorLabel(floor.level)}. Moving to the next landmark.`);
      setIndex((current) => Math.min((route?.steps.length ?? 1) - 1, current + 1));
    }, 1200);
    return () => clearTimeout(timer);
  }, [floor.level, floor.source, step, route?.steps.length]);

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

  if (!route?.ok || !step) {
    return (
      <Screen scroll>
        <Notice>Plan a step-free route first. Guidance shows one landmark at a time.</Notice>
        <Button label="Search for a room" onPress={() => router.push('/search')} />
      </Screen>
    );
  }

  const last = index >= route.steps.length - 1;

  return (
    <Screen scroll>
      <AppText size={16} color={colors.muted}>
        Step {index + 1} of {route.steps.length}
        {step.floor_level != null ? ` · ${floorLabel(step.floor_level, step.floor_name)}` : ''}
      </AppText>
      <AppText accessibilityRole="header" accessibilityLiveRegion="polite" size={32} weight="700">
        {step.instruction}
      </AppText>
      {step.landmark_description ? <AppText>{step.landmark_description}</AppText> : null}
      {step.qr_code ? <AppText size={16}>Checkpoint code {step.qr_code}</AppText> : null}
      {rooms.length > 0 ? <FloorPlan rooms={rooms} activeName={step.node_name} planX={step.plan_x} planY={step.plan_y} /> : null}
      <Notice tone={floor.source === 'barometer' ? 'good' : 'info'}>
        {floor.source === 'barometer'
          ? `Barometer floor: ${floor.label}. TekPath advances a lift step when this matches the next floor.`
          : floor.source === 'none'
            ? `No barometer on this device. Floor is ${floor.label}. Change it if that is wrong, then tap I'm here.`
            : `This start is ${floor.label}.`}
        {floor.pressure != null ? ` Pressure ${floor.pressure.toFixed(1)} hPa.` : ''}
      </Notice>
      {autoNote ? <Notice tone="good">{autoNote}</Notice> : null}
      {step.floor_level != null ? (
        <>
          <Button label="I'm one floor up" variant="secondary" onPress={() => correctFloor((floor.level ?? step.floor_level ?? 0) + 1)} />
          <Button label="I'm one floor down" variant="secondary" onPress={() => correctFloor((floor.level ?? step.floor_level ?? 0) - 1)} />
        </>
      ) : null}
      {index > 0 ? <Button label="Previous landmark" variant="secondary" onPress={() => setIndex((value) => value - 1)} /> : null}
      <Button
        label={last ? "I've arrived" : "I'm here — next"}
        onPress={() => {
          if (last) router.replace('/');
          else setIndex((value) => value + 1);
        }}
      />
    </Screen>
  );
}
