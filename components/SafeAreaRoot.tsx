import { ReactNode } from 'react';
import {
  initialWindowMetrics,
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  type Metrics,
} from 'react-native-safe-area-context';

type SafeAreaGlobal = typeof globalThis & {
  __TEKPATH_SAFE_AREA__?: Metrics | null;
};

function simulatedMetrics(): Metrics | null {
  const injected = (globalThis as SafeAreaGlobal).__TEKPATH_SAFE_AREA__;
  if (!injected?.insets || !injected.frame) return null;
  const { top, right, bottom, left } = injected.insets;
  const values = [top, right, bottom, left, injected.frame.width, injected.frame.height];
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  return injected;
}

export function SafeAreaRoot({ children }: { children: ReactNode }) {
  const simulated = simulatedMetrics();
  return (
    <SafeAreaProvider style={{ flex: 1 }} initialMetrics={simulated ?? initialWindowMetrics}>
      {simulated ? (
        <SafeAreaFrameContext.Provider value={simulated.frame}>
          <SafeAreaInsetsContext.Provider value={simulated.insets}>{children}</SafeAreaInsetsContext.Provider>
        </SafeAreaFrameContext.Provider>
      ) : (
        children
      )}
    </SafeAreaProvider>
  );
}
