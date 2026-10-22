import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Button, Card, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { useToast } from '@/context/Toast';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { radii, spacing, type as typeScale } from '@/lib/theme';
import { WELCOME_KEY } from '@/lib/welcome';

const scales = [
  { value: 1, label: 'Default text' },
  { value: 1.25, label: 'Large text' },
  { value: 1.5, label: 'Larger text' },
];

export default function AccountScreen() {
  const { colors } = useTheme();
  const { session, textScale, setTextScale, startNode, floor, setStartNode } = useAppState();
  const toast = useToast();
  const [displayName, setDisplayName] = useState('');
  const [mobility, setMobility] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([
      supabase.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle(),
      supabase.from('profile_private').select('mobility_needs').eq('id', session.user.id).maybeSingle(),
    ]).then(([profileResult, privateResult]) => {
      if (cancelled) return;
      if (profileResult.error) setError(profileResult.error.message);
      if (privateResult.error) setError(privateResult.error.message);
      setDisplayName(profileResult.data?.display_name ?? '');
      setMobility(privateResult.data?.mobility_needs ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function save() {
    if (!session) return;
    setError(null);
    const updatedAt = new Date().toISOString();
    const [profileResult, privateResult] = await Promise.all([
      supabase.from('profiles').update({ display_name: displayName.trim(), updated_at: updatedAt }).eq('id', session.user.id),
      supabase.from('profile_private').upsert({
        id: session.user.id,
        mobility_needs: mobility.trim() || null,
        updated_at: updatedAt,
      }),
    ]);
    if (profileResult.error || privateResult.error) {
      const text = profileResult.error?.message || privateResult.error?.message || 'Could not save the profile.';
      setError(text);
      toast.show('The profile did not save.', 'bad');
      void haptic('warning');
    } else {
      setMessage('Profile saved. Mobility needs stay private to this account.');
      toast.show('Profile saved.');
      void haptic('success');
    }
  }

  return (
    <Screen scroll>
      <Card>
        <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
          Text size
        </AppText>
        <AppText size={typeScale.label} color={colors.muted}>
          This is in addition to your phone's system text size.
        </AppText>
        <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
          {scales.map((scale) => {
            const active = textScale === scale.value;
            return (
              <Pressable
                key={scale.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={scale.label}
                onPress={() => {
                  setTextScale(scale.value);
                  void haptic('selection');
                }}
                style={({ pressed }) => ({
                  minHeight: 52,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: radii.md,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.primary : colors.line,
                  backgroundColor: active ? colors.primary : pressed ? colors.primaryMuted : colors.bgElevated,
                  opacity: pressed && !active ? 0.9 : 1,
                })}>
                <AppText weight="700" color={active ? colors.onPrimary : colors.ink}>
                  {scale.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Card>
        <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
          Your start
        </AppText>
        <AppText>{startNode ? startNode.name : 'No start chosen yet.'}</AppText>
        <AppText size={typeScale.label} color={colors.muted}>
          {floor.source === 'barometer'
            ? `Estimated floor: ${floor.label}, from the barometer.`
            : floor.source === 'none'
              ? `Floor is ${floor.label}. You can correct it while you walk.`
              : 'No indoor floor yet. Arrive at an entrance, or pick the room you are in.'}
        </AppText>
        <Button label="Choose your start" variant="secondary" icon="locate" onPress={() => router.push('/pick-start')} />
        {startNode ? (
          <Button label="Clear start point" variant="ghost" onPress={() => setStartNode(null)} />
        ) : null}
      </Card>
      {session ? (
        <Card>
          <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
            Profile
          </AppText>
          <AppText size={typeScale.label}>{session.user.email}</AppText>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
          <Field
            label="Mobility needs"
            value={mobility}
            onChangeText={setMobility}
            multiline
            placeholder="Optional. Only you can see this."
          />
          <AppText size={typeScale.label} color={colors.muted}>
            Stored separately from your display name. Other students and signed-out visitors cannot read it. Reports still show your display name, note, and photo.
          </AppText>
          <Button label="Save profile" haptic="light" onPress={save} />
          <Button
            label="Sign out"
            variant="secondary"
            onPress={async () => {
              await supabase.auth.signOut();
              setMessage('Signed out.');
            }}
          />
        </Card>
      ) : (
        <Button label="Sign in" icon="log-in" haptic="light" onPress={() => router.push('/login')} />
      )}
      {message ? <Notice tone="good">{message}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Button label="Print QR checkpoints" variant="secondary" icon="qr-code" onPress={() => router.push('/qr')} />
      <Button
        label="See the welcome again"
        variant="ghost"
        onPress={async () => {
          await AsyncStorage.removeItem(WELCOME_KEY);
          router.push('/welcome');
        }}
      />
    </Screen>
  );
}
