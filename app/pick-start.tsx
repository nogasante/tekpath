import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Field, ListRow, Notice, Screen, Skeleton } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { fetchRoute, loadEntrance, loadNode, placeLine, searchNeedle, startBucket } from '@/lib/indoor';
import { nodeSelect, toStartNode } from '@/lib/nodes';
import { supabase } from '@/lib/supabase';
import { onCampusMetres, type as typeScale } from '@/lib/theme';
import type { StartNode } from '@/lib/types';

const sections: { id: 'entrance' | 'lift' | 'landmark' | 'room'; title: string; icon: 'enter-outline' | 'swap-vertical' | 'flag' | 'keypad' }[] = [
  { id: 'entrance', title: 'Entrances', icon: 'enter-outline' },
  { id: 'lift', title: 'Lift lobbies', icon: 'swap-vertical' },
  { id: 'landmark', title: 'Landmarks', icon: 'flag' },
  { id: 'room', title: 'Rooms', icon: 'keypad' },
];

export default function PickStartScreen() {
  const params = useLocalSearchParams<{ to?: string }>();
  const toId = typeof params.to === 'string' ? params.to : undefined;
  const { setStartNode, setRoute } = useAppState();
  const { colors } = useTheme();
  const [nodes, setNodes] = useState<StartNode[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [nearestId, setNearestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('nodes')
      .select(nodeSelect)
      .order('name')
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) setError(queryError.message);
        else {
          setError(null);
          setNodes((data ?? []).map((row) => toStartNode(row)));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync().then(async (permission) => {
      if (cancelled || !permission.granted) return;
      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { data } = await supabase.rpc('nearest_start_node', {
          p_lat: position.coords.latitude,
          p_lng: position.coords.longitude,
        });
        if (cancelled || !data) return;
        if (Number(data.distance_m) > onCampusMetres) return;
        setNearestId(String(data.node_id));
      } catch {
        // Location is a hint. The list still works without it.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [nodes.length]);

  const needle = searchNeedle(query).toLowerCase();
  const shown = useMemo(() => {
    if (!needle) return nodes;
    return nodes.filter((node) =>
      `${node.name} ${node.buildingName ?? ''} ${node.floorName ?? ''} ${node.type}`.toLowerCase().includes(needle),
    );
  }, [needle, nodes]);
  const nearest = shown.find((node) => node.id === nearestId) ?? null;

  async function choose(node: StartNode) {
    setBusy(true);
    setError(null);
    try {
      await setStartNode(node);
      if (!toId) {
        router.back();
        return;
      }
      if (node.floorLevel != null) {
        const route = await fetchRoute(node.id, toId);
        setRoute(route);
        router.replace({ pathname: '/guide', params: { to: toId } });
        return;
      }
      const destination = await loadNode(toId);
      if (destination?.floorLevel != null && destination.buildingId) {
        const entrance = await loadEntrance(destination.buildingId);
        if (entrance && node.id === entrance.id) {
          const route = await fetchRoute(entrance.id, toId);
          setRoute(route);
          router.replace({ pathname: '/guide', params: { to: toId } });
          return;
        }
      }
      router.replace({ pathname: '/route', params: { to: toId, from: node.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That start could not be used.');
    } finally {
      setBusy(false);
    }
  }

  async function useLocation() {
    setError(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setError('Location is off. Pick the entrance, lift, or room number instead.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { data, error: rpcError } = await supabase.rpc('nearest_start_node', {
      p_lat: position.coords.latitude,
      p_lng: position.coords.longitude,
    });
    if (rpcError || !data) {
      setError(rpcError?.message || 'No entrance was close enough to use.');
      return;
    }
    const distance = Number(data.distance_m);
    if (distance > onCampusMetres) {
      setError(`You are about ${Math.round(distance)} metres from the nearest mapped entrance, so this does not look like KNUST.`);
      return;
    }
    setNearestId(String(data.node_id));
    const match = nodes.find((node) => node.id === data.node_id);
    if (!match) {
      setError('The nearest entrance is not in the list yet.');
      return;
    }
    await choose(match);
  }

  return (
    <Screen scroll>
      <AppText size={typeScale.body} color={colors.muted}>
        Pick the entrance, lift lobby, or the room number on the door next to you. TekPath uses that as your start.
      </AppText>
      <Field
        label="Where are you?"
        value={query}
        onChangeText={setQuery}
        placeholder="Type the room number on the door next to you"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button label="Use my location" variant="secondary" icon="locate" onPress={useLocation} disabled={busy} />
      {loading ? (
        <View style={{ gap: 8 }}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : null}
      {error ? (
        <View style={{ gap: 8 }}>
          <Notice tone="bad">{error}</Notice>
          <Button label="Try again" icon="refresh" onPress={() => setAttempt((value) => value + 1)} />
        </View>
      ) : null}
      {nearest && !needle ? (
        <View style={{ gap: 8 }}>
          <AppText weight="700" accessibilityRole="header">
            Nearest entrance
          </AppText>
          <ListRow
            icon="locate"
            title={nearest.name}
            subtitle={placeLine(nearest)}
            accessibilityLabel={`Nearest entrance, ${nearest.name}`}
            onPress={() => choose(nearest)}
          />
        </View>
      ) : null}
      {sections.map((section) => {
        const rows = shown.filter((node) => startBucket(node) === section.id && node.id !== (needle ? '' : nearest?.id));
        if (!rows.length) return null;
        return (
          <View key={section.id} style={{ gap: 8 }}>
            <AppText weight="700" accessibilityRole="header">
              {section.title}
            </AppText>
            {rows.map((node) => (
              <ListRow
                key={node.id}
                icon={section.icon}
                title={node.name}
                subtitle={placeLine(node)}
                accessibilityLabel={`I am at ${node.name}`}
                onPress={() => choose(node)}
              />
            ))}
          </View>
        );
      })}
      {!loading && needle && shown.length === 0 ? (
        <Notice>Nothing matches that. Try the number on the door, such as 201.</Notice>
      ) : null}
      <Button
        label="Scan a QR code instead"
        variant="ghost"
        icon="qr-code"
        onPress={() => router.push({ pathname: '/scan', params: { to: toId } })}
      />
    </Screen>
  );
}
