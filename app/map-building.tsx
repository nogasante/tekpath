import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { supabase } from '@/lib/supabase';
import { campus } from '@/lib/theme';

type Building = { id: string; name: string; code: string; latitude: number; longitude: number };
type Floor = { id: string; name: string; level: number };
type Node = { id: string; name: string; type: string };

const nodeTypes = ['entrance', 'ramp', 'lift', 'corridor', 'room', 'toilet', 'junction', 'outdoor'] as const;
const edgeTypes = ['corridor', 'ramp', 'lift', 'stairs', 'path'] as const;

export default function MapBuildingScreen() {
  const { session } = useAppState();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [bName, setBName] = useState('');
  const [bCode, setBCode] = useState('');
  const [bDesc, setBDesc] = useState('');
  const [bLat, setBLat] = useState(String(campus.latitude));
  const [bLng, setBLng] = useState(String(campus.longitude));

  const [fLevel, setFLevel] = useState('0');
  const [fName, setFName] = useState('Ground');
  const [fHeight, setFHeight] = useState('3.5');
  const [fHpa, setFHpa] = useState('0.12');

  const [nName, setNName] = useState('');
  const [nType, setNType] = useState<(typeof nodeTypes)[number]>('room');
  const [nFloor, setNFloor] = useState<string | null>(null);
  const [nLandmark, setNLandmark] = useState('');

  const [eFrom, setEFrom] = useState<string | null>(null);
  const [eTo, setETo] = useState<string | null>(null);
  const [eType, setEType] = useState<(typeof edgeTypes)[number]>('corridor');
  const [eLength, setELength] = useState('8');
  const [eText, setEText] = useState('');
  const [eReverse, setEReverse] = useState('');

  async function refresh(nextBuilding = buildingId) {
    const { data } = await supabase.from('buildings').select('id,name,code,latitude,longitude').order('name');
    setBuildings((data ?? []) as Building[]);
    if (!nextBuilding) return;
    const [floorResult, nodeResult] = await Promise.all([
      supabase.from('floors').select('id,name,level').eq('building_id', nextBuilding).order('level'),
      supabase.from('nodes').select('id,name,type').eq('building_id', nextBuilding).order('name'),
    ]);
    setFloors((floorResult.data ?? []) as Floor[]);
    setNodes((nodeResult.data ?? []) as Node[]);
  }

  useEffect(() => {
    refresh(null);
  }, []);

  function requireAuth() {
    if (session) return true;
    router.push({ pathname: '/login', params: { next: '/map-building' } });
    return false;
  }

  async function addBuilding() {
    if (!requireAuth()) return;
    setError(null);
    const { data, error: insertError } = await supabase
      .from('buildings')
      .insert({
        name: bName.trim(),
        code: bCode.trim().toUpperCase(),
        description: bDesc.trim() || 'Added in TekPath.',
        latitude: Number(bLat),
        longitude: Number(bLng),
      })
      .select('id')
      .single();
    if (insertError || !data) {
      setError(insertError?.message || 'Could not add the building.');
      return;
    }
    setBuildingId(data.id);
    setMessage(`Saved ${bName.trim()}. Add a floor next.`);
    setBName('');
    setBCode('');
    await refresh(data.id);
  }

  async function addFloor() {
    if (!requireAuth() || !buildingId) {
      setError('Choose a building first.');
      return;
    }
    const { error: insertError } = await supabase.from('floors').insert({
      building_id: buildingId,
      level: Number(fLevel),
      name: fName.trim(),
      floor_height_m: Number(fHeight),
      pressure_hpa_per_m: Number(fHpa),
    });
    if (insertError) setError(insertError.message);
    else {
      setMessage(`Saved floor ${fName.trim()}.`);
      await refresh(buildingId);
    }
  }

  async function addNode() {
    if (!requireAuth() || !buildingId) return;
    const building = buildings.find((item) => item.id === buildingId);
    const qr = `TP-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: insertError } = await supabase.from('nodes').insert({
      building_id: buildingId,
      floor_id: nFloor,
      type: nType,
      name: nName.trim(),
      landmark_description: nLandmark.trim() || null,
      latitude: building?.latitude ?? campus.latitude,
      longitude: building?.longitude ?? campus.longitude,
      qr_code: qr,
      step_free: true,
    });
    if (insertError) setError(insertError.message);
    else {
      setMessage(`Saved ${nName.trim()}. QR code ${qr}.`);
      setNName('');
      await refresh(buildingId);
    }
  }

  async function addEdge() {
    if (!requireAuth() || !eFrom || !eTo) {
      setError('Choose both ends of the edge.');
      return;
    }
    const { error: insertError } = await supabase.from('edges').insert({
      from_node: eFrom,
      to_node: eTo,
      type: eType,
      step_free: eType !== 'stairs',
      length_m: Number(eLength),
      instruction_text: eText.trim() || `Continue to the next landmark.`,
      reverse_instruction_text: eReverse.trim() || null,
      bidirectional: true,
    });
    if (insertError) setError(insertError.message);
    else setMessage('Edge saved. The router can use it on the next search.');
  }

  return (
    <Screen scroll>
      <AppText>This writes floors, nodes, and edges into the same graph the router uses. Seeded buildings stay unless you created them.</AppText>
      {!session ? <Button label="Sign in to map" onPress={() => router.push({ pathname: '/login', params: { next: '/map-building' } })} /> : null}
      {message ? <Notice tone="good">{message}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}

      <AppText weight="700" size={22}>1. Building</AppText>
      <Field label="Building name" value={bName} onChangeText={setBName} />
      <Field label="Short code" value={bCode} onChangeText={setBCode} autoCapitalize="characters" placeholder="ELB" />
      <Field label="Description" value={bDesc} onChangeText={setBDesc} />
      <Field label="Latitude" value={bLat} onChangeText={setBLat} />
      <Field label="Longitude" value={bLng} onChangeText={setBLng} />
      <Button label="Save building" onPress={addBuilding} disabled={!bName.trim() || !bCode.trim()} />

      <AppText weight="700">Or continue an existing building</AppText>
      <View style={{ gap: 8 }}>
        {buildings.map((building) => (
          <Button
            key={building.id}
            label={`${building.code} · ${building.name}`}
            variant={buildingId === building.id ? 'primary' : 'secondary'}
            onPress={() => {
              setBuildingId(building.id);
              refresh(building.id);
            }}
          />
        ))}
      </View>

      <AppText weight="700" size={22}>2. Floor</AppText>
      <Field label="Level number" value={fLevel} onChangeText={setFLevel} keyboardType="number-pad" />
      <Field label="Floor name" value={fName} onChangeText={setFName} />
      <Field label="Floor height in metres" value={fHeight} onChangeText={setFHeight} />
      <Field label="hPa per metre" value={fHpa} onChangeText={setFHpa} />
      <Button label="Save floor" onPress={addFloor} disabled={!buildingId} />
      {floors.map((floor) => (
        <Button key={floor.id} label={`${floor.name} (level ${floor.level})`} variant={nFloor === floor.id ? 'primary' : 'secondary'} onPress={() => setNFloor(floor.id)} />
      ))}

      <AppText weight="700" size={22}>3. Node</AppText>
      <Field label="Node name" value={nName} onChangeText={setNName} />
      <Field label="Landmark description" value={nLandmark} onChangeText={setNLandmark} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {nodeTypes.map((type) => (
          <Button key={type} label={type} variant={nType === type ? 'primary' : 'secondary'} onPress={() => setNType(type)} />
        ))}
      </View>
      <Button label="Save node" onPress={addNode} disabled={!buildingId || !nName.trim()} />

      <AppText weight="700" size={22}>4. Edge</AppText>
      <AppText>From</AppText>
      {nodes.map((node) => (
        <Button key={`from-${node.id}`} label={node.name} variant={eFrom === node.id ? 'primary' : 'secondary'} onPress={() => setEFrom(node.id)} />
      ))}
      <AppText>To</AppText>
      {nodes.map((node) => (
        <Button key={`to-${node.id}`} label={node.name} variant={eTo === node.id ? 'primary' : 'secondary'} onPress={() => setETo(node.id)} />
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {edgeTypes.map((type) => (
          <Button key={type} label={type} variant={eType === type ? 'primary' : 'secondary'} onPress={() => setEType(type)} />
        ))}
      </View>
      <Field label="Length in metres" value={eLength} onChangeText={setELength} />
      <Field label="Instruction that way" value={eText} onChangeText={setEText} placeholder="Lift A is on your left." />
      <Field label="Instruction coming back" value={eReverse} onChangeText={setEReverse} />
      <Button label="Save edge" onPress={addEdge} />
    </Screen>
  );
}
