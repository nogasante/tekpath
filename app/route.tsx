import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { asRoute, floorLabel, type RouteResult } from '@/lib/types';

export default function RouteScreen() {
  const params = useLocalSearchParams<{ to?: string; from?: string }>();
  const { startNode, setRoute } = useAppState();
  const fromId = (typeof params.from === 'string' && params.from) || startNode?.id;
  const toId = typeof params.to === 'string' ? params.to : undefined;
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fromId || !toId) {
      setLoading(false);
      setError('Choose a start and a destination.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase.rpc('find_step_free_route', { p_from: fromId, p_to: toId }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setResult(null);
      } else {
        const route = asRoute(data);
        setResult(route);
        setRoute(route);
        setError(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fromId, toId, setRoute]);

  return (
    <Screen scroll>
      {loading ? <AppText>Looking for a step-free route…</AppText> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result && !result.ok ? (
        <>
          <Notice tone="bad">{result.message || 'No step-free route.'}</Notice>
          <AppText>TekPath will not send you via stairs. If a lift or ramp is reported broken, it is left out of the route.</AppText>
          {result.blockers.map((blocker) => (
            <Button
              key={blocker.id}
              label={`Open ${blocker.name}`}
              variant="secondary"
              onPress={() => router.push(`/feature/${blocker.id}`)}
            />
          ))}
        </>
      ) : null}
      {result?.ok ? (
        <>
          <AppText size={16} color={colors.muted}>
            {result.distance_m != null ? `About ${Math.round(Number(result.distance_m))} metres. ` : ''}
            {result.steps.length} landmark steps.
          </AppText>
          {result.steps.map((step) => (
            <View key={`${step.order}-${step.node_id}`} style={{ gap: 4 }}>
              <AppText weight="700">
                {step.order}. {step.node_name}
                {step.floor_level != null ? ` · ${floorLabel(step.floor_level, step.floor_name)}` : ''}
              </AppText>
              <AppText>{step.instruction}</AppText>
            </View>
          ))}
          <Button label="Start step by step" icon="walk" onPress={() => router.push('/guide')} />
        </>
      ) : null}
      {!fromId ? <Button label="Pick where you are" onPress={() => router.push({ pathname: '/pick-start', params: { to: toId } })} /> : null}
    </Screen>
  );
}
