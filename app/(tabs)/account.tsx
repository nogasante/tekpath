import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { PasswordField } from '@/components/PasswordField';
import { ReviewMark } from '@/components/ReviewMark';
import { AppText, Button, Card, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { useToast } from '@/context/Toast';
import { authCopy, authFailureText, classifyAuthError, emailIssue, nameIssue, passwordIssue } from '@/lib/authFlow';
import { canManageTeam, canOpenAdmin } from '@/lib/moderation';
import { useCampusRole } from '@/lib/useCampusRole';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { radii, spacing, type as typeScale } from '@/lib/theme';
import type { FloorMotion } from '@/lib/types';
import { WELCOME_KEY } from '@/lib/welcome';

function formatHeight(metres: number) {
  const sign = metres > 0.005 ? '+' : '';
  return `${sign}${metres.toFixed(2)} m`;
}

function motionLabel(motion: FloorMotion | null) {
  switch (motion) {
    case 'still':
      return 'Still';
    case 'moving':
      return 'Moving';
    case 'lift':
      return 'Lift';
    case 'stairs':
      return 'Stairs';
    case 'unknown':
      return 'Pressure only';
    default:
      return '—';
  }
}

function SensorLine({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center' }}>
      <AppText color={colors.muted} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText weight="700">{value}</AppText>
    </View>
  );
}

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
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradePassword, setUpgradePassword] = useState('');
  const [upgradeInbox, setUpgradeInbox] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guest = session?.user.is_anonymous === true;
  const role = useCampusRole();
  const [submissions, setSubmissions] = useState<{ id: string; name: string; status: string; note: string | null; kind: string }[]>([]);

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

  useEffect(() => {
    if (!session) {
      setSubmissions([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase
        .from('buildings')
        .select('id,name,status,review_note')
        .eq('created_by', session.user.id)
        .in('status', ['pending', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('features')
        .select('id,name,review_status,review_note')
        .eq('created_by', session.user.id)
        .in('review_status', ['pending', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(12),
    ]).then(([buildings, features]) => {
      if (cancelled || buildings.error || features.error) return;
      setSubmissions([
        ...(buildings.data ?? []).map((row) => ({
          id: row.id as string,
          name: row.name as string,
          status: row.status as string,
          note: (row.review_note as string | null) ?? null,
          kind: 'Building',
        })),
        ...(features.data ?? []).map((row) => ({
          id: row.id as string,
          name: row.name as string,
          status: row.review_status as string,
          note: (row.review_note as string | null) ?? null,
          kind: 'Place',
        })),
      ]);
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

  async function upgrade() {
    if (!session || !guest) return;
    const nextName = nameIssue(displayName);
    const nextEmail = emailIssue(upgradeEmail);
    const nextPassword = passwordIssue(upgradePassword);
    if (nextName || nextEmail || nextPassword) {
      setError(nextName || nextEmail || nextPassword);
      return;
    }
    setError(null);
    const email = upgradeEmail.trim();
    const name = displayName.trim();
    const { data, error: authError } = await supabase.auth.updateUser({
      email,
      password: upgradePassword,
      data: { display_name: name },
    });
    if (authError) {
      const failure = classifyAuthError(authError);
      if (failure?.kind === 'confirm-email') {
        await supabase.auth.updateUser({ email, data: { display_name: name } });
        await supabase.from('profiles').update({ display_name: name, updated_at: new Date().toISOString() }).eq('id', session.user.id);
        setUpgradeInbox(true);
        return;
      }
      setError(failure ? authFailureText(failure) : authCopy.generic);
      void haptic('warning');
      return;
    }
    await supabase.from('profiles').update({ display_name: name, updated_at: new Date().toISOString() }).eq('id', session.user.id);
    if (!data.user || data.user.is_anonymous || !data.user.email) {
      setUpgradeInbox(true);
      return;
    }
    setUpgradeInbox(false);
    setMessage('Email saved. This guest account is now yours on other phones too.');
    toast.show('Email saved.');
    void haptic('success');
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
      <Card>
        <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
          Floor sensor
        </AppText>
        <AppText size={typeScale.label} color={colors.muted}>
          Live pressure from this phone. A lift or stairs can update the floor; a gust while you are still does not.
        </AppText>
        <SensorLine label="Pressure" value={floor.pressure != null ? `${floor.pressure.toFixed(2)} hPa` : 'No reading yet'} />
        <SensorLine label="Smoothed height" value={floor.heightM != null ? formatHeight(floor.heightM) : '—'} />
        <SensorLine label="Detected floor" value={floor.label} />
        <SensorLine
          label="Confidence"
          value={floor.confidence != null ? `${Math.round(floor.confidence * 100)}%` : '—'}
        />
        <SensorLine label="Activity" value={motionLabel(floor.motion)} />
        {floor.needsRecalibration ? (
          <Notice>This anchor is over 15 minutes old. Confirm a landmark, or pick your start again.</Notice>
        ) : null}
      </Card>
      {session ? (
        <Card>
          <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
            {guest ? 'Guest' : 'Signed in'}
          </AppText>
          <AppText size={typeScale.label} color={colors.muted}>
            {guest
              ? 'Reports from this phone are saved. Add an email to open them on another phone.'
              : session.user.email || 'Signed in'}
          </AppText>
          {guest && upgradeInbox ? (
            <Notice tone="good">
              {authCopy.confirmEmail}. Open the link sent to {upgradeEmail.trim()}, then return here. You can keep reporting as a guest until then.
            </Notice>
          ) : null}
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Shown on your reports" />
          {guest && !upgradeInbox ? (
            <>
              <Field
                label="Email"
                value={upgradeEmail}
                onChangeText={setUpgradeEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="name@university.edu"
              />
              <PasswordField value={upgradePassword} onChangeText={setUpgradePassword} />
              <Button label="Save with email" icon="mail" haptic="light" onPress={() => void upgrade()} />
            </>
          ) : null}
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
          {submissions.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <AppText weight="700">Your submissions</AppText>
              {submissions.map((item) => (
                <View key={`${item.kind}-${item.id}`} style={{ gap: 4 }}>
                  <AppText weight="700">
                    {item.kind} · {item.name}
                  </AppText>
                  <ReviewMark status={item.status} />
                  {item.note ? (
                    <AppText size={typeScale.label} color={colors.muted}>
                      {item.note}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          <Button
            label="Sign out"
            variant="secondary"
            onPress={async () => {
              await supabase.auth.signOut();
              setUpgradeInbox(false);
              setMessage('Signed out. The map is still open.');
            }}
          />
        </Card>
      ) : (
        <Card>
          <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
            No account yet
          </AppText>
          <AppText color={colors.muted}>
            You can use the map, search, routes, and indoor guidance like this. Continue as a guest only when you want to send a report or add a point.
          </AppText>
          <Button label="Continue as guest or with email" icon="person" haptic="light" onPress={() => router.push('/login')} />
        </Card>
      )}
      {canOpenAdmin(role) ? (
        <Card>
          <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
            Admin
          </AppText>
          <AppText color={colors.muted}>Review new maps and reports. Admins also choose who else can review.</AppText>
          <Button label="Review the map" icon="map" haptic="light" onPress={() => router.push('/admin')} />
          <Button label="Reported places" variant="secondary" icon="flag" onPress={() => router.push('/admin/reports')} />
          {canManageTeam(role) ? (
            <Button label="Team" variant="secondary" icon="people" onPress={() => router.push('/admin/team')} />
          ) : null}
        </Card>
      ) : null}
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
