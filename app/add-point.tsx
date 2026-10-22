import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CampusMap } from '@/components/CampusMap';
import { AppText, Button, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/Theme';
import { campus, type as typeScale } from '@/lib/theme';
import type { FeatureStatus } from '@/lib/types';

const kinds = ['ramp', 'lift', 'toilet', 'parking', 'entrance'] as const;

export default function AddPointScreen() {
  const { session } = useAppState();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<(typeof kinds)[number]>('ramp');
  const [status, setStatus] = useState<FeatureStatus>('unknown');
  const [note, setNote] = useState('');
  const [latitude, setLatitude] = useState(String(campus.latitude));
  const [longitude, setLongitude] = useState(String(campus.longitude));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!session) {
      router.push({ pathname: '/login', params: { next: '/add-point' } });
      return;
    }
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!name.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
      setError('Add a name and a real latitude and longitude.');
      return;
    }
    setBusy(true);
    setError(null);
    const nodeType = kind === 'toilet' ? 'toilet' : kind === 'parking' ? 'outdoor' : kind === 'lift' ? 'lift' : kind === 'entrance' ? 'entrance' : 'ramp';
    const qr = `TP-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: node, error: nodeError } = await supabase
      .from('nodes')
      .insert({
        type: nodeType,
        name: name.trim(),
        landmark_description: note.trim() || null,
        latitude: lat,
        longitude: lng,
        step_free: true,
        qr_code: qr,
      })
      .select('id')
      .single();
    if (nodeError || !node) {
      setBusy(false);
      setError(nodeError?.message || 'Could not save the point.');
      return;
    }
    const { data: feature, error: featureError } = await supabase
      .from('features')
      .insert({
        node_id: node.id,
        kind,
        name: name.trim(),
        status,
        latitude: lat,
        longitude: lng,
      })
      .select('id')
      .single();
    if (featureError || !feature) {
      setBusy(false);
      setError(featureError?.message || 'The place was saved but the accessibility point was not.');
      return;
    }
    const { error: linkError } = await supabase.from('nodes').update({ feature_id: feature.id }).eq('id', node.id);
    setBusy(false);
    if (linkError) {
      setError(linkError.message);
      return;
    }
    router.replace(`/feature/${feature.id}`);
  }

  return (
    <Screen scroll>
      <AppText>Move the map, then use the centre coordinates, or type a pin. This writes a real point and a route node.</AppText>
      <View style={{ height: 260 }}>
        <CampusMap features={[]} onSelect={() => undefined} onCenter={(lat, lng) => {
          setLatitude(lat.toFixed(6));
          setLongitude(lng.toFixed(6));
        }} />
      </View>
      <Field label="Name" value={name} onChangeText={setName} placeholder="College library ramp" />
      <AppText weight="700">Kind</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {kinds.map((value) => (
          <Button key={value} label={value} variant={kind === value ? 'primary' : 'secondary'} onPress={() => setKind(value)} />
        ))}
      </View>
      <AppText weight="700">Status you see right now</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['working', 'broken', 'unknown'] as FeatureStatus[]).map((value) => (
          <Button key={value} label={value} variant={status === value ? 'primary' : 'secondary'} onPress={() => setStatus(value)} />
        ))}
      </View>
      <Field label="Landmark note" value={note} onChangeText={setNote} placeholder="Beside the south doors" />
      <Field label="Latitude" value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" />
      <Field label="Longitude" value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" />
      <AppText size={typeScale.label} color={colors.muted}>Use the map centre above, or type coordinates. Label them approximate unless you surveyed them.</AppText>
      <Button label={busy ? 'Saving…' : session ? 'Save point' : 'Sign in to save'} onPress={save} disabled={busy} />
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Screen>
  );
}
