import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { Barometer } from 'expo-sensors';
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

import { supabase } from '@/lib/supabase';
import type { FloorReading, RouteResult, StartNode } from '@/lib/types';
import { floorLabel } from '@/lib/types';

const SCALE_KEY = 'tekpath-text-scale';
const START_KEY = 'tekpath-start-node';

type Calibration = {
  floorLevel: number;
  floorHeightM: number;
  hpaPerM: number;
  refPressure: number | null;
};

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

async function readPressure(): Promise<number | null> {
  if (Platform.OS === 'web') return null;
  try {
    const available = await Barometer.isAvailableAsync();
    if (!available) return null;
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        sub.remove();
        resolve(null);
      }, 2000);
      const sub = Barometer.addListener(({ pressure }) => {
        clearTimeout(timeout);
        sub.remove();
        resolve(pressure);
      });
    });
  } catch {
    return null;
  }
}

function estimateLevel(calibration: Calibration, pressure: number) {
  const deltaM = (calibration.refPressure! - pressure) / calibration.hpaPerM;
  return calibration.floorLevel + Math.round(deltaM / calibration.floorHeightM);
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [textScale, setTextScaleState] = useState(1);
  const [startNode, setStartNodeState] = useState<StartNode | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [pressure, setPressure] = useState<number | null>(null);
  const [barometerOn, setBarometerOn] = useState(false);
  const pressureRef = useRef<number | null>(null);

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
    if (Platform.OS === 'web' || !calibration?.refPressure) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    Barometer.isAvailableAsync()
      .then((available) => {
        if (!available || cancelled) return;
        Barometer.setUpdateInterval(800);
        sub = Barometer.addListener(({ pressure: next }) => {
          pressureRef.current = next;
          setPressure(next);
          setBarometerOn(true);
        });
      })
      .catch(() => setBarometerOn(false));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [calibration?.refPressure]);

  const setTextScale = useCallback((scale: number) => {
    setTextScaleState(scale);
    AsyncStorage.setItem(SCALE_KEY, String(scale));
  }, []);

  const setStartNode = useCallback(async (node: StartNode | null) => {
    setStartNodeState(node);
    setRoute(null);
    if (!node) {
      setCalibration(null);
      AsyncStorage.removeItem(START_KEY);
      return;
    }
    AsyncStorage.setItem(START_KEY, JSON.stringify(node));
    if (node.floorLevel == null) {
      setCalibration(null);
      return;
    }
    const reading = await readPressure();
    pressureRef.current = reading;
    setPressure(reading);
    setBarometerOn(reading != null);
    setCalibration({
      floorLevel: node.floorLevel,
      floorHeightM: node.floorHeightM || 3.5,
      hpaPerM: node.hpaPerM || 0.12,
      refPressure: reading,
    });
  }, []);

  const correctFloor = useCallback((level: number) => {
    setCalibration((current) => ({
      floorLevel: level,
      floorHeightM: current?.floorHeightM ?? startNode?.floorHeightM ?? 3.5,
      hpaPerM: current?.hpaPerM ?? startNode?.hpaPerM ?? 0.12,
      refPressure: pressureRef.current ?? current?.refPressure ?? null,
    }));
  }, [startNode]);

  const floor: FloorReading = useMemo(() => {
    if (!startNode || startNode.floorLevel == null) {
      return {
        level: null,
        label: 'Outdoors',
        source: 'outdoor',
        pressure,
        available: barometerOn,
      };
    }
    if (calibration?.refPressure != null && pressure != null) {
      const level = estimateLevel(calibration, pressure);
      return {
        level,
        label: floorLabel(level),
        source: 'barometer',
        pressure,
        available: true,
      };
    }
    const level = calibration?.floorLevel ?? startNode.floorLevel;
    return {
      level,
      label: floorLabel(level, level === startNode.floorLevel ? startNode.floorName : null),
      source: 'none',
      pressure,
      available: false,
    };
  }, [startNode, calibration, pressure, barometerOn]);

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
