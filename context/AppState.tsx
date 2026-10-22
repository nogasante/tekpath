import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { Barometer, DeviceMotion } from 'expo-sensors';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { createDetector, floorDetectorTuning, verticalAcceleration, type FloorSense } from '@/lib/floorDetector';
import { supabase } from '@/lib/supabase';
import type { FloorReading, RouteResult, StartNode } from '@/lib/types';
import { floorLabel } from '@/lib/types';

const SCALE_KEY = 'tekpath-text-scale';
const START_KEY = 'tekpath-start-node';

type AppStateValue = {
  session: Session | null;
  authReady: boolean;
  textScale: number;
  setTextScale: (scale: number) => void;
  startNode: StartNode | null;
  setStartNode: (node: StartNode | null) => Promise<void>;
  floor: FloorReading;
  correctFloor: (level: number) => void;
  route: RouteResult | null;
  setRoute: (route: RouteResult | null) => void;
  refreshAuth: () => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

const emptyFloor = (pressure: number | null, available: boolean): FloorReading => ({
  level: null,
  label: 'Outdoors',
  source: 'outdoor',
  pressure,
  available,
  heightM: null,
  confidence: null,
  needsRecalibration: false,
  motion: null,
});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [textScale, setTextScaleState] = useState(1);
  const [startNode, setStartNodeState] = useState<StartNode | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [sense, setSense] = useState<FloorSense | null>(null);
  const [barometerOn, setBarometerOn] = useState(false);
  const detectorRef = useRef(createDetector({ floorHeightM: 3.5, hpaPerM: 0.12 }));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;
    void supabase.rpc('claim_admin_if_bootstrapped');
  }, [session?.user.id]);

  useEffect(() => {
    AsyncStorage.getItem(SCALE_KEY).then((value) => {
      const parsed = Number(value);
      if (parsed === 1 || parsed === 1.25 || parsed === 1.5) setTextScaleState(parsed);
    });
    AsyncStorage.getItem(START_KEY).then((value) => {
      if (!value) return;
      try {
        setStartNodeState(JSON.parse(value) as StartNode);
      } catch {
        AsyncStorage.removeItem(START_KEY);
      }
    });
  }, []);

  useEffect(() => {
    const detector = detectorRef.current;
    if (!startNode || startNode.floorLevel == null) {
      detector.reset();
      setSense(null);
      setBarometerOn(false);
      return;
    }
    const started = Date.now();
    detector.arm(started, startNode.floorLevel, {
      floorHeightM: startNode.floorHeightM || 3.5,
      hpaPerM: startNode.hpaPerM || 0.12,
    });
    setSense(detector.sense(started));
    if (Platform.OS === 'web') return;

    let cancelled = false;
    let baroSub: { remove: () => void } | null = null;
    let motionSub: { remove: () => void } | null = null;
    const publish = (t: number) => {
      if (!cancelled) setSense(detector.sense(t));
    };

    Barometer.isAvailableAsync()
      .then((available) => {
        if (!available || cancelled) return;
        Barometer.setUpdateInterval(floorDetectorTuning.sensorIntervalMs);
        baroSub = Barometer.addListener(({ pressure }) => {
          const t = Date.now();
          detector.observePressure(t, pressure);
          setBarometerOn(true);
          publish(t);
        });
      })
      .catch(() => {
        if (!cancelled) setBarometerOn(false);
      });

    DeviceMotion.isAvailableAsync()
      .then((available) => {
        if (!available || cancelled) return;
        DeviceMotion.setUpdateInterval(floorDetectorTuning.sensorIntervalMs);
        motionSub = DeviceMotion.addListener((measurement) => {
          const vertical = verticalAcceleration(measurement.acceleration, measurement.accelerationIncludingGravity);
          if (vertical == null) return;
          const t = Date.now();
          detector.observeMotion(t, vertical);
          publish(t);
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      baroSub?.remove();
      motionSub?.remove();
    };
  }, [startNode]);

  const setTextScale = useCallback((scale: number) => {
    setTextScaleState(scale);
    AsyncStorage.setItem(SCALE_KEY, String(scale));
  }, []);

  const setStartNode = useCallback(async (node: StartNode | null) => {
    setStartNodeState(node);
    const detector = detectorRef.current;
    if (!node) {
      setRoute(null);
      detector.reset();
      setSense(null);
      setBarometerOn(false);
      AsyncStorage.removeItem(START_KEY);
      return;
    }
    AsyncStorage.setItem(START_KEY, JSON.stringify(node));
    if (node.floorLevel == null) {
      detector.reset();
      setSense(null);
      return;
    }
    const t = Date.now();
    detector.arm(t, node.floorLevel, {
      floorHeightM: node.floorHeightM || 3.5,
      hpaPerM: node.hpaPerM || 0.12,
    });
    setSense(detector.sense(t));
  }, []);

  const correctFloor = useCallback((level: number) => {
    const detector = detectorRef.current;
    const t = Date.now();
    if (!detector.isArmed()) {
      detector.arm(t, level, {
        floorHeightM: startNode?.floorHeightM || 3.5,
        hpaPerM: startNode?.hpaPerM || 0.12,
      });
    }
    detector.anchorFloor(t, level);
    setSense(detector.sense(t));
  }, [startNode]);

  const floor: FloorReading = useMemo(() => {
    if (!startNode || startNode.floorLevel == null) {
      return emptyFloor(sense?.pressure ?? null, barometerOn);
    }
    const level = sense?.level ?? startNode.floorLevel;
    const calibrated = Boolean(sense?.calibrated && sense.pressure != null);
    return {
      level,
      label: floorLabel(level, level === startNode.floorLevel ? startNode.floorName : null),
      source: calibrated ? 'barometer' : 'none',
      pressure: sense?.pressure ?? null,
      available: calibrated || barometerOn,
      heightM: sense?.heightM ?? null,
      confidence: sense?.confidence ?? null,
      needsRecalibration: sense?.needsRecalibration ?? false,
      motion: sense?.motion ?? null,
    };
  }, [startNode, sense, barometerOn]);

  const refreshAuth = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  }, []);

  const value = useMemo(
    () => ({
      session,
      authReady,
      textScale,
      setTextScale,
      startNode,
      setStartNode,
      floor,
      correctFloor,
      route,
      setRoute,
      refreshAuth,
    }),
    [
      session,
      authReady,
      textScale,
      setTextScale,
      startNode,
      setStartNode,
      floor,
      correctFloor,
      route,
      refreshAuth,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
