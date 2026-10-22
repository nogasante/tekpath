import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CampusMap, MapControls, type MapHandle, type MapPadding } from '@/components/CampusMap';
import { Frosted } from '@/components/Glass';
import { Mark } from '@/components/Logo';
import { Sheet } from '@/components/Sheet';
import { AppText, Chip, EmptyState, KindBadge, Notice, Skeleton, StatusBadge, Button } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { formatAgo, formatDistance, metresBetween } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { WELCOME_KEY } from '@/lib/welcome';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { campus, elevation, spacing, type as typeScale } from '@/lib/theme';
import type { AccessFeature, FeatureStatus } from '@/lib/types';
import { kindLabel } from '@/lib/types';

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
  const { colors, reduceMotion } = useTheme();
  const { startNode } = useAppState();
  const mapRef = useRef<MapHandle>(null);
  const listRef = useRef<ScrollView>(null);
  const [boxHeight, setBoxHeight] = useState(0);
  const [gate, setGate] = useState(false);
  const [features, setFeatures] = useState<AccessFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

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
    const reports = await supabase.from('report_feed').select('feature_id,photo_url').order('created_at', { ascending: false }).limit(40);
    if (!reports.error) {
      const next: Record<string, string> = {};
      for (const row of reports.data ?? []) {
        const photo = row.photo_url as string | null;
        const featureId = row.feature_id as string | null;
        if (photo && featureId && !next[featureId]) next[featureId] = photo;
      }
      setPhotos(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (supabaseConfigError) return;
    load();
    const channel = supabase
      .channel(`tekpath-map-${Math.random().toString(36).slice(2)}`)
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
  const peek = Math.max(248, Math.round((boxHeight || 780) * 0.34));
  const mid = Math.max(peek + 90, Math.round((boxHeight || 780) * 0.56));
  const full = Math.max(mid + 48, Math.round((boxHeight || 780) * 0.82));
  const snaps = useMemo(() => [peek, mid, full], [full, mid, peek]);
  const padding = useMemo<MapPadding>(
    () => ({
      top: insets.top + 128,
      right: 20,
      bottom: wide ? 48 : peek + 12,
      left: 72,
    }),
    [insets.top, peek, wide],
  );
  const origin = startNode
    ? { latitude: startNode.latitude, longitude: startNode.longitude }
    : campus;

  function choose(id: string) {
    setSelectedId(id);
    listRef.current?.scrollTo({ y: 0, animated: !reduceMotion });
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
    <ScrollView
      ref={listRef}
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
      {startLink}
      {selected ? (
        <View style={{ gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <AppText size={typeScale.headline} weight="700">
            {selected.name}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            <KindBadge kind={selected.kind} />
            <StatusBadge status={selected.status} />
          </View>
          <AppText size={typeScale.label} color={colors.muted}>
            {distanceFrom(selected, origin.latitude, origin.longitude)}
            {startNode ? ' from your start' : ' from campus centre'} · {formatAgo(selected.last_reported_at)}
          </AppText>
          {photos[selected.id] ? (
            <Image
              source={{ uri: photos[selected.id] }}
              accessible={false}
              style={{ width: '100%', height: 140, borderRadius: 16 }}
            />
          ) : null}
          <Button
            label={startNode ? 'Route here from my start' : 'Choose a start, then route here'}
            icon="navigate"
            haptic="light"
            onPress={() => routeTo(selected)}
            disabled={!selected.node_id}
          />
          <Button label="Details and reports" icon="document-text" variant="secondary" onPress={() => router.push(`/feature/${selected.id}`)} />
        </View>
      ) : (
        <AppText size={typeScale.label} color={colors.muted}>
          Broken points come first. Pins show the kind, and a badge shows Working, Broken, or Unknown.
        </AppText>
      )}
      {loading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={76} />
          <Skeleton height={76} />
          <Skeleton height={76} />
        </View>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!loading && shown.length === 0 ? (
        <EmptyState icon="filter" title="Nothing in this filter" body="Broken lifts and ramps show up here as people report them." />
      ) : null}
      {shown.map((item) => (
        <PlaceRow
          key={item.id}
          feature={item}
          distance={distanceFrom(item, origin.latitude, origin.longitude)}
          photo={photos[item.id]}
          selected={item.id === selectedId}
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
              style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
              <Frosted style={{ flex: 1, minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Mark size={26} />
                <AppText color={colors.muted} style={{ flex: 1 }}>
                  Search buildings and rooms
                </AppText>
              </Frosted>
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
        <Sheet snaps={snaps} focus={selectedId ? 1 : 0}>
          {sheetBody}
        </Sheet>
      )}
    </View>
  );
}

function distanceFrom(feature: AccessFeature, latitude: number, longitude: number) {
  return formatDistance(metresBetween(latitude, longitude, Number(feature.latitude), Number(feature.longitude)));
}

function placeIcon(kind: string): keyof typeof Ionicons.glyphMap {
  if (kind === 'lift') return 'swap-vertical';
  if (kind === 'ramp') return 'trending-up';
  if (kind === 'toilet') return 'body';
  if (kind === 'parking') return 'car';
  if (kind === 'entrance') return 'enter-outline';
  return 'location';
}

function PlaceRow({
  feature,
  distance,
  photo,
  selected,
  onPress,
}: {
  feature: AccessFeature;
  distance: string;
  photo?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const status = feature.status === 'working' ? 'Working' : feature.status === 'broken' ? 'Broken' : 'Unknown';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${feature.name}, ${kindLabel(feature.kind)}, ${status}, ${distance}, ${formatAgo(feature.last_reported_at)}`}
      onPress={() => {
        void haptic('selection');
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 76,
        padding: spacing.md,
        borderRadius: 18,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.line,
        backgroundColor: pressed ? colors.primaryMuted : colors.bgElevated,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      })}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: colors.primaryMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={placeIcon(feature.kind)} size={20} color={colors.primary} aria-hidden />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText weight="700">{feature.name}</AppText>
        <AppText size={typeScale.caption} color={colors.muted}>
          {kindLabel(feature.kind)} · {distance}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <StatusBadge status={feature.status} />
          <AppText size={typeScale.caption} color={colors.muted}>
            {formatAgo(feature.last_reported_at)}
          </AppText>
        </View>
      </View>
      {photo ? (
        <Image source={{ uri: photo }} accessible={false} style={{ width: 48, height: 48, borderRadius: 12 }} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} aria-hidden />
      )}
    </Pressable>
  );
}
