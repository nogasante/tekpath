import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import { AppText, Button, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { nodeSelect, toStartNode } from '@/lib/nodes';
import { supabase } from '@/lib/supabase';
import { colors, onCampusMetres } from '@/lib/theme';
import type { StartNode } from '@/lib/types';

export default function PickStartScreen() {
  const params = useLocalSearchParams<{ to?: string }>();
  const toId = typeof params.to === 'string' ? params.to : undefined;
  const { setStartNode } = useAppState();
  const [nodes, setNodes] = useState<StartNode[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('nodes')
      .select(nodeSelect)
      .order('name')
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else setNodes((data ?? []).map((row) => toStartNode(row)));
        setLoading(false);
      });
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((node) =>
      `${node.name} ${node.buildingName ?? ''} ${node.qrCode ?? ''} ${node.floorName ?? ''}`.toLowerCase().includes(q),
    );
  }, [nodes, query]);

  async function choose(node: StartNode) {
    await setStartNode(node);
    if (toId) router.replace({ pathname: '/route', params: { to: toId, from: node.id } });
    else router.back();
  }

  async function useLocation() {
    setError(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setError('Location permission was denied. Pick a checkpoint from the list instead.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { data, error: rpcError } = await supabase.rpc('nearest_start_node', {
      p_lat: position.coords.latitude,
      p_lng: position.coords.longitude,
    });
    if (rpcError || !data) {
      setError(rpcError?.message || 'No outdoor start point was found.');
      return;
    }
    const distance = Number(data.distance_m);
    if (distance > onCampusMetres) {
      setError(`You are about ${Math.round(distance)} metres from the nearest mapped point, so this does not look like KNUST. Pick a start from the list.`);
      return;
    }
    const match = nodes.find((node) => node.id === data.node_id);
    if (!match) {
      setError('The nearest point is not in the loaded list yet.');
      return;
    }
    await choose(match);
  }

  return (
    <Screen scroll>
      <AppText size={16} color={colors.muted}>
        GPS is a hint outdoors. Indoors, scan the QR code at a door or lift, or pick the place from this list.
      </AppText>
      <Button label="Scan a QR checkpoint" icon="qr-code" onPress={() => router.push({ pathname: '/scan', params: { to: toId } })} />
      <Button label="Use my location if I'm on campus" variant="secondary" icon="locate" onPress={useLocation} />
      <Field label="Filter places" value={query} onChangeText={setQuery} placeholder="Forecourt, Lift A, library" />
      {loading ? <AppText>Loading places…</AppText> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {shown.map((node) => (
        <Pressable
          key={node.id}
          accessibilityRole="button"
          accessibilityLabel={`I am at ${node.name}`}
          onPress={() => choose(node)}
          style={{ minHeight: 64, padding: 12, borderWidth: 2, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.card }}>
          <AppText weight="700">{node.name}</AppText>
          <AppText size={15} color={colors.muted}>
            {[node.buildingName, node.floorName, node.qrCode].filter(Boolean).join(' · ')}
          </AppText>
        </Pressable>
      ))}
    </Screen>
  );
}
