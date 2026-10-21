import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { AppText, Button, Field, KindBadge, Notice, Screen, StatusBadge } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { uploadReportPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { AccessFeature, FeatureStatus } from '@/lib/types';

type ReportRow = {
  id: string;
  status: FeatureStatus;
  note: string | null;
  photo_url: string | null;
  created_at: string;
  profiles: { display_name: string } | { display_name: string }[] | null;
};

export default function FeatureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, startNode } = useAppState();
  const [feature, setFeature] = useState<AccessFeature | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState<FeatureStatus>('broken');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [featureResult, reportResult] = await Promise.all([
      supabase.from('features').select('id,node_id,building_id,kind,name,status,last_reported_at,latitude,longitude').eq('id', id).maybeSingle(),
      supabase
        .from('reports')
        .select('id,status,note,photo_url,created_at,profiles(display_name)')
        .eq('feature_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (featureResult.error) setError(featureResult.error.message);
    setFeature((featureResult.data as AccessFeature | null) ?? null);
    if (reportResult.error) setError(reportResult.error.message);
    else setReports((reportResult.data ?? []) as ReportRow[]);
  }, [id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`feature-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'features', filter: `id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => load())
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
      const { error: insertError } = await supabase.from('reports').insert({
        feature_id: feature.id,
        node_id: feature.node_id,
        user_id: session.user.id,
        status,
        note: note.trim() || null,
        photo_url: photoUrl,
      });
      if (insertError) throw insertError;
      setNote('');
      setPhoto(null);
      setMessage('Report saved. The status updates for everyone, and routing uses it immediately.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the report.');
    } finally {
      setBusy(false);
    }
  }

  if (!feature) {
    return (
      <Screen scroll>
        <AppText>{error || 'Loading this point…'}</AppText>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppText size={28} weight="700">{feature.name}</AppText>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <KindBadge kind={feature.kind} />
        <StatusBadge status={feature.status} />
      </View>
      <AppText size={16} color={colors.muted}>
        Approximate pin {Number(feature.latitude).toFixed(5)}, {Number(feature.longitude).toFixed(5)}. Notes are visible to anyone using TekPath.
      </AppText>
      {feature.node_id ? (
        <Button
          label={startNode ? 'Route here' : 'Choose a start, then route here'}
          onPress={() => {
            if (startNode) router.push({ pathname: '/route', params: { to: feature.node_id!, from: startNode.id } });
            else router.push({ pathname: '/pick-start', params: { to: feature.node_id! } });
          }}
        />
      ) : null}
      <AppText weight="700" size={22}>Report the current status</AppText>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['working', 'broken', 'unknown'] as FeatureStatus[]).map((value) => (
          <View key={value} style={{ flexGrow: 1 }}>
            <Button
              label={value === 'working' ? 'Working' : value === 'broken' ? 'Broken' : 'Unknown'}
              variant={status === value ? (value === 'broken' ? 'danger' : 'primary') : 'secondary'}
              onPress={() => setStatus(value)}
            />
          </View>
        ))}
      </View>
      <Field label="Note" value={note} onChangeText={setNote} multiline placeholder="What did you see?" />
      <Button label={photo ? 'Photo attached' : 'Choose a photo'} variant="secondary" icon="image" onPress={() => pick(false)} />
      <Button label="Take a photo" variant="secondary" icon="camera" onPress={() => pick(true)} />
      {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 180, borderRadius: 12 }} accessibilityLabel="Selected report photo" /> : null}
      <Button label={busy ? 'Sending…' : session ? 'Submit report' : 'Sign in to report'} onPress={submit} disabled={busy} />
      {message ? <Notice tone="good">{message}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <AppText weight="700" size={22}>Recent reports</AppText>
      {reports.length === 0 ? <AppText>No reports yet.</AppText> : null}
      {reports.map((report) => {
        const profile = Array.isArray(report.profiles) ? report.profiles[0] : report.profiles;
        return (
          <View key={report.id} style={{ gap: 6, padding: 12, borderWidth: 2, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.card }}>
            <StatusBadge status={report.status} />
            <AppText>{report.note || 'No note.'}</AppText>
            <AppText size={15} color={colors.muted}>
              {profile?.display_name || 'Student'} · {new Date(report.created_at).toLocaleString()}
            </AppText>
            {report.photo_url ? (
              <Image source={{ uri: report.photo_url }} style={{ width: '100%', height: 180, borderRadius: 12 }} accessibilityLabel="Report photo" />
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}
