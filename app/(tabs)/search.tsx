import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Button, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { nodeSelect, toStartNode } from '@/lib/nodes';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { colors } from '@/lib/theme';

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
      <AppText size={16} color={colors.muted}>
        Search buildings and rooms, then get a step-free route from {startNode ? startNode.name : 'a start you choose'}.
      </AppText>
      <Field label="Search" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Try 201, library, or ELB" />
      {loading ? <AppText>Searching…</AppText> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!loading && clean(query).length > 0 && buildings.length === 0 && rooms.length === 0 ? (
        <AppText>Nothing matched. The pilot rooms are Lecture Theatre 001, 101, 102, and 201.</AppText>
      ) : null}
      {buildings.length > 0 ? <AppText weight="700">Buildings</AppText> : null}
      {buildings.map((building) => (
        <View key={building.id} style={{ gap: 8, padding: 12, borderWidth: 2, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.card }}>
          <AppText weight="700">{building.name}</AppText>
          <AppText size={15} color={colors.muted}>{building.code}. {building.description}</AppText>
          <Button label={`Route to ${building.code}`} variant="secondary" onPress={() => routeToBuilding(building.id)} />
        </View>
      ))}
      {rooms.length > 0 ? <AppText weight="700">Places</AppText> : null}
      {rooms.map((room) => {
        const building = Array.isArray(room.buildings) ? room.buildings[0] : room.buildings;
        const floor = Array.isArray(room.floors) ? room.floors[0] : room.floors;
        const where = [building?.name, floor?.name].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={room.id}
            accessibilityRole="button"
            accessibilityLabel={`Route to ${room.name}`}
            onPress={() => go(room.id)}
            style={{ minHeight: 64, padding: 12, borderWidth: 2, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.card }}>
            <AppText weight="700">{room.name}</AppText>
            <AppText size={15} color={colors.muted}>{where || room.type}{room.qr_code ? ` · ${room.qr_code}` : ''}</AppText>
          </Pressable>
        );
      })}
    </Screen>
  );
}
