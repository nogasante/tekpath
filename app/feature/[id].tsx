import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText, Button, Card, Field, KindBadge, Notice, Screen, Skeleton, StatusBadge } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { haptic } from '@/lib/haptics';
import { uploadReportPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { radii, spacing, statusTone, type as typeScale } from '@/lib/theme';
import type { AccessFeature, FeatureStatus } from '@/lib/types';
import { statusLabel } from '@/lib/types';

type ReportRow = {
  id: string;
  status: FeatureStatus;
  note: string | null;
  photo_url: string | null;
  created_at: string;
  display_name: string | null;
};

const choices: { id: FeatureStatus; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'working', hint: 'I could use it just now', icon: 'checkmark-circle' },
  { id: 'broken', hint: 'Blocked, stuck, or unsafe', icon: 'warning' },
  { id: 'unknown', hint: 'I could not tell', icon: 'help-circle' },
];

export default function FeatureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { session, startNode } = useAppState();
  const [feature, setFeature] = useState<AccessFeature | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState<FeatureStatus>('broken');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [featureResult, reportResult] = await Promise.all([
      supabase.from('features').select('id,node_id,building_id,kind,name,status,last_reported_at,latitude,longitude').eq('id', id).maybeSingle(),
      supabase
        .from('report_feed')
        .select('id,status,note,photo_url,created_at,display_name')
        .eq('feature_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (featureResult.error) setError(featureResult.error.message);
    setFeature((featureResult.data as AccessFeature | null) ?? null);
    if (reportResult.error) setError(reportResult.error.message);
    else setReports((reportResult.data ?? []) as ReportRow[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`feature-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'features', filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  async function pick(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo permission was denied. You can still send the report without a picture.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!result.canceled && result.assets[0]) {
      setPhoto({ uri: result.assets[0].uri, mime: result.assets[0].mimeType || 'image/jpeg' });
      void haptic('selection');
    }
  }

  async function submit() {
    if (!feature) return;
    if (!session) {
      router.push({ pathname: '/login', params: { next: `/feature/${feature.id}` } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let photoUrl: string | null = null;
      if (photo) photoUrl = await uploadReportPhoto(session.user.id, photo.uri, photo.mime);
      const { error: insertError } = await supabase
        .from('reports')
        .insert({
          feature_id: feature.id,
          node_id: feature.node_id,
          user_id: session.user.id,
          status,
          note: note.trim() || null,
          photo_url: photoUrl,
        })
        .select('id');
      if (insertError) throw insertError;
      setNote('');
      setPhoto(null);
      setMessage('Report saved. The map and the router use this status now.');
      void haptic('success');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the report.');
      void haptic('warning');
    } finally {
      setBusy(false);
    }
  }

  if (!feature) {
    return (
      <Screen scroll>
        {loading ? <Skeleton height={36} width="80%" /> : null}
        <AppText>{error || (loading ? 'Loading this point…' : 'This point is not on the map.')}</AppText>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppText accessibilityRole="header" size={typeScale.title} weight="700">
        {feature.name}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
        <KindBadge kind={feature.kind} />
        <StatusBadge status={feature.status} />
      </View>
      <AppText size={typeScale.label} color={colors.muted}>
        Approximate pin {Number(feature.latitude).toFixed(5)}, {Number(feature.longitude).toFixed(5)}. Notes and photos are visible to anyone using TekPath.
      </AppText>
      {feature.node_id ? (
        <Button
          label={startNode ? 'Route here' : 'Choose a start, then route here'}
          icon="navigate"
          haptic="light"
          onPress={() => {
            if (startNode) router.push({ pathname: '/route', params: { to: feature.node_id!, from: startNode.id } });
            else router.push({ pathname: '/pick-start', params: { to: feature.node_id! } });
          }}
        />
      ) : null}
      {message ? <ReportSaved message={message} /> : null}
      <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
        What do you see?
      </AppText>
      <View style={{ gap: spacing.sm }}>
        {choices.map((choice) => {
          const tone = statusTone(colors, choice.id);
          const selected = status === choice.id;
          return (
            <Pressable
              key={choice.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${statusLabel(choice.id)}. ${choice.hint}`}
              onPress={() => {
                setStatus(choice.id);
                void haptic('selection');
              }}
              style={({ pressed }) => ({
                minHeight: 72,
                borderRadius: radii.md,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? tone.fg : colors.line,
                backgroundColor: selected ? tone.bg : colors.bgElevated,
                padding: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}>
              <Ionicons name={choice.icon} size={28} color={tone.fg} aria-hidden />
              <View style={{ flex: 1 }}>
                <AppText weight="700" color={tone.fg}>
                  {statusLabel(choice.id)}
                </AppText>
                <AppText size={typeScale.label} color={colors.muted}>
                  {choice.hint}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Field label="Note" value={note} onChangeText={setNote} multiline placeholder="What did you see?" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label={photo ? 'Photo attached' : 'Choose a photo'} variant="secondary" icon="image" onPress={() => pick(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Take a photo" variant="secondary" icon="camera" onPress={() => pick(true)} />
        </View>
      </View>
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          style={{ width: '100%', height: 180, borderRadius: radii.md }}
          accessibilityLabel="Selected report photo"
        />
      ) : null}
      <Button
        label={busy ? 'Sending…' : session ? 'Submit report' : 'Sign in to report'}
        haptic="light"
        onPress={submit}
        disabled={busy}
      />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <AppText accessibilityRole="header" weight="700" size={typeScale.headline}>
        Recent reports
      </AppText>
      {reports.length === 0 ? (
        <AppText color={colors.muted}>No reports yet. Yours will be the first.</AppText>
      ) : null}
      {reports.map((report) => (
        <Card key={report.id}>
          <StatusBadge status={report.status} />
          <AppText>{report.note || 'No note.'}</AppText>
          <AppText size={typeScale.label} color={colors.muted}>
            {report.display_name || 'Student'} · {new Date(report.created_at).toLocaleString()}
          </AppText>
          {report.photo_url ? (
            <Image
              source={{ uri: report.photo_url }}
              style={{ width: '100%', height: 180, borderRadius: radii.md }}
              accessibilityLabel="Report photo"
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

function ReportSaved({ message }: { message: string }) {
  const { colors, reduceMotion } = useTheme();
  const scale = useSharedValue(reduceMotion ? 1 : 0.7);
  useEffect(() => {
    if (!reduceMotion) scale.value = withTiming(1, { duration: 320 });
  }, [reduceMotion, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Animated.View
          style={[
            {
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.workingBg,
              alignItems: 'center',
              justifyContent: 'center',
            },
            animated,
          ]}>
          <Ionicons name="checkmark" size={26} color={colors.workingFg} aria-hidden />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Notice tone="good">{message}</Notice>
        </View>
      </View>
    </Card>
  );
}
