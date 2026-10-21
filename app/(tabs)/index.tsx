import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';

import { CampusMap } from '@/components/CampusMap';
import { AppText, Button, KindBadge, Notice, StatusBadge } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { colors } from '@/lib/theme';
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
  const { startNode } = useAppState();
  const [features, setFeatures] = useState<AccessFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);

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

  if (supabaseConfigError) {
    return (
      <View style={{ flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.paper }}>
        <Notice tone="bad">{supabaseConfigError}</Notice>
      </View>
    );
  }

  const list = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
        {filters.map((item) => {
          const active = filter === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Show ${item.label} points`}
              onPress={() => setFilter(item.id)}
              style={{
                minHeight: 48,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: colors.ink,
                backgroundColor: active ? colors.ink : colors.card,
                justifyContent: 'center',
              }}>
              <AppText size={16} weight="700" color={active ? '#fff' : colors.ink}>
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {loading ? <AppText style={{ paddingHorizontal: 16 }}>Loading campus points…</AppText> : null}
      {error ? (
        <View style={{ paddingHorizontal: 12 }}>
          <Notice tone="bad">{error}</Notice>
        </View>
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 24 }}
        ListEmptyComponent={
          <AppText>No accessibility points in this filter yet. Broken lifts and ramps show up here as people report them.</AppText>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.kind}, ${item.status}`}
            onPress={() => setSelectedId(item.id)}
            style={{
              minHeight: 72,
              padding: 12,
              borderRadius: 14,
              borderWidth: 2,
              borderColor: item.id === selectedId ? colors.focus : colors.line,
              backgroundColor: colors.card,
              gap: 6,
            }}>
            <AppText weight="700">{item.name}</AppText>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <KindBadge kind={item.kind} />
              <StatusBadge status={item.status} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, flexDirection: wide ? 'row' : 'column' }}>
      <View style={{ flex: 1, minHeight: wide ? 420 : 280 }}>
        <CampusMap
          features={shown}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCenter={(latitude, longitude) => setCenter({ latitude, longitude })}
        />
        <AppText size={13} color={colors.muted} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
          OpenStreetMap. Pins use a letter and a status word, not colour alone. Positions are approximate.
          {center ? ` Map centre ${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}.` : ''}
        </AppText>
      </View>
      <View style={{ flex: 1 }}>
        {selected ? (
          <View style={{ margin: 12, padding: 12, borderWidth: 2, borderColor: colors.ink, borderRadius: 16, backgroundColor: colors.card, gap: 10 }}>
            <AppText size={22} weight="700">{selected.name}</AppText>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <KindBadge kind={selected.kind} />
              <StatusBadge status={selected.status} />
            </View>
            <AppText size={15} color={colors.muted}>
              {selected.last_reported_at
                ? `Last report ${new Date(selected.last_reported_at).toLocaleString()}`
                : 'No reports yet.'}
            </AppText>
            <Button label="Open details and reports" icon="document-text" onPress={() => router.push(`/feature/${selected.id}`)} />
            <Button
              label={startNode ? 'Route here from my start' : 'Choose a start, then route here'}
              icon="navigate"
              variant="secondary"
              onPress={() => {
                if (!selected.node_id) return;
                if (startNode) router.push({ pathname: '/route', params: { to: selected.node_id, from: startNode.id } });
                else router.push({ pathname: '/pick-start', params: { to: selected.node_id } });
              }}
              disabled={!selected.node_id}
            />
            {!selected.node_id ? <AppText size={15}>This point is not linked to the route graph yet.</AppText> : null}
          </View>
        ) : (
          <AppText style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            {startNode ? `Start point: ${startNode.name}.` : 'Scan a QR code or pick where you are before asking for a route.'}{' '}
            Tap a point. Broken items are listed first.
          </AppText>
        )}
        {list}
      </View>
    </View>
  );
}
