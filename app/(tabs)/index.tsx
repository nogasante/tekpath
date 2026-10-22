import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mark } from '@/components/Logo';
import { CampusMap, MapControls, type MapHandle, type MapPadding } from '@/components/CampusMap';
import { Sheet } from '@/components/Sheet';
import { AppText, Chip, EmptyState, KindBadge, ListRow, Notice, Skeleton, StatusBadge, Button } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { haptic } from '@/lib/haptics';
import { WELCOME_KEY } from '@/lib/welcome';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { elevation, radii, spacing, type as typeScale } from '@/lib/theme';
import type { AccessFeature, FeatureStatus } from '@/lib/types';

const filters: { id: 'all' | FeatureStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'broken', label: 'Broken' },
  { id: 'unknown', label: 'Unknown' },
  { id: 'working', label: 'Working' },
];

function rank(status: string) {
  if (status === 'broken') return 0;
  if (status === 'unknown') return 1;
  return 2;
}

export default function MapScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { startNode } = useAppState();
  const mapRef = useRef<MapHandle>(null);
  const [boxHeight, setBoxHeight] = useState(0);
  const [gate, setGate] = useState(false);
  const [features, setFeatures] = useState<AccessFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(WELCOME_KEY).then((value) => {
      if (!live) return;
      if (!value) router.replace('/welcome');
      else setGate(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('features')
      .select('id,node_id,building_id,kind,name,status,last_reported_at,latitude,longitude')
      .order('name');
    if (queryError) setError(queryError.message);
    else {
      setError(null);
      setFeatures((data ?? []) as AccessFeature[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (supabaseConfigError) return;
    load();
    const channel = supabase
      .channel('tekpath-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'features' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const shown = useMemo(
    () =>
      features
        .filter((feature) => filter === 'all' || feature.status === filter)
        .sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name)),
    [features, filter],
  );
  const selected = features.find((feature) => feature.id === selectedId) ?? null;
  const collapsed = Math.max(230, Math.round((boxHeight || 700) * 0.36));
  const expanded = Math.max(collapsed + 80, Math.round((boxHeight || 700) * 0.74));
  const padding = useMemo<MapPadding>(
    () => ({
      top: insets.top + 132,
      right: 20,
      bottom: wide ? 48 : collapsed + 16,
      left: 72,
    }),
    [collapsed, insets.top, wide],
  );

  function choose(id: string) {
    setSelectedId(id);
  }

  function routeTo(feature: AccessFeature) {
    if (!feature.node_id) return;
    if (startNode) router.push({ pathname: '/route', params: { to: feature.node_id, from: startNode.id } });
    else router.push({ pathname: '/pick-start', params: { to: feature.node_id } });
  }

  if (!gate && !supabaseConfigError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (supabaseConfigError) {
    return (
      <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'center', backgroundColor: colors.bg }}>
        <Notice tone="bad">{supabaseConfigError}</Notice>
      </View>
    );
  }

  const startLink = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={startNode ? `Start point ${startNode.name}. Change start.` : 'Set a start point'}
      onPress={() => router.push('/pick-start')}
      style={{ minHeight: 48, justifyContent: 'center' }}>
      <AppText size={typeScale.label} weight="700" color={colors.primary}>
        {startNode ? `From ${startNode.name}` : 'Set where you are'}
      </AppText>
    </Pressable>
  );

  const sheetBody = (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      {selected ? (
        <View style={{ gap: spacing.sm }}>
          <AppText size={typeScale.headline} weight="700">
            {selected.name}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
            <KindBadge kind={selected.kind} />
            <StatusBadge status={selected.status} />
          </View>
          <AppText size={typeScale.label} color={colors.muted}>
            {selected.last_reported_at
              ? `Last report ${new Date(selected.last_reported_at).toLocaleString()}`
              : 'No reports yet. Status can still change.'}
          </AppText>
          <Button
            label={startNode ? 'Route here from my start' : 'Choose a start, then route here'}
            icon="navigate"
            haptic="light"
            onPress={() => routeTo(selected)}
            disabled={!selected.node_id}
          />
          <Button
            label="Details and reports"
            icon="document-text"
            variant="secondary"
            onPress={() => router.push(`/feature/${selected.id}`)}
          />
          {!selected.node_id ? (
            <AppText size={typeScale.label} color={colors.muted}>
              This point is not linked to the route graph yet.
            </AppText>
          ) : null}
          {startLink}
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {startLink}
          <AppText size={typeScale.label} color={colors.muted}>
            Broken points are listed first. Tap a row or a pin. Letters mark the kind; the symbol marks Working, Broken, or Unknown.
          </AppText>
        </View>
      )}
      {loading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!loading && shown.length === 0 ? (
        <EmptyState
          icon="filter"
          title="Nothing in this filter"
          body="Broken lifts and ramps show up here as people report them."
        />
      ) : null}
      {shown.map((item) => (
        <ListRow
          key={item.id}
          title={item.name}
          subtitle={`${kindLabelSafe(item.kind)} · ${item.status === 'working' ? 'Working' : item.status === 'broken' ? 'Broken' : 'Unknown'}`}
          icon={item.kind === 'lift' ? 'swap-vertical' : item.kind === 'ramp' ? 'trending-up' : 'location'}
          accessibilityLabel={`${item.name}, ${item.kind}, ${item.status}`}
          onPress={() => choose(item.id)}
        />
      ))}
    </ScrollView>
  );

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg, flexDirection: wide ? 'row' : 'column' }}
      onLayout={(event) => setBoxHeight(event.nativeEvent.layout.height)}>
      <View style={{ flex: 1 }}>
        <CampusMap
          features={shown}
          selectedId={selectedId}
          onSelect={(id) => {
            choose(id);
            void haptic('selection');
          }}
          padding={padding}
          ref={mapRef}
        />
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: insets.top + 8, left: spacing.md, right: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search buildings and rooms"
              onPress={() => router.push('/search')}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minHeight: 52,
                  borderRadius: radii.pill,
                  backgroundColor: colors.bgElevated,
                  borderWidth: 1,
                  borderColor: colors.line,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  opacity: pressed ? 0.9 : 1,
                },
                elevation(colors, 2),
              ]}>
              <Mark size={26} />
              <AppText color={colors.muted} style={{ flex: 1 }}>
                Search buildings and rooms
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan a checkpoint QR code"
              onPress={() => router.push('/scan')}
              style={({ pressed }) => [
                {
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.9 : 1,
                },
                elevation(colors, 2),
              ]}>
              <Ionicons name="qr-code" size={22} color={colors.onPrimary} aria-hidden />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: 8 }}>
            {filters.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={filter === item.id}
                accessibilityLabel={`Show ${item.label} points`}
                onPress={() => setFilter(item.id)}
              />
            ))}
          </ScrollView>
        </View>
        <MapControls mapRef={mapRef} style={{ position: 'absolute', top: insets.top + 132, left: spacing.md }} />
      </View>
      {wide ? (
        <View style={{ width: 380, borderLeftWidth: 1, borderLeftColor: colors.line, backgroundColor: colors.bg }}>{sheetBody}</View>
      ) : (
        <Sheet collapsed={collapsed} expanded={expanded}>
          {sheetBody}
        </Sheet>
      )}
    </View>
  );
}

function kindLabelSafe(kind: string) {
  if (kind === 'lift') return 'Lift';
  if (kind === 'ramp') return 'Ramp';
  if (kind === 'toilet') return 'Accessible toilet';
  if (kind === 'parking') return 'Parking';
  if (kind === 'entrance') return 'Entrance';
  return kind;
}
