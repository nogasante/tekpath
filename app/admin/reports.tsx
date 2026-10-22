import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, EmptyState, Notice, Screen, Skeleton } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { useToast } from '@/context/Toast';
import { reportActionLabel } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { type as typeScale } from '@/lib/theme';
import { statusLabel } from '@/lib/types';

type ReportItem = {
  id: string;
  feature_name: string | null;
  status: string;
  note: string | null;
  created_at: string;
  display_name: string | null;
  hidden: boolean;
};

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ReportedPlacesScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await supabase.rpc('moderation_reports');
    if (result.error) {
      setError(result.error.message);
      setItems([]);
    } else {
      setError(null);
      setItems((result.data ?? []) as ReportItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(item: ReportItem) {
    setBusyId(item.id);
    setError(null);
    const result = await supabase.rpc('set_report_hidden', { report_id: item.id, hide: !item.hidden });
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      toast.show('That change did not save.', 'bad');
      return;
    }
    toast.show(item.hidden ? 'Report is visible again.' : 'Report hidden.');
    await load();
  }

  return (
    <Screen scroll>
      <AppText color={colors.muted}>Working, broken, and unknown stay live. Hide a report when it should not be on the map.</AppText>
      {loading ? <Skeleton height={120} /> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!loading && items.length === 0 && !error ? (
        <EmptyState icon="flag" title="No reports yet" body="Status notes from lifts and ramps show up here." />
      ) : null}
      {items.map((item) => (
        <Card key={item.id}>
          <View style={{ gap: 4 }}>
            <AppText weight="700" size={typeScale.headline}>
              {item.feature_name || 'Place'}
            </AppText>
            <AppText color={colors.muted}>
              {[statusLabel(item.status), item.display_name, when(item.created_at), item.hidden ? 'Hidden' : null].filter(Boolean).join(' · ')}
            </AppText>
            {item.note ? <AppText>{item.note}</AppText> : null}
          </View>
          <Button
            label={reportActionLabel(item.hidden)}
            variant={item.hidden ? 'secondary' : 'danger'}
            icon={item.hidden ? 'eye' : 'eye-off'}
            disabled={busyId === item.id}
            onPress={() => void toggle(item)}
          />
        </Card>
      ))}
    </Screen>
  );
}
