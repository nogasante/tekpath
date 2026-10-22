import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { CampusMap } from '@/components/CampusMap';
import { LostArt } from '@/components/Illustrations';
import { AppText, Button, Card, KindBadge, Notice, Screen, Skeleton, StatusBadge } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { useToast } from '@/context/Toast';
import { metresBetween, walkingMinutes } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { ARRIVAL_METRES, fetchRoute, floorSpoken, loadEntrance, loadNode, placeLine, spokenStep } from '@/lib/indoor';
import { useRouteLine } from '@/lib/routeLine';
import { onCampusMetres, spacing, type as typeScale } from '@/lib/theme';
import { floorLabel, type RouteResult, type RouteStep, type StartNode } from '@/lib/types';

function floorChanges(steps: RouteStep[]) {
  let count = 0;
  for (let i = 1; i < steps.length; i += 1) {
    if (steps[i].floor_level !== steps[i - 1].floor_level) count += 1;
  }
  return count;
}

type Approach = {
  entrance: StartNode;
  destination: StartNode;
  route: RouteResult | null;
  metres: number | null;
};

export default function RouteScreen() {
  const params = useLocalSearchParams<{ to?: string; from?: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { startNode, setStartNode, setRoute } = useAppState();
  const fromId = (typeof params.from === 'string' && params.from) || undefined;
  const toId = typeof params.to === 'string' ? params.to : undefined;
  const [result, setResult] = useState<RouteResult | null>(null);
  const [approach, setApproach] = useState<Approach | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const handed = useRef(false);
  const left = useRef(false);

  async function enterIndoors(entrance: StartNode, destinationId: string) {
    if (handed.current) return;
    handed.current = true;
    left.current = true;
    const indoor = await fetchRoute(entrance.id, destinationId);
    setRoute(indoor);
    void setStartNode(entrance);
    void haptic(indoor.ok ? 'success' : 'warning');
    router.replace({ pathname: '/guide', params: { to: destinationId } });
  }

  useEffect(() => {
    if (left.current) return;
    handed.current = false;
    let cancelled = false;
    let watch: Location.LocationSubscription | null = null;
    async function run() {
      setLoading(true);
      setError(null);
      setResult(null);
      setApproach(null);
      try {
        if (!toId) throw new Error('Choose a destination.');
        const destination = await loadNode(toId);
        if (cancelled || !destination) {
          if (!cancelled) throw new Error('That place is not on the map.');
          return;
        }
        const explicit = fromId ? await loadNode(fromId) : null;
        const origin = explicit ?? (startNode?.id === destination.id ? null : startNode);
        if (destination.floorLevel != null) {
          const entrance = destination.buildingId ? await loadEntrance(destination.buildingId) : null;
          if (!entrance) throw new Error('This building has no step-free entrance on the map yet.');
          if (origin?.floorLevel != null || origin?.id === entrance.id) {
            await enterIndoors(origin?.floorLevel != null ? origin : entrance, destination.id);
            return;
          }
          let outdoor: RouteResult | null = null;
          if (origin) outdoor = await fetchRoute(origin.id, destination.id);
          let metres: number | null = null;
          const permission = await Location.getForegroundPermissionsAsync();
          if (permission.granted) {
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const distance = metresBetween(position.coords.latitude, position.coords.longitude, entrance.latitude, entrance.longitude);
            if (distance <= onCampusMetres) metres = distance;
            if (distance <= ARRIVAL_METRES) {
              await enterIndoors(entrance, destination.id);
              return;
            }
            watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 5 }, (next) => {
              if (cancelled) return;
              const away = metresBetween(next.coords.latitude, next.coords.longitude, entrance.latitude, entrance.longitude);
              setApproach((current) => (current ? { ...current, metres: away } : current));
              if (away <= ARRIVAL_METRES) void enterIndoors(entrance, destination.id);
            });
          }
          if (cancelled) return;
          setApproach({ entrance, destination, route: outdoor?.ok ? outdoor : null, metres });
          if (outdoor && !outdoor.ok) setResult(outdoor);
          setLoading(false);
          return;
        }
        if (!origin) throw new Error('Choose where you are, then TekPath can route you there.');
        const route = await fetchRoute(origin.id, destination.id);
        if (cancelled) return;
        setResult(route);
        setRoute(route);
        void haptic(route.ok ? 'success' : 'warning');
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'The route didn’t load.';
        setError(message);
        toast.show('The route didn’t load.', 'bad');
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
      watch?.remove();
    };
    // enterIndoors closes over the latest setters. Re-run when the requested places change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, startNode?.id, toId, attempt]);

  const approachLine = useRouteLine(approach?.route?.ok ? approach.route.steps.map((step) => step.node_id) : []);
  const routeLine = useRouteLine(!approach && result?.ok ? result.steps.map((step) => step.node_id) : []);
  const destination = result?.ok ? result.steps[result.steps.length - 1] : undefined;

  return (
    <Screen scroll>
      {loading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={28} width="70%" />
          <Skeleton height={120} />
          <Skeleton height={64} />
        </View>
      ) : null}
      {error ? (
        <View style={{ gap: spacing.sm }}>
          <Notice tone="bad">{error}</Notice>
          <Button
            label="Try again"
            icon="refresh"
            onPress={() => {
              left.current = false;
              handed.current = false;
              setAttempt((value) => value + 1);
            }}
          />
          <Button label="Choose where you are" variant="secondary" onPress={() => router.push({ pathname: '/pick-start', params: { to: toId } })} />
        </View>
      ) : null}
      {approach ? (
        <View style={{ gap: spacing.md }}>
          <LinearGradient colors={['#0F6E56', '#083E32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, padding: spacing.lg, gap: spacing.md }}>
            <AppText size={typeScale.label} weight="700" color="rgba(255,252,248,0.8)">
              Outdoor
            </AppText>
            <AppText accessibilityRole="header" size={typeScale.title} weight="700" color="#FFFFFF">
              Walk to the step-free entrance
            </AppText>
            <AppText color="rgba(255,252,248,0.9)">{approach.destination.name}</AppText>
            <AppText color="rgba(255,252,248,0.78)">{placeLine(approach.destination)}</AppText>
            <HeroStat label="To the entrance" value={approach.metres != null ? `${Math.round(approach.metres)} m` : 'Tap when you arrive'} />
          </LinearGradient>
          <Card>
            <AppText weight="700">{approach.entrance.name}</AppText>
            <AppText color={colors.muted}>
              {approach.entrance.buildingName ? `${approach.entrance.buildingName}. ` : ''}
              Indoor guidance starts here, on {floorSpoken(approach.entrance.floorLevel, approach.entrance.floorName)}. The barometer uses this floor as its starting point.
            </AppText>
            {approach.metres != null ? (
              <AppText weight="700">{Math.round(approach.metres)} m away</AppText>
            ) : (
              <AppText color={colors.muted}>Location is off, so tap the button when you reach the door.</AppText>
            )}
          </Card>
          {approachLine.length > 1 ? (
            <View style={{ height: 180, borderRadius: 16, overflow: 'hidden' }}>
              <CampusMap features={[]} route={approachLine} interactive={false} padding={{ top: 24, right: 24, bottom: 24, left: 24 }} onSelect={() => undefined} />
            </View>
          ) : null}
          {result && !result.ok ? <Notice tone="bad">{result.message || 'No step-free outdoor path from that start. You can still begin at the entrance.'}</Notice> : null}
          <Button
            label="I'm at the entrance"
            icon="enter"
            haptic="light"
            onPress={() => void enterIndoors(approach.entrance, approach.destination.id)}
          />
          <Button label="I'm somewhere else" variant="secondary" icon="list" onPress={() => router.push({ pathname: '/pick-start', params: { to: toId } })} />
          <Button label="Scan a QR code instead" variant="ghost" icon="qr-code" onPress={() => router.push({ pathname: '/scan', params: { to: toId } })} />
        </View>
      ) : null}
      {!approach && result && !result.ok ? (
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
          <Button label="Choose where you are" icon="locate" onPress={() => router.push({ pathname: '/pick-start', params: { to: toId } })} />
          <Button label="Search for another place" icon="search" variant="secondary" onPress={() => router.push('/search')} />
        </View>
      ) : null}
      {!approach && result?.ok ? (
        <View style={{ gap: spacing.md }}>
          <LinearGradient colors={['#0F6E56', '#083E32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, padding: spacing.lg, gap: spacing.md, overflow: 'hidden' }}>
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
            {routeLine.length > 1 ? (
              <View style={{ height: 168, borderRadius: 16, overflow: 'hidden' }}>
                <CampusMap features={[]} route={routeLine} interactive={false} padding={{ top: 24, right: 24, bottom: 24, left: 24 }} onSelect={() => undefined} />
              </View>
            ) : null}
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
                {index < result.steps.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 28, backgroundColor: colors.line, marginTop: 4 }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: spacing.md, gap: 4 }}>
                <AppText weight="700">
                  {step.node_name}
                  {step.floor_level != null ? ` · ${floorLabel(step.floor_level, step.floor_name)}` : ''}
                </AppText>
                <AppText color={colors.muted}>{spokenStep(step)}</AppText>
              </View>
            </View>
          ))}
          <Button label="Start step by step" icon="walk" haptic="light" onPress={() => router.push({ pathname: '/guide', params: { to: toId } })} />
        </View>
      ) : null}
      {!loading && !fromId && !toId ? (
        <Button label="Choose where you are" onPress={() => router.push({ pathname: '/pick-start', params: { to: toId } })} />
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
