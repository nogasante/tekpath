import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, EmptyState, Field, Notice, Screen, Skeleton } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { footprintCaption } from '@/lib/footprint';
import { floorSpoken, roomNumber, searchNeedle } from '@/lib/indoor';
import { one } from '@/lib/types';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { type as typeScale } from '@/lib/theme';

type BuildingHit = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  area_m2?: number | null;
  perimeter_m?: number | null;
};
type RoomHit = {
  id: string;
  name: string;
  type: string;
  building_id: string | null;
  buildings: { name: string } | { name: string }[] | null;
  floors: { name: string; level: number } | { name: string; level: number }[] | null;
};

async function buildingSearch(q: string) {
  const columns = 'id,name,code,description,area_m2,perimeter_m';
  const rich = await supabase.from('buildings').select(columns).or(`name.ilike.%${q}%,code.ilike.%${q}%`).limit(8);
  if (!rich.error) return rich;
  if (!/area_m2|perimeter_m/.test(rich.error.message)) return rich;
  return supabase.from('buildings').select('id,name,code,description').or(`name.ilike.%${q}%,code.ilike.%${q}%`).limit(8);
}

function where(room: RoomHit) {
  const building = one(room.buildings);
  const floor = one(room.floors);
  const roomNo = roomNumber(room.name);
  return [building?.name, floor ? floorSpoken(floor.level, floor.name) : null, roomNo ? `Room ${roomNo}` : null].filter(Boolean).join(' · ');
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [buildings, setBuildings] = useState<BuildingHit[]>([]);
  const [rooms, setRooms] = useState<RoomHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (supabaseConfigError) return;
    const q = searchNeedle(query);
    if (q.length < 1) {
      setBuildings([]);
      setRooms([]);
      setLoading(false);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      const [buildingResult, roomResult] = await Promise.all([
        buildingSearch(q),
        supabase
          .from('nodes')
          .select('id,name,type,building_id,buildings(name),floors(name,level)')
          .or(`name.ilike.%${q}%,qr_code.ilike.%${q}%`)
          .limit(20),
      ]);
      if (buildingResult.error || roomResult.error) {
        setError(buildingResult.error?.message || roomResult.error?.message || 'Search failed');
        setBuildings([]);
        setRooms([]);
      } else {
        setError(null);
        setBuildings((buildingResult.data ?? []) as BuildingHit[]);
        setRooms((roomResult.data ?? []) as RoomHit[]);
      }
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [attempt, query]);

  function directions(nodeId: string) {
    router.push({ pathname: '/route', params: { to: nodeId } });
  }

  async function openBuilding(building: BuildingHit) {
    setError(null);
    const { data, error: queryError } = await supabase
      .from('nodes')
      .select('id,name,type,building_id,buildings(name),floors(name,level)')
      .eq('building_id', building.id)
      .eq('type', 'room')
      .order('name')
      .limit(20);
    if (queryError) {
      setError(queryError.message);
      return;
    }
    if (data?.length) {
      setRooms(data as RoomHit[]);
      setBuildings([]);
      return;
    }
    const entrance = await supabase
      .from('nodes')
      .select('id')
      .eq('building_id', building.id)
      .in('type', ['ramp', 'entrance', 'outdoor'])
      .limit(1)
      .maybeSingle();
    if (entrance.error || !entrance.data) {
      setError(entrance.error?.message || 'This building has no step-free entrance yet.');
      return;
    }
    directions(entrance.data.id);
  }

  const needle = searchNeedle(query);

  return (
    <Screen scroll edges={['left', 'right']}>
      {supabaseConfigError ? <Notice tone="bad">{supabaseConfigError}</Notice> : null}
      <AppText size={typeScale.body} color={colors.muted}>
        Search a room number or a building. Indoor directions start at the step-free entrance, then continue inside.
      </AppText>
      <Field
        label="Search"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Room 201 or Lecture Theatre 201"
        accessibilityRole="search"
      />
      {loading ? (
        <View style={{ gap: 8 }}>
          <Skeleton height={88} />
          <Skeleton height={88} />
        </View>
      ) : null}
      {error ? (
        <View style={{ gap: 8 }}>
          <Notice tone="bad">{error}</Notice>
          <Button label="Try again" icon="refresh" onPress={() => setAttempt((value) => value + 1)} />
        </View>
      ) : null}
      {!loading && needle.length > 0 && buildings.length === 0 && rooms.length === 0 && !error ? (
        <EmptyState icon="search" title="Nothing matched" body="Try a room number such as 201, or the building name." />
      ) : null}
      {buildings.length > 0 ? (
        <AppText weight="700" accessibilityRole="header">
          Buildings
        </AppText>
      ) : null}
      {buildings.map((building) => (
        <Card key={building.id}>
          <AppText weight="700">{building.name}</AppText>
          <AppText size={typeScale.label} color={colors.muted}>
            {building.code}
            {building.description ? `. ${building.description}` : ''}
          </AppText>
          {footprintCaption(building.area_m2, building.perimeter_m) ? (
            <AppText size={typeScale.label} color={colors.primary}>
              {footprintCaption(building.area_m2, building.perimeter_m)}
            </AppText>
          ) : null}
          <Button label="Show rooms" variant="secondary" onPress={() => openBuilding(building)} />
        </Card>
      ))}
      {rooms.length > 0 ? (
        <AppText weight="700" accessibilityRole="header">
          Places
        </AppText>
      ) : null}
      {rooms.map((room) => (
        <Card key={room.id}>
          <AppText weight="700">{room.name}</AppText>
          <AppText size={typeScale.label} color={colors.muted}>
            {where(room) || room.type}
          </AppText>
          <Button label="Get step-free directions" icon="navigate" haptic="light" onPress={() => directions(room.id)} />
        </Card>
      ))}
    </Screen>
  );
}
