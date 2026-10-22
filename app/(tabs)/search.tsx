import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, EmptyState, Field, ListRow, Notice, Screen, Skeleton } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { nodeSelect, toStartNode } from '@/lib/nodes';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { type as typeScale } from '@/lib/theme';

type BuildingHit = { id: string; name: string; code: string; description: string | null };
type RoomHit = {
  id: string;
  name: string;
  type: string;
  qr_code: string | null;
  buildings: { name: string } | { name: string }[] | null;
  floors: { name: string; level: number } | { name: string; level: number }[] | null;
};

function clean(value: string) {
  return value.replace(/[%_,]/g, '').trim();
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const { startNode } = useAppState();
  const [query, setQuery] = useState('');
  const [buildings, setBuildings] = useState<BuildingHit[]>([]);
  const [rooms, setRooms] = useState<RoomHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (supabaseConfigError) return;
    const q = clean(query);
    if (q.length < 1) {
      setBuildings([]);
      setRooms([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      const [buildingResult, roomResult] = await Promise.all([
        supabase.from('buildings').select('id,name,code,description').or(`name.ilike.%${q}%,code.ilike.%${q}%`).limit(12),
        supabase
          .from('nodes')
          .select('id,name,type,qr_code,buildings(name),floors(name,level)')
          .or(`name.ilike.%${q}%,qr_code.ilike.%${q}%`)
          .limit(20),
      ]);
      if (buildingResult.error || roomResult.error) {
        setError(buildingResult.error?.message || roomResult.error?.message || 'Search failed');
      } else {
        setError(null);
        setBuildings((buildingResult.data ?? []) as BuildingHit[]);
        setRooms((roomResult.data ?? []) as RoomHit[]);
      }
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function go(nodeId: string) {
    if (startNode) router.push({ pathname: '/route', params: { to: nodeId, from: startNode.id } });
    else router.push({ pathname: '/pick-start', params: { to: nodeId } });
  }

  async function routeToBuilding(buildingId: string) {
    const { data, error: queryError } = await supabase
      .from('nodes')
      .select(nodeSelect)
      .eq('building_id', buildingId)
      .in('type', ['ramp', 'entrance', 'outdoor'])
      .limit(1);
    if (queryError || !data?.[0]) {
      setError(queryError?.message || 'This building has no entrance on the route graph yet.');
      return;
    }
    go(toStartNode(data[0]).id);
  }

  return (
    <Screen scroll>
      {supabaseConfigError ? <Notice tone="bad">{supabaseConfigError}</Notice> : null}
      <AppText size={typeScale.body} color={colors.muted}>
        Search buildings and rooms, then get a step-free route from {startNode ? startNode.name : 'a start you choose'}.
      </AppText>
      <Field
        label="Search"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Try 201, library, or ELB"
        accessibilityRole="search"
      />
      {loading ? (
        <View style={{ gap: 8 }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!loading && clean(query).length > 0 && buildings.length === 0 && rooms.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nothing matched"
          body="The pilot rooms are Lecture Theatre 001, 101, 102, and 201."
        />
      ) : null}
      {buildings.length > 0 ? (
        <AppText weight="700" accessibilityRole="header">
          Buildings
        </AppText>
      ) : null}
      {buildings.map((building) => (
        <ListRow
          key={building.id}
          icon="business"
          title={building.name}
          subtitle={`${building.code}. ${building.description ?? ''}`}
          accessibilityLabel={`Route to ${building.name}`}
          onPress={() => routeToBuilding(building.id)}
        />
      ))}
      {rooms.length > 0 ? (
        <AppText weight="700" accessibilityRole="header">
          Places
        </AppText>
      ) : null}
      {rooms.map((room) => {
        const building = Array.isArray(room.buildings) ? room.buildings[0] : room.buildings;
        const floor = Array.isArray(room.floors) ? room.floors[0] : room.floors;
        const where = [building?.name, floor?.name].filter(Boolean).join(' · ');
        return (
          <ListRow
            key={room.id}
            icon="location"
            title={room.name}
            subtitle={`${where || room.type}${room.qr_code ? ` · ${room.qr_code}` : ''}`}
            accessibilityLabel={`Route to ${room.name}`}
            onPress={() => go(room.id)}
          />
        );
      })}
    </Screen>
  );
}
