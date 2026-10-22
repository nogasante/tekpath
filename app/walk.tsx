import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Accelerometer, Barometer, DeviceMotion, Magnetometer, Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CampusMap } from '@/components/CampusMap';
import { GlyphIcon } from '@/components/GlyphIcon';
import { WalkCanvas } from '@/components/WalkCanvas';
import { AppText, Button, Card, Chip, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { useToast } from '@/context/Toast';
import { createDetector, floorDetectorTuning, verticalAcceleration } from '@/lib/floorDetector';
import { footprintCaption, formatArea, measureFootprint, ringFromGeoJson, type LngLat } from '@/lib/footprint';
import { haptic } from '@/lib/haptics';
import { fetchBuildingFootprints, type OsmBuilding, type OsmEntrance } from '@/lib/overpass';
import { publishToast } from '@/lib/moderation';
import { publishWalk } from '@/lib/publishWalk';
import { calibrateStepLength, smoothHeading } from '@/lib/pdr';
import { useResumeWhenSignedIn } from '@/lib/resumeAuth';
import { supabase } from '@/lib/supabase';
import { campus, radii, spacing, type as typeScale } from '@/lib/theme';
import {
  addCapture,
  appendWalkStep,
  closeWalk,
  connectFloors,
  createDraft,
  deleteNode,
  suggestCode,
  updateNode,
  type CaptureKind,
  type WalkDraft,
  type WalkNode,
} from '@/lib/walkGraph';

const SAVE_KEY = 'tekpath.walkDraft';

type Phase = 'place' | 'outline' | 'ready' | 'calibrate' | 'walk' | 'review';
type Banner = { tone: 'info' | 'good' | 'bad'; text: string };
type Setup = {
  name: string;
  code: string;
  buildingId: string | null;
  description: string;
  ring: LngLat[];
  entrances: OsmEntrance[];
  floorName: string;
  here: LngLat | null;
};
type BuildingHit = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  latitude: number;
  longitude: number;
  area_m2?: number | null;
  perimeter_m?: number | null;
  footprint_geojson?: unknown;
};
type SheetState = { mode: 'capture'; kind: CaptureKind } | { mode: 'edit'; id: string } | null;

const TILES: { kind: CaptureKind; label: string; glyph: string; ink: string; wash: string }[] = [
  { kind: 'room', label: 'Door', glyph: 'door', ink: '#0F6E56', wash: 'rgba(15,110,86,0.14)' },
  { kind: 'junction', label: 'Junction', glyph: 'junction', ink: '#0B4F8A', wash: 'rgba(11,79,138,0.12)' },
  { kind: 'lift', label: 'Lift', glyph: 'lift', ink: '#5C4B8A', wash: 'rgba(92,75,138,0.14)' },
  { kind: 'stairs', label: 'Stairs', glyph: 'stairs', ink: '#8E4522', wash: 'rgba(142,69,34,0.14)' },
  { kind: 'ramp', label: 'Ramp', glyph: 'ramp', ink: '#C46A3A', wash: 'rgba(196,106,58,0.16)' },
  { kind: 'toilet', label: 'Toilet', glyph: 'toilet', ink: '#0B5C34', wash: 'rgba(11,92,52,0.14)' },
  { kind: 'obstacle', label: 'Step', glyph: 'step', ink: '#8A5A00', wash: 'rgba(138,90,0,0.16)' },
  { kind: 'landmark', label: 'Landmark', glyph: 'landmark', ink: '#6B3A6E', wash: 'rgba(107,58,110,0.14)' },
];

function pointLabel(kind: string) {
  const tile = TILES.find((item) => item.kind === kind);
  if (tile) return tile.label;
  if (kind === 'entrance') return 'Entrance';
  return kind.slice(0, 1).toUpperCase() + kind.slice(1);
}

function tileStyle(kind: string) {
  return TILES.find((item) => item.kind === kind) ?? { glyph: 'entrance', ink: '#0F6E56', wash: 'rgba(15,110,86,0.14)', label: pointLabel(kind), kind: 'entrance' as const };
}

function centroid(ring: LngLat[]): LngLat {
  const sum = ring.reduce(
    (acc, point) => ({ latitude: acc.latitude + point.latitude, longitude: acc.longitude + point.longitude }),
    { latitude: 0, longitude: 0 },
  );
  return { latitude: sum.latitude / ring.length, longitude: sum.longitude / ring.length };
}

function traceMetres(trace: { x: number; y: number; floorLevel: number }[]) {
  let sum = 0;
  for (let i = 1; i < trace.length; i += 1) {
    if (trace[i].floorLevel !== trace[i - 1].floorLevel) continue;
    sum += Math.hypot(trace[i].x - trace[i - 1].x, trace[i].y - trace[i - 1].y);
  }
  return sum;
}

function formatDistance(metres: number) {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km walked`;
  return `${Math.round(metres)} m walked`;
}

export default function WalkScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { session } = useAppState();
  const [phase, setPhase] = useState<Phase>('place');
  const [draft, setDraft] = useState<WalkDraft | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BuildingHit[]>([]);
  const [buildings, setBuildings] = useState<OsmBuilding[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [corners, setCorners] = useState<LngLat[]>([]);
  const [floorName, setFloorName] = useState('Ground');
  const [centre, setCentre] = useState<LngLat>({ latitude: campus.latitude, longitude: campus.longitude });
  const [roomNumber, setRoomNumber] = useState('');
  const [editName, setEditName] = useState('');
  const [noteText, setNoteText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [heading, setHeading] = useState(0);
  const [calSteps, setCalSteps] = useState(0);
  const [floorAsk, setFloorAsk] = useState<{ toLevel: number; heightM: number; hpaDelta: number | null } | null>(null);
  const [reviewLevel, setReviewLevel] = useState(0);
  const headingRef = useRef(0);
  const draftRef = useRef<WalkDraft | null>(null);
  const phaseRef = useRef<Phase>('place');
  const pedometerOn = useRef(false);
  draftRef.current = draft;
  phaseRef.current = phase;

  const publishRef = useRef<() => void>(() => undefined);
  const armPublish = useResumeWhenSignedIn(Boolean(session), () => publishRef.current());

  useEffect(() => {
    AsyncStorage.getItem(SAVE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { draft?: WalkDraft; setup?: Setup };
        if (saved.draft?.ring?.length) {
          setDraft(saved.draft);
          setSetup(saved.setup ?? null);
          setName(saved.draft.buildingName);
          setCode(saved.draft.buildingCode);
          setPhase(saved.draft.stage === 'review' ? 'review' : saved.draft.stage === 'walking' ? 'walk' : 'ready');
          setReviewLevel(saved.draft.activeLevel);
          return;
        }
        if (saved.setup?.ring?.length) {
          setSetup(saved.setup);
          setName(saved.setup.name);
          setCode(saved.setup.code);
          setFloorName(saved.setup.floorName);
          setPhase('ready');
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!draft && !setup) return;
    const handle = setTimeout(() => {
      AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ draft, setup })).catch(() => undefined);
    }, 400);
    return () => clearTimeout(handle);
  }, [draft, setup]);

  useEffect(() => {
    if (phase !== 'walk' && phase !== 'calibrate') return;
    let cancelled = false;
    const detector = createDetector({ floorHeightM: 3.6, hpaPerM: 0.12 });
    const started = Date.now();
    detector.arm(started, draftRef.current?.activeLevel ?? 0);
    let level = draftRef.current?.activeLevel ?? 0;
    let heightAt = 0;
    let pressureAt: number | null = null;
    const samples: { t: number; value: number }[] = [];
    let lastPeak = 0;
    const subs: { remove: () => void }[] = [];

    const listen = (start: () => { remove: () => void } | void) => {
      try {
        const sub = start();
        if (sub) subs.push(sub);
      } catch {
        // Web and some Expo Go builds have no native sensor module.
      }
    };

    const pedometerCheck = (() => {
      try {
        return Pedometer.isAvailableAsync();
      } catch {
        return Promise.resolve(false);
      }
    })();
    pedometerCheck
      .then((ok) => {
        if (cancelled) return;
        pedometerOn.current = ok;
        if (!ok) return;
        let seen = 0;
        listen(() =>
          Pedometer.watchStepCount((result) => {
            const delta = result.steps - seen;
            seen = result.steps;
            if (delta > 0 && delta < 6) pushSteps(delta);
          }),
        );
      })
      .catch(() => {
        pedometerOn.current = false;
      });

    listen(() => {
      Magnetometer.setUpdateInterval(250);
      return Magnetometer.addListener((data) => {
        const angle = (Math.atan2(data.y, data.x) * 180) / Math.PI;
        const next = smoothHeading(headingRef.current, angle, 0.35);
        headingRef.current = next;
        setHeading(next);
      });
    });

    listen(() => {
      Accelerometer.setUpdateInterval(50);
      return Accelerometer.addListener((data) => {
        if (pedometerOn.current) return;
        const value = Math.abs(Math.hypot(data.x, data.y, data.z) - 1);
        samples.push({ t: Date.now(), value });
        if (samples.length > 40) samples.shift();
        const last = samples[samples.length - 2];
        const prev = samples[samples.length - 3];
        if (!last || !prev) return;
        if (last.value < 0.55 || last.value <= prev.value || last.value <= value) return;
        if (last.t - lastPeak < 320) return;
        lastPeak = last.t;
        pushSteps(1);
      });
    });

    const barometerCheck = (() => {
      try {
        return Barometer.isAvailableAsync();
      } catch {
        return Promise.resolve(false);
      }
    })();
    barometerCheck
      .then((ok) => {
        if (!ok || cancelled || phaseRef.current !== 'walk') return;
        listen(() => {
          Barometer.setUpdateInterval(floorDetectorTuning.sensorIntervalMs);
          return Barometer.addListener(({ pressure }) => {
            const t = Date.now();
            detector.observePressure(t, pressure);
            const sense = detector.sense(t);
            if (!sense.calibrated || sense.level == null || sense.level === level) return;
            const rise = (sense.heightM ?? 0) - heightAt;
            const hpa = pressureAt != null && sense.smoothedPressure != null ? sense.smoothedPressure - pressureAt : null;
            level = sense.level;
            heightAt = sense.heightM ?? heightAt;
            pressureAt = sense.smoothedPressure;
            setFloorName(sense.level === 0 ? 'Ground' : `Level ${sense.level}`);
            setFloorAsk({ toLevel: sense.level, heightM: rise, hpaDelta: hpa });
          });
        });
      })
      .catch(() => undefined);

    listen(() => {
      DeviceMotion.setUpdateInterval(floorDetectorTuning.sensorIntervalMs);
      return DeviceMotion.addListener((data) => {
        const vertical = verticalAcceleration(data.acceleration, data.accelerationIncludingGravity ?? { x: 0, y: 0, z: 0 });
        if (vertical == null) return;
        detector.observeMotion(Date.now(), vertical);
      });
    });

    return () => {
      cancelled = true;
      subs.forEach((sub) => sub.remove());
    };
  }, [phase]);

  function pushSteps(count: number) {
    if (phaseRef.current === 'calibrate') {
      setCalSteps((value) => value + count);
      return;
    }
    setDraft((current) => {
      if (!current) return current;
      let next = current;
      for (let i = 0; i < count; i += 1) next = appendWalkStep(next, headingRef.current);
      return next;
    });
  }

  async function searchBuildings(text: string) {
    setQuery(text);
    if (text.trim().length < 1) {
      setHits([]);
      return;
    }
    const rich = await supabaseBuildings(text.trim());
    setHits(rich);
  }

  async function chooseExisting(building: BuildingHit) {
    setBanner(null);
    setName(building.name);
    setCode(building.code);
    const ring = ringFromGeoJson(building.footprint_geojson);
    if (ring && ring.length >= 4) {
      setSetup({
        name: building.name,
        code: building.code,
        buildingId: building.id,
        description: building.description || 'Walked with TekPath.',
        ring,
        entrances: [],
        floorName,
        here: { latitude: building.latitude, longitude: building.longitude },
      });
      const caption = footprintCaption(measureFootprint(ring).areaM2, measureFootprint(ring).perimeterM);
      setBanner(caption ? { tone: 'good', text: `${building.name}. ${caption}.` } : null);
      setPhase('ready');
      return;
    }
    setBusy(true);
    try {
      await lookUp(building.latitude, building.longitude, building.name, building.code, building.id);
    } finally {
      setBusy(false);
    }
  }

  async function lookUp(latitude: number, longitude: number, buildingName: string, buildingCode: string, buildingId: string | null) {
    setBanner(null);
    setCorners([]);
    setName(buildingName);
    setCode(buildingCode || suggestCode(buildingName || 'Building'));
    try {
      const found = await fetchBuildingFootprints(latitude, longitude, 70);
      setBuildings(found);
      const first = found[0] ?? null;
      setPickedId(first?.id ?? null);
      setCentre(first ? centroid(first.ring) : { latitude, longitude });
      setSetup({
        name: buildingName,
        code: buildingCode || suggestCode(buildingName || 'Building'),
        buildingId,
        description: 'Walked with TekPath.',
        ring: first?.ring ?? [],
        entrances: first?.entrances ?? [],
        floorName,
        here: { latitude, longitude },
      });
      if (!found.length) setBanner({ tone: 'info', text: 'No saved outline here. Tap the corners on the map.' });
      setPhase('outline');
    } catch (lookupError) {
      setBuildings([]);
      setPickedId(null);
      setCentre({ latitude, longitude });
      setBanner({
        tone: 'info',
        text: lookupError instanceof Error ? lookupError.message : "We couldn't fetch a fresh outline. Tap the corners on the map.",
      });
      setPhase('outline');
    }
  }

  async function newBuilding() {
    setBusy(true);
    setBanner(null);
    const located = await locate();
    const point = located ?? { latitude: campus.latitude, longitude: campus.longitude };
    if (!located) setBanner({ tone: 'info', text: "We couldn't read your location. The map is centred on campus." });
    try {
      await lookUp(point.latitude, point.longitude, name.trim(), code.trim() || suggestCode(name || 'Building'), null);
    } finally {
      setBusy(false);
    }
  }

  function chooseOutline(building: OsmBuilding) {
    setPickedId(building.id);
    setCentre(centroid(building.ring));
    setSetup((current) =>
      current
        ? { ...current, ring: building.ring, entrances: building.entrances }
        : {
            name: name.trim() || building.name || 'Building',
            code: code.trim() || suggestCode(building.name || 'Building'),
            buildingId: null,
            description: 'Walked with TekPath.',
            ring: building.ring,
            entrances: building.entrances,
            floorName,
            here: centre,
          },
    );
  }

  function useOutline() {
    const picked = buildings.find((building) => building.id === pickedId) ?? null;
    if (corners.length >= 3) {
      useCorners();
      return;
    }
    if (!picked) {
      setBanner({ tone: 'info', text: 'Tap each corner. The shape closes when you have three.' });
      return;
    }
    const measured = measureFootprint(picked.ring);
    const nextName = name.trim() || picked.name || 'Building';
    const next: Setup = {
      name: nextName,
      code: (code.trim() || suggestCode(nextName)).toUpperCase(),
      buildingId: setup?.buildingId ?? null,
      description: 'Walked with TekPath.',
      ring: picked.ring,
      entrances: picked.entrances,
      floorName,
      here: setup?.here ?? centre,
    };
    setSetup(next);
    setName(next.name);
    setCode(next.code);
    const caption = footprintCaption(measured.areaM2, measured.perimeterM);
    setBanner(caption ? { tone: 'good', text: `${next.name}. ${caption}.` } : null);
    setPhase('ready');
  }

  function useCorners() {
    if (corners.length < 3) {
      setBanner({ tone: 'info', text: 'Tap each corner. The shape closes when you have three.' });
      return;
    }
    const measured = measureFootprint(corners);
    if (!Number.isFinite(measured.areaM2) || measured.areaM2 < 4) {
      setBanner({ tone: 'bad', text: 'That outline is too small. Space the corners further apart.' });
      return;
    }
    const nextName = name.trim() || 'Building';
    const next: Setup = {
      name: nextName,
      code: (code.trim() || suggestCode(nextName)).toUpperCase(),
      buildingId: setup?.buildingId ?? null,
      description: 'Walked with TekPath.',
      ring: corners,
      entrances: [],
      floorName,
      here: setup?.here ?? centre,
    };
    setSetup(next);
    setName(next.name);
    setCode(next.code);
    const caption = footprintCaption(measured.areaM2, measured.perimeterM);
    setBanner(caption ? { tone: 'good', text: `${next.name}. ${caption}.` } : null);
    setPhase('ready');
  }

  async function locate(limitMs = 8000): Promise<LngLat | null> {
    try {
      const perm = await Promise.race([
        Location.requestForegroundPermissionsAsync(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), limitMs)),
      ]);
      if (!perm?.granted) return null;
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), limitMs)),
      ]);
      if (!pos) return null;
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      return null;
    }
  }

  async function start(entrance?: LngLat) {
    if (!setup?.ring || setup.ring.length < 3) {
      setBanner({ tone: 'info', text: 'Choose an outline first.' });
      return;
    }
    setBusy(true);
    setBanner(null);
    let point = entrance ?? (await locate(3000)) ?? setup.here;
    if (!point) {
      point = setup.ring[0];
      setBanner({ tone: 'info', text: "We couldn't read your location. The entrance is the first corner." });
    }
    try {
      const next = createDraft({
        buildingName: name.trim() || setup.name,
        buildingCode: (code.trim() || setup.code).toUpperCase(),
        buildingId: setup.buildingId,
        description: setup.description,
        ring: setup.ring,
        entrance: point,
        headingDeg: headingRef.current,
        floorName: floorName.trim() || 'Ground',
      });
      headingRef.current = next.lastHeadingDeg;
      setHeading(next.lastHeadingDeg);
      setDraft(next);
      setCalSteps(0);
      setPhase('calibrate');
      void haptic('success');
    } catch (startError) {
      setBanner({ tone: 'bad', text: startError instanceof Error ? startError.message : 'Could not start the walk.' });
    } finally {
      setBusy(false);
    }
  }

  function finishCalibration() {
    const length = calibrateStepLength(calSteps, 10);
    if (length == null) {
      setBanner({ tone: 'info', text: 'Walk a little further, then tap Done.' });
      return;
    }
    setDraft((current) => (current ? { ...current, stepLengthM: length, stage: 'walking' } : current));
    setBanner({ tone: 'good', text: `Stride set to ${length.toFixed(2)} m.` });
    setPhase('walk');
  }

  function skipCalibration() {
    setDraft((current) => (current ? { ...current, stage: 'walking' } : current));
    setBanner(null);
    setPhase('walk');
  }

  function openCapture(kind: CaptureKind) {
    setRoomNumber('');
    setNoteText('');
    setPhotoUri(null);
    setSheet({ mode: 'capture', kind });
    void haptic('light');
  }

  function saveSheet() {
    if (!sheet) return;
    if (sheet.mode === 'capture') {
      const kind = sheet.kind;
      setDraft((current) => {
        if (!current) return current;
        return addCapture(current, {
          kind,
          roomNumber: kind === 'room' ? roomNumber : null,
          landmark: noteText,
          photoUri,
          floorName,
        });
      });
      toast.show(`${pointLabel(kind)} saved`);
    } else {
      setDraft((current) =>
        current
          ? updateNode(current, sheet.id, {
              name: editName,
              roomNumber,
              landmark: noteText,
            })
          : current,
      );
      toast.show('Changes saved');
    }
    setSheet(null);
    setPhotoUri(null);
  }

  function openEdit(node: WalkNode) {
    setEditName(node.name);
    setRoomNumber(node.roomNumber ?? '');
    setNoteText(node.landmark ?? '');
    setSheet({ mode: 'edit', id: node.id });
  }

  async function attachPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.5 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  function answerFloor(via: 'lift' | 'stairs') {
    if (!floorAsk) return;
    const nextName = floorName.trim() || (floorAsk.toLevel === 0 ? 'Ground' : `Level ${floorAsk.toLevel}`);
    setDraft((current) =>
      current
        ? connectFloors(current, {
            toLevel: floorAsk.toLevel,
            toName: nextName,
            via,
            heightM: floorAsk.heightM,
            hpaDelta: floorAsk.hpaDelta,
          })
        : current,
    );
    setFloorName(nextName);
    setFloorAsk(null);
    toast.show(via === 'lift' ? 'Lift recorded' : 'Stairs recorded');
  }

  function finishWalk() {
    if (!draft) return;
    const closed = closeWalk(draft);
    setDraft(closed);
    setReviewLevel(closed.floors[0]?.level ?? 0);
    setFloorAsk(null);
    setPhase('review');
  }

  async function publish() {
    const current = draftRef.current;
    if (!current) return;
    setConfirmPublish(false);
    if (!session) {
      armPublish(true);
      router.push({ pathname: '/login', params: { next: '/walk' } });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const result = await publishWalk(current, session.user.id);
      await AsyncStorage.removeItem(SAVE_KEY);
      void haptic('success');
      if (result.warning) {
        setBanner({ tone: 'info', text: result.warning });
        toast.show(result.sentForReview ? 'Sent for review' : 'Saved');
        return;
      }
      toast.show(publishToast(result.sentForReview));
      router.replace('/');
    } catch (publishError) {
      setBanner({ tone: 'bad', text: publishError instanceof Error ? publishError.message : 'Could not publish.' });
    } finally {
      setBusy(false);
    }
  }
  publishRef.current = () => {
    void publish();
  };

  const readyMetrics = setup?.ring?.length ? measureFootprint(setup.ring) : null;
  const picked = buildings.find((building) => building.id === pickedId) ?? null;
  const preview = corners.length >= 3 ? corners : picked?.ring;
  const activeFloor = draft?.floors.find((floor) => floor.level === (phase === 'review' ? reviewLevel : draft.activeLevel));
  const floorTrace = draft?.trace.filter((point) => point.floorLevel === (phase === 'review' ? reviewLevel : draft.activeLevel)) ?? [];
  const floorNodes = draft?.nodes.filter((node) => node.floorLevel === (phase === 'review' ? reviewLevel : draft.activeLevel)) ?? [];
  const sheetNode = sheet?.mode === 'edit' ? draft?.nodes.find((node) => node.id === sheet.id) : null;
  const sheetKind = sheet?.mode === 'capture' ? sheet.kind : sheetNode?.kind;
  const roomCount = draft?.nodes.filter((node) => node.kind === 'room').length ?? 0;
  const liftCount = draft?.nodes.filter((node) => node.kind === 'lift').length ?? 0;
  const rampCount = draft?.nodes.filter((node) => node.kind === 'ramp').length ?? 0;

  const sheetView = (
    <Modal visible={sheet != null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={() => setSheet(null)} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,22,20,0.45)' }} />
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            padding: spacing.lg,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            gap: spacing.md,
          }}>
          <AppText weight="700" size={typeScale.headline}>
            {sheet?.mode === 'edit' ? 'Edit this point' : pointLabel(sheetKind || 'room')}
          </AppText>
          {sheet?.mode === 'edit' ? <Field label="Name" value={editName} onChangeText={setEditName} /> : null}
          {sheetKind === 'room' || sheet?.mode === 'edit' ? (
            <Field label="Room number" value={roomNumber} onChangeText={setRoomNumber} placeholder="201" />
          ) : null}
          <Field label="Note" value={noteText} onChangeText={setNoteText} placeholder="Past the noticeboard" />
          <Button label={photoUri ? 'Photo added' : 'Add a photo'} variant="secondary" onPress={() => void attachPhoto()} />
          <Button label="Save" onPress={saveSheet} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const confirmView = (
    <Modal visible={confirmPublish} transparent animationType="fade" onRequestClose={() => setConfirmPublish(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Keep editing" onPress={() => setConfirmPublish(false)} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,22,20,0.45)' }} />
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            padding: spacing.lg,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            gap: spacing.md,
          }}>
          <AppText weight="700" size={typeScale.headline}>
            Add this building to the campus map?
          </AppText>
          <AppText color={colors.muted}>Rooms, lifts, and the outline will be available for routes.</AppText>
          <Button label={busy ? 'Adding it' : 'Add it'} onPress={() => void publish()} disabled={busy} />
          <Button label="Keep editing" variant="secondary" onPress={() => setConfirmPublish(false)} />
        </View>
      </View>
    </Modal>
  );

  if (phase === 'outline') {
    return (
      <Screen padded={false}>
        <View style={{ flex: 1 }}>
          <CampusMap
            features={[]}
            onSelect={() => undefined}
            polygon={preview}
            cornerPins={corners}
            focus={centre}
            onMapPress={(coord) => setCorners((current) => [...current, coord])}
            padding={{ top: 12, right: 12, bottom: 24, left: 12 }}
          />
        </View>
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            padding: spacing.lg,
            gap: spacing.sm,
            borderTopWidth: 1,
            borderColor: colors.line,
          }}>
          {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}
          <AppText weight="700" accessibilityRole="header">
            Building outline
          </AppText>
          <AppText color={colors.muted}>
            {buildings.length ? 'Pick a saved outline, or tap the corners yourself.' : 'Tap each corner. The shape closes when you have three.'}
          </AppText>
          {buildings.length ? (
            <ScrollView style={{ maxHeight: 132 }} keyboardShouldPersistTaps="handled">
              {buildings.slice(0, 4).map((building) => {
                const selected = building.id === pickedId && corners.length < 3;
                return (
                  <Pressable
                    key={building.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={building.name || 'Unnamed building'}
                    onPress={() => chooseOutline(building)}
                    style={{
                      minHeight: 48,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: radii.md,
                      backgroundColor: selected ? colors.primaryMuted : 'transparent',
                      marginBottom: 4,
                    }}>
                    <AppText weight="700">{building.name || 'Unnamed building'}</AppText>
                    <AppText size={typeScale.caption} color={colors.primary}>
                      {footprintCaption(building.areaM2, building.perimeterM)}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <AppText size={typeScale.label} color={colors.muted}>
            {corners.length ? `${corners.length} ${corners.length === 1 ? 'corner' : 'corners'}` : 'No corners yet'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Undo last corner" variant="secondary" style={{ flex: 1 }} onPress={() => setCorners((current) => current.slice(0, -1))} disabled={!corners.length} />
            <Button label="Use this outline" style={{ flex: 1 }} onPress={useOutline} disabled={corners.length < 3 && !picked} />
          </View>
        </View>
        {sheetView}
      </Screen>
    );
  }

  if (phase === 'calibrate') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.lg }}>
          {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}
          <AppText weight="700" size={typeScale.title} accessibilityRole="header">
            Set your stride
          </AppText>
          <AppText color={colors.muted}>Walk about 10 metres in a straight line, then tap Done. This is only asked once.</AppText>
          <AppText weight="700" size={typeScale.display} accessibilityLabel={`${calSteps} steps`}>
            {calSteps}
          </AppText>
          <AppText color={colors.muted}>steps</AppText>
          <Button label="Done" onPress={finishCalibration} />
          <Button label="Use a typical stride" variant="secondary" onPress={skipCalibration} />
          {__DEV__ ? <Button label="Step forward" variant="ghost" onPress={() => pushSteps(1)} /> : null}
        </View>
      </Screen>
    );
  }

  if (phase === 'walk' && draft) {
    const steps = Math.max(0, floorTrace.length - 1);
    return (
      <Screen padded={false}>
        <View style={{ flex: 1 }}>
          <View style={{ flex: 11 }}>
            <WalkCanvas
              outline={draft.localRing}
              trace={floorTrace}
              nodes={floorNodes}
              heading={heading || draft.lastHeadingDeg}
              floorName={activeFloor?.name || floorName}
              stepCount={steps}
              distanceLabel={formatDistance(traceMetres(floorTrace))}
            />
            {draft.rescaled ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md }}>
                <Notice tone="info">Steps were shortened to fit inside the building.</Notice>
              </View>
            ) : null}
          </View>
          <View style={{ flex: 9 }}>
            {floorAsk ? (
              <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}>
                <AppText weight="700">New floor. Lift or stairs?</AppText>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Chip label="Lift" onPress={() => answerFloor('lift')} />
                  <Chip label="Stairs" onPress={() => answerFloor('stairs')} />
                </View>
              </View>
            ) : null}
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
              {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {TILES.map((tile) => (
                  <Pressable
                    key={tile.kind}
                    accessibilityRole="button"
                    accessibilityLabel={tile.label}
                    onPress={() => openCapture(tile.kind)}
                    style={({ pressed }) => ({
                      flexBasis: '22%',
                      flexGrow: 1,
                      minHeight: 76,
                      borderRadius: radii.md,
                      backgroundColor: tile.wash,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      opacity: pressed ? 0.82 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}>
                    <GlyphIcon name={tile.glyph} color={tile.ink} size={22} />
                    <AppText size={typeScale.caption} weight="700" color={tile.ink}>
                      {tile.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              <Button
                label="I changed floor"
                variant="ghost"
                onPress={() => {
                  const next = draft.activeLevel + 1;
                  setFloorName(next === 0 ? 'Ground' : `Level ${next}`);
                  setFloorAsk({ toLevel: next, heightM: 3.6, hpaDelta: null });
                }}
              />
              {__DEV__ ? <Button label="Step forward" variant="ghost" onPress={() => pushSteps(1)} /> : null}
            </ScrollView>
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
              <Button label="Back at the entrance" onPress={finishWalk} />
            </View>
          </View>
        </View>
        {sheetView}
      </Screen>
    );
  }

  if (phase === 'review' && draft) {
    const summary = [
      `${roomCount} ${roomCount === 1 ? 'room' : 'rooms'}`,
      `${liftCount} ${liftCount === 1 ? 'lift' : 'lifts'}`,
      `${rampCount} ${rampCount === 1 ? 'ramp' : 'ramps'}`,
      formatDistance(traceMetres(draft.trace)),
      formatArea(draft.areaM2),
      `${Math.round(draft.perimeterM).toLocaleString('en-GB')} m perimeter`,
    ];
    return (
      <Screen scroll>
        {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}
        <AppText weight="700" size={typeScale.headline}>
          {draft.buildingName}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {draft.floors.map((floor) => (
            <Chip key={floor.level} label={floor.name} selected={reviewLevel === floor.level} onPress={() => setReviewLevel(floor.level)} />
          ))}
        </View>
        <View style={{ height: 360, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.primaryMuted }}>
          <WalkCanvas
            outline={draft.localRing}
            trace={floorTrace}
            nodes={floorNodes.map((node, index) => ({ ...node, n: index + 1 }))}
            heading={draft.lastHeadingDeg}
            showYou={false}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {summary.map((label) => (
            <View key={label} style={{ borderRadius: radii.pill, backgroundColor: colors.primaryMuted, paddingHorizontal: 12, paddingVertical: 6 }}>
              <AppText size={typeScale.caption} weight="700" color={colors.primary}>
                {label}
              </AppText>
            </View>
          ))}
        </View>
        {floorNodes.map((node, index) => {
          const tone = tileStyle(node.kind);
          return (
            <Pressable
              key={node.id}
              accessibilityRole="button"
              accessibilityLabel={`${node.name}, ${pointLabel(node.kind)}`}
              onPress={() => openEdit(node)}
              style={({ pressed }) => ({
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                opacity: pressed ? 0.85 : 1,
                paddingVertical: 6,
              })}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <AppText weight="700" color={colors.onPrimary} size={typeScale.label}>
                  {index + 1}
                </AppText>
              </View>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: tone.wash, alignItems: 'center', justifyContent: 'center' }}>
                <GlyphIcon name={tone.glyph} color={tone.ink} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="700">{node.name}</AppText>
                <AppText size={typeScale.label} color={colors.muted}>
                  {pointLabel(node.kind)}
                  {node.roomNumber ? ` · ${node.roomNumber}` : ''}
                </AppText>
              </View>
              {node.kind !== 'entrance' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${node.name}`}
                  hitSlop={10}
                  onPress={() => setDraft((current) => (current ? deleteNode(current, node.id) : current))}>
                  <Ionicons name="trash-outline" size={20} color={colors.muted} />
                </Pressable>
              ) : null}
            </Pressable>
          );
        })}
        <Button label={busy ? 'Publishing' : 'Publish'} onPress={() => setConfirmPublish(true)} disabled={busy || draft.nodes.length < 1} />
        {sheetView}
        {confirmView}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}
      {phase === 'place' ? (
        <>
          <AppText color={colors.muted}>Choose the building you are about to walk.</AppText>
          <Field
            label="Building name"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setCode(suggestCode(value));
            }}
            placeholder="College library"
          />
          <Field label="Short code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="CL" />
          <Button label="Start a new building here" icon="locate" haptic="light" onPress={() => void newBuilding()} disabled={busy} />
          <Field label="Search campus buildings" value={query} onChangeText={(value) => void searchBuildings(value)} placeholder="Library" />
          {hits.map((building) => (
            <Card key={building.id}>
              <AppText weight="700">{building.name}</AppText>
              <AppText size={typeScale.label} color={colors.muted}>
                {building.code}
                {footprintCaption(building.area_m2, building.perimeter_m) ? ` · ${footprintCaption(building.area_m2, building.perimeter_m)}` : ''}
              </AppText>
              <Button label="Walk this building" variant="secondary" onPress={() => void chooseExisting(building)} />
            </Card>
          ))}
        </>
      ) : null}
      {phase === 'ready' && setup && readyMetrics ? (
        <>
          <Card>
            <AppText weight="700">{name || setup.name}</AppText>
            <AppText color={colors.muted}>{code || setup.code}</AppText>
            <AppText weight="700" color={colors.primary}>
              {footprintCaption(readyMetrics.areaM2, readyMetrics.perimeterM)}
            </AppText>
          </Card>
          <Field label="Floor you are on" value={floorName} onChangeText={setFloorName} placeholder="Ground" />
          <AppText color={colors.muted}>Stand in a doorway. The entrance snaps to the nearest wall.</AppText>
          {setup.entrances.map((entrance) => (
            <Button key={`${entrance.latitude},${entrance.longitude}`} label={`Start at ${entrance.name}`} variant="secondary" onPress={() => void start(entrance)} />
          ))}
          <Button label="Start here" icon="walk" haptic="success" onPress={() => void start()} disabled={busy} />
        </>
      ) : null}
    </Screen>
  );
}

async function supabaseBuildings(text: string) {
  const rich = await supabase
    .from('buildings')
    .select('id,name,code,description,latitude,longitude,area_m2,perimeter_m,footprint_geojson')
    .or(`name.ilike.%${text}%,code.ilike.%${text}%`)
    .limit(8);
  if (!rich.error) return (rich.data ?? []) as BuildingHit[];
  if (!/area_m2|perimeter_m|footprint_geojson/.test(rich.error.message)) return [];
  const plain = await supabase.from('buildings').select('id,name,code,description,latitude,longitude').or(`name.ilike.%${text}%,code.ilike.%${text}%`).limit(8);
  return (plain.data ?? []) as BuildingHit[];
}
