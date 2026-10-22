import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppText, Button, Notice, Screen } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { radii, type as typeScale } from '@/lib/theme';

type Row = { id: string; name: string; qr_code: string; type: string; buildings: { name: string } | { name: string }[] | null };

export default function QrScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    if (supabaseConfigError) return;
    supabase
      .from('nodes')
      .select('id,name,qr_code,type,buildings(name)')
      .not('qr_code', 'is', null)
      .order('qr_code')
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else setRows((data ?? []) as Row[]);
      });
  }, []);

  return (
    <Screen scroll>
      <AppText>
        Stick one code at each landmark. Scanning it sets the student's exact start. You can also run <AppText weight="700">npm run qr</AppText> to write an HTML sheet.
      </AppText>
      {Platform.OS === 'web' ? (
        <Button
          label="Print this page"
          icon="print"
          onPress={() => {
            const print = (globalThis as { print?: () => void }).print;
            print?.();
          }}
        />
      ) : null}
      {supabaseConfigError ? <Notice tone="bad">{supabaseConfigError}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {rows.map((row) => {
          const building = Array.isArray(row.buildings) ? row.buildings[0] : row.buildings;
          return (
            <View
              key={row.id}
              style={{ width: 220, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: '#fff', alignItems: 'center', gap: 8 }}>
              <QRCode value={row.qr_code} size={160} />
              <AppText weight="700" style={{ textAlign: 'center' }}>{row.name}</AppText>
              <AppText size={typeScale.label} style={{ textAlign: 'center' }}>{building?.name || 'Campus'}</AppText>
              <AppText accessibilityLabel={`QR code for ${row.name}, value ${row.qr_code}`} size={16} weight="700">
                {row.qr_code}
              </AppText>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
