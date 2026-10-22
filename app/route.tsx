import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { LostArt } from '@/components/Illustrations';
import { AppText, Button, Card, KindBadge, Notice, Screen, Skeleton, StatusBadge } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { walkingMinutes } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { spacing, type as typeScale } from '@/lib/theme';
import { asRoute, floorLabel, type RouteResult, type RouteStep } from '@/lib/types';

function floorChanges(steps: RouteStep[]) {
  let count = 0;
  for (let i = 1; i < steps.length; i += 1) {
    if (steps[i].floor_level !== steps[i - 1].floor_level) count += 1;
  }
  return count;
}

export default function RouteScreen() {
  const params = useLocalSearchParams<{ to?: string; from?: string }>();
  const { colors } = useTheme();
  const { startNode, setRoute } = useAppState();
  const fromId = (typeof params.from === 'string' && params.from) || startNode?.id;
  const toId = typeof params.to === 'string' ? params.to : undefined;
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fromId || !toId) {
      setLoading(false);
      setError('Choose a start and a destination.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase.rpc('find_step_free_route', { p_from: fromId, p_to: toId }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setResult(null);
      } else {
        const route = asRoute(data);
        setResult(route);
        setRoute(route);
        setError(null);
        void haptic(route.ok ? 'success' : 'warning');
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fromId, toId, setRoute]);

  const destination = result?.ok ? result.steps[result.steps.length - 1] : undefined;

  return (
    <Screen scroll>
      {loading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={28} width="70%" />
          <Skeleton height={88} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result && !result.ok ? (
        <View style={{ gap: spacing.md }}>
          <LostArt />
          <AppText accessibilityRole="header" size={typeScale.title} weight="700">
            No step-free way right now
          </AppText>
          <AppText color={colors.muted}>
            {result.message || 'TekPath will not send you via stairs. Every step-free path uses a lift or ramp that is reported broken.'} You can try another start, pick a different place, or report a lift that is actually working.
          </AppText>
          {result.blockers.map((blocker) => (
            <Card key={blocker.id}>
              <AppText weight="700">{blocker.name}</AppText>
              <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
                <KindBadge kind={blocker.kind} />
                <StatusBadge status={blocker.status} />
              </View>
              <Button label={`Open ${blocker.name}`} variant="secondary" onPress={() => router.push(`/feature/${blocker.id}`)} />
            </Card>
          ))}
          <Button label="Try a different start" icon="locate" onPress={() => router.push({ pathname: '/pick-start', params: { to: toId } })} />
          <Button label="Search for another place" icon="search" variant="secondary" onPress={() => router.push('/search')} />
        </View>
      ) : null}
      {result?.ok ? (
        <View style={{ gap: spacing.md }}>
          <LinearGradient
            colors={['#0F6E56', '#083E32']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 28, padding: spacing.lg, gap: spacing.md, overflow: 'hidden' }}>
            <AppText accessibilityRole="header" size={typeScale.title} weight="700" color="#FFFFFF">
              {destination?.node_name ?? 'Step-free route'}
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <HeroStat label="Time" value={result.distance_m != null ? `${walkingMinutes(Number(result.distance_m))} min` : '—'} />
              <HeroStat label="Distance" value={result.distance_m != null ? `${Math.round(Number(result.distance_m))} m` : '—'} />
            </View>
            <View
              accessibilityLabel="Step-free route"
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 36,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: 'rgba(255,252,248,0.16)',
              }}>
              <Ionicons name="walk" size={18} color="#FFFFFF" aria-hidden />
              <AppText weight="700" color="#FFFFFF">
                Step-free
              </AppText>
            </View>
            <RoutePreview steps={result.steps} />
          </LinearGradient>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Stat label="Landmarks" value={String(result.steps.length)} />
            <Stat label="Floor changes" value={String(floorChanges(result.steps))} />
          </View>
          <AppText size={typeScale.label} color={colors.muted}>
            Stairs stay off this route. Broken lifts and ramps are left out.
          </AppText>
          {result.steps.map((step, index) => (
            <View key={`${step.order}-${step.node_id}`} style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ alignItems: 'center', width: 28 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: index === result.steps.length - 1 ? colors.primary : colors.primaryMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <AppText size={13} weight="700" color={index === result.steps.length - 1 ? colors.onPrimary : colors.primary}>
                    {step.order}
                  </AppText>
                </View>
                {index < result.steps.length - 1 ? (
                  <View style={{ width: 2, flex: 1, minHeight: 28, backgroundColor: colors.line, marginTop: 4 }} />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingBottom: spacing.md, gap: 4 }}>
                <AppText weight="700">
                  {step.node_name}
                  {step.floor_level != null ? ` · ${floorLabel(step.floor_level, step.floor_name)}` : ''}
                </AppText>
                <AppText color={colors.muted}>{step.instruction}</AppText>
              </View>
            </View>
          ))}
          <Button label="Start step by step" icon="walk" haptic="light" onPress={() => router.push('/guide')} />
        </View>
      ) : null}
      {!fromId ? (
        <Button label="Pick where you are" onPress={() => router.push({ pathname: '/pick-start', params: { to: toId } })} />
      ) : null}
    </Screen>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View accessibilityLabel={`${label} ${value}`} style={{ gap: 2 }}>
      <AppText size={typeScale.caption} weight="600" color="rgba(255,252,248,0.78)">
        {label}
      </AppText>
      <AppText size={typeScale.headline} weight="700" color="#FFFFFF">
        {value}
      </AppText>
    </View>
  );
}

function RoutePreview({ steps }: { steps: RouteStep[] }) {
  const width = 240;
  const height = 56;
  const points = steps.map((step, index) => {
    const x = 16 + (index * (width - 32)) / Math.max(1, steps.length - 1);
    const y = step.floor_level == null ? 40 : 16 + (2 - Math.min(2, step.floor_level)) * 10;
    return { x, y, change: index > 0 && step.floor_level !== steps[index - 1].floor_level };
  });
  const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  return (
    <View accessibilityLabel="Preview of the route, with marks where the floor changes" style={{ backgroundColor: 'rgba(255,252,248,0.1)', borderRadius: 16, paddingVertical: 6 }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={d} stroke="#FFFFFF" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <Circle key={index} cx={point.x} cy={point.y} r={point.change ? 4.5 : 3} fill={point.change ? '#E8A06A' : '#FFFFFF'} />
        ))}
      </Svg>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={`${label} ${value}`}
      style={{
        minWidth: 96,
        minHeight: 72,
        padding: spacing.md,
        borderRadius: 16,
        backgroundColor: colors.bgElevated,
        borderWidth: 1,
        borderColor: colors.line,
        gap: 2,
      }}>
      <AppText size={typeScale.caption} weight="700" color={colors.muted}>
        {label}
      </AppText>
      <AppText size={typeScale.headline} weight="700">
        {value}
      </AppText>
    </View>
  );
}
