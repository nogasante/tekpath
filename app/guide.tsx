import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { FloorPlan } from '@/components/FloorPlan';
import { AppText, Button, Card, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { spacing, type as typeScale } from '@/lib/theme';
import { floorLabel } from '@/lib/types';

type Room = { name: string; x: number; y: number; w: number; h: number };

export default function GuideScreen() {
  const { colors } = useTheme();
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
  const progress = (index + 1) / route.steps.length;

  return (
    <Screen scroll>
      <AppText size={typeScale.label} weight="700" color={colors.muted}>
        Step {index + 1} of {route.steps.length}
      </AppText>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: route.steps.length, now: index + 1 }}
        style={{ height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' }}>
        <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: colors.primary }} />
      </View>
      <View
        accessibilityLabel={step.floor_level != null ? floorLabel(step.floor_level, step.floor_name) : 'Outdoors'}
        style={{
          alignSelf: 'flex-start',
          minHeight: 48,
          paddingHorizontal: 14,
          borderRadius: 999,
          backgroundColor: colors.primaryMuted,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}>
        <AppText weight="700" color={colors.primary}>
          {step.floor_level != null ? floorLabel(step.floor_level, step.floor_name) : 'Outdoors'}
        </AppText>
      </View>
      <Card>
        <AppText accessibilityRole="header" accessibilityLiveRegion="polite" size={typeScale.display} weight="700">
          {step.instruction}
        </AppText>
        <AppText weight="700">{step.node_name}</AppText>
        {step.landmark_description ? <AppText color={colors.muted}>{step.landmark_description}</AppText> : null}
        {step.qr_code ? (
          <AppText size={typeScale.label} color={colors.muted}>
            Checkpoint code {step.qr_code}
          </AppText>
        ) : null}
      </Card>
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
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="One floor up" variant="secondary" onPress={() => correctFloor((floor.level ?? step.floor_level ?? 0) + 1)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="One floor down" variant="secondary" onPress={() => correctFloor((floor.level ?? step.floor_level ?? 0) - 1)} />
          </View>
        </View>
      ) : null}
      {index > 0 ? (
        <Button label="Previous landmark" variant="secondary" onPress={() => setIndex((value) => value - 1)} />
      ) : null}
      <Button
        label={last ? "I've arrived" : "I'm here — next"}
        icon={last ? 'checkmark' : 'arrow-forward'}
        onPress={() => {
          void haptic(last ? 'success' : 'light');
          if (last) router.replace('/');
          else setIndex((value) => value + 1);
        }}
      />
    </Screen>
  );
}
