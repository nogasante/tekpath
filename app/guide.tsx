import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { FloorPlan } from '@/components/FloorPlan';
import { AppText, Button, Card, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { spacing, type as typeScale } from '@/lib/theme';
import { floorLabel, type RouteStep } from '@/lib/types';

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

  const floorRoute = route.steps
    .filter((item) => item.floor_id === step.floor_id && item.plan_x != null && item.plan_y != null)
    .map((item) => ({ x: Number(item.plan_x), y: Number(item.plan_y) }));
  const floorName = step.floor_level != null ? floorLabel(step.floor_level, step.floor_name) : 'Outdoors';

  return (
    <Screen padded={false}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg }}
        keyboardShouldPersistTaps="handled">
      <AppText size={typeScale.label} weight="600" color={colors.muted}>
        Step {index + 1} of {route.steps.length}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: route.steps.length, now: index + 1 }}
        contentContainerStyle={{ alignItems: 'center', paddingVertical: 4 }}>
        {route.steps.map((item, itemIndex) => (
          <StepDot
            key={`${item.order}-${item.node_id}`}
            step={item}
            index={itemIndex}
            current={itemIndex === index}
            done={itemIndex < index}
            floorChange={itemIndex > 0 && item.floor_level !== route.steps[itemIndex - 1].floor_level}
            onPress={() => setIndex(itemIndex)}
          />
        ))}
      </ScrollView>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: colors.primaryMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name={actionIcon(step.edge_type)} size={24} color={colors.primary} aria-hidden />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText size={typeScale.caption} weight="700" color={colors.accent}>
              {floorName}
            </AppText>
            <AppText accessibilityRole="header" accessibilityLiveRegion="polite" size={typeScale.headline} weight="600">
              {step.instruction}
            </AppText>
            <AppText weight="600">{step.node_name}</AppText>
            {step.landmark_description ? (
              <AppText size={typeScale.label} color={colors.muted}>
                {step.landmark_description}
              </AppText>
            ) : null}
            {step.qr_code ? (
              <AppText size={typeScale.caption} color={colors.muted}>
                Checkpoint {step.qr_code}
              </AppText>
            ) : null}
          </View>
        </View>
      </Card>
      {rooms.length > 0 ? (
        <FloorPlan rooms={rooms} activeName={step.node_name} planX={step.plan_x} planY={step.plan_y} route={floorRoute} />
      ) : null}
      <Notice tone={floor.source === 'barometer' ? 'good' : 'info'}>
        {floor.source === 'barometer'
          ? `Barometer floor: ${floor.label}. TekPath advances a lift step when this matches the next floor.`
          : floor.source === 'none'
            ? `No barometer on this device. Floor is ${floor.label}. Use the switcher if that is wrong, then tap I'm here.`
            : `This start is ${floor.label}.`}
        {floor.pressure != null ? ` Pressure ${floor.pressure.toFixed(1)} hPa.` : ''}
      </Notice>
      {autoNote ? <Notice tone="good">{autoNote}</Notice> : null}
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
      </View>
    </Screen>
  );
}

function actionIcon(edge: string | null): keyof typeof Ionicons.glyphMap {
  if (edge === 'ramp') return 'trending-up';
  if (edge === 'lift') return 'swap-vertical';
  if (edge === 'stairs') return 'warning';
  if (edge === 'corridor' || edge === 'path') return 'arrow-forward';
  return 'locate';
}

function StepDot({
  step,
  index,
  current,
  done,
  floorChange,
  onPress,
}: {
  step: RouteStep;
  index: number;
  current: boolean;
  done: boolean;
  floorChange: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {index > 0 ? (
        <View style={{ width: 14, height: floorChange ? 8 : 2, borderRadius: 4, backgroundColor: floorChange ? colors.accentSoft : colors.line }} />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Step ${index + 1}, ${step.node_name}${floorChange ? ', floor change' : ''}`}
        accessibilityState={{ selected: current }}
        onPress={onPress}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: current ? 16 : 10,
            height: current ? 16 : 10,
            borderRadius: 8,
            backgroundColor: current || done ? colors.primary : colors.line,
            borderWidth: floorChange ? 2 : 0,
            borderColor: colors.accentSoft,
          }}
        />
      </Pressable>
    </View>
  );
}
