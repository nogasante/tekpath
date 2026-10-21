import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Button, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

const scales = [
  { value: 1, label: 'Default text' },
  { value: 1.25, label: 'Large text' },
  { value: 1.5, label: 'Larger text' },
];

export default function AccountScreen() {
  const { session, textScale, setTextScale, startNode, floor, setStartNode } = useAppState();
  const [displayName, setDisplayName] = useState('');
  const [mobility, setMobility] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('display_name,mobility_needs')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        setDisplayName(data?.display_name ?? '');
        setMobility(data?.mobility_needs ?? '');
      });
  }, [session]);

  async function save() {
    if (!session) return;
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), mobility_needs: mobility.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (updateError) setError(updateError.message);
    else setMessage('Profile saved.');
  }

  return (
    <Screen scroll>
      <AppText weight="700" size={22}>Text size</AppText>
      <AppText size={16} color={colors.muted}>This is in addition to your phone's system text size.</AppText>
      <View style={{ gap: 8 }}>
        {scales.map((scale) => {
          const active = textScale === scale.value;
          return (
            <Pressable
              key={scale.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={scale.label}
              onPress={() => setTextScale(scale.value)}
              style={{
                minHeight: 52,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: colors.ink,
                backgroundColor: active ? colors.ink : colors.card,
              }}>
              <AppText weight="700" color={active ? '#fff' : colors.ink}>{scale.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText weight="700" size={22}>Where TekPath thinks you are</AppText>
      <AppText>{startNode ? startNode.name : 'No start point yet.'}</AppText>
      <AppText size={16} color={colors.muted}>
        {floor.source === 'barometer'
          ? `Barometer floor: ${floor.label}${floor.pressure != null ? ` (${floor.pressure.toFixed(1)} hPa)` : ''}.`
          : floor.source === 'none'
            ? `No barometer reading. Floor is ${floor.label} until you correct it on the guidance screen.`
            : 'Outdoor start, or no floor calibrated yet.'}
      </AppText>
      <Button label="Pick where I am" variant="secondary" onPress={() => router.push('/pick-start')} />
      {startNode ? <Button label="Clear start point" variant="secondary" onPress={() => setStartNode(null)} /> : null}
      {session ? (
        <>
          <AppText weight="700" size={22}>Profile</AppText>
          <AppText size={16}>{session.user.email}</AppText>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
          <Field
            label="Mobility needs"
            value={mobility}
            onChangeText={setMobility}
            multiline
            placeholder="Optional. Visible with your profile."
          />
          <Button label="Save profile" onPress={save} />
          <Button
            label="Sign out"
            variant="secondary"
            onPress={async () => {
              await supabase.auth.signOut();
              setMessage('Signed out.');
            }}
          />
        </>
      ) : (
        <Button label="Sign in" icon="log-in" onPress={() => router.push('/login')} />
      )}
      {message ? <Notice tone="good">{message}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Button label="Print QR checkpoints" variant="secondary" onPress={() => router.push('/qr')} />
    </Screen>
  );
}
