import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { nodeSelect, qrFromScan, toStartNode } from '@/lib/nodes';
import { supabase } from '@/lib/supabase';

export default function ScanScreen() {
  const params = useLocalSearchParams<{ to?: string }>();
  const toId = typeof params.to === 'string' ? params.to : undefined;
  const { setStartNode } = useAppState();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  async function lookup(raw: string) {
    const code = qrFromScan(raw);
    setError(null);
    const { data, error: queryError } = await supabase.from('nodes').select(nodeSelect).eq('qr_code', code).maybeSingle();
    if (queryError) {
      setError(queryError.message);
      setLocked(false);
      return;
    }
    if (!data) {
      setError(`No checkpoint matches ${code}. Printed codes look like ELB-RAMP-G.`);
      setLocked(false);
      return;
    }
    const node = toStartNode(data);
    await setStartNode(node);
    if (toId) router.replace({ pathname: '/route', params: { to: toId, from: node.id } });
    else router.replace('/');
  }

  return (
    <Screen scroll>
      <AppText>
        Point the camera at a TekPath QR code on a door or lift. The code sets your exact start and, indoors, calibrates the floor for the barometer.
      </AppText>
      {permission?.granted ? (
        <View style={{ height: 280, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#102017' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={locked ? undefined : (event) => {
              setLocked(true);
              lookup(event.data);
            }}
          />
        </View>
      ) : (
        <Notice>
          {permission == null
            ? 'Checking the camera…'
            : 'Camera permission is off. Type the code printed under the QR instead.'}
        </Notice>
      )}
      {permission && !permission.granted ? (
        <Button label="Allow the camera" onPress={requestPermission} />
      ) : null}
      <Field label="Or type the checkpoint code" value={manual} onChangeText={setManual} autoCapitalize="characters" placeholder="ELB-RAMP-G" />
      <Button label="Use this code" onPress={() => lookup(manual)} disabled={!manual.trim()} />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {locked && !error ? <AppText>Checking that code…</AppText> : null}
    </Screen>
  );
}
