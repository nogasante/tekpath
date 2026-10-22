import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Accelerometer, Barometer, DeviceMotion, Magnetometer, Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { CampusMap } from '@/components/CampusMap';
import { WalkCanvas } from '@/components/WalkCanvas';
import { FloorPlan } from '@/components/FloorPlan';
import { AppText, Button, Card, Field, Notice, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { createDetector, floorDetectorTuning, verticalAcceleration } from '@/lib/floorDetector';
import { footprintCaption, measureFootprint, ringFromGeoJson, type LngLat } from '@/lib/footprint';
import { haptic } from '@/lib/haptics';
import { fetchBuildingFootprints, type OsmBuilding, type OsmEntrance } from '@/lib/overpass';
import { publishWalk } from '@/lib/publishWalk';
import { calibrateStepLength, smoothHeading } from '@/lib/pdr';
import { useResumeWhenSignedIn } from '@/lib/resumeAuth';
import { supabase } from '@/lib/supabase';
import { campus, spacing, type as typeScale } from '@/lib/theme';
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
} from '@/lib/walkGraph';

const SAVE_KEY = 'tekpath.walkDraft';

type Phase = 'place' | 'outline' | 'ready' | 'walk' | 'review';
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

const captures: { kind: CaptureKind; label: string }[] = [
  { kind: 'room', label: 'Door' },
  { kind: 'junction', label: 'Junction' },
  { kind: 'lift', label: 'Lift' },
  { kind: 'stairs', label: 'Stairs' },
  { kind: 'ramp', label: 'Ramp' },
  { kind: 'toilet', label: 'Toilet' },
  { kind: 'obstacle', label: 'Step' },
  { kind: 'landmark', label: 'Landmark' },
];

export default function WalkScreen() {
  const { colors } = useTheme();
  const { session } = useAppState();
  const [phase, setPhase] = useState<Phase>('place');
  const [draft, setDraft] = useState<WalkDraft | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BuildingHit[]>([]);
  const [buildings, setBuildings] = useState<OsmBuilding[]>([]);
  const [corners, setCorners] = useState<LngLat[]>([]);
  const [floorName, setFloorName] = useState('Ground');
  const [centre, setCentre] = useState<LngLat>({ latitude: campus.latitude, longitude: campus.longitude });
  const [roomNumber, setRoomNumber] = useState('');
  const [landmark, setLandmark] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const [manualSteps, setManualSteps] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [heading, setHeading] = useState(0);
  const [floorAsk, setFloorAsk] = useState<{ toLevel: number; heightM: number; hpaDelta: number | null } | null>(null);
  const [reviewLevel, setReviewLevel] = useState(0);
  const headingRef = useRef(0);
  const draftRef = useRef<WalkDraft | null>(null);
  const stepsRef = useRef(0);
  const calRef = useRef<number | null>(null);
  const pedometerOn = useRef(false);
  draftRef.current = draft;

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
    if (phase !== 'walk') return;
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

    function acceptFloor(toLevel: number, via: 'lift' | 'stairs', rise: number, hpa: number | null) {
      const nameFor = toLevel === 0 ? 'Ground' : `Level ${toLevel}`;
      setDraft((current) => (current ? connectFloors(current, { toLevel, toName: nameFor, via, heightM: rise, hpaDelta: hpa }) : current));
      setFloorName(nameFor);
      void haptic('success');
    }

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
        setManualSteps(!ok);
        if (!ok) {
          setSensorNote('This device has no step counter. Step forward places the next point, or walk on a phone.');
          return;
        }
        setSensorNote(null);
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
        setManualSteps(true);
        setSensorNote('This device has no step counter. Step forward places the next point, or walk on a phone.');
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
        if (!ok || cancelled) return;
        listen(() => {
          Barometer.setUpdateInterval(floorDetectorTuning.sensorIntervalMs);
          return Barometer.addListener(({ pressure }) => {
            const t = Date.now();
            detector.observePressure(t, pressure);
            const sense = detector.sense(t);
            if (!sense.calibrated || sense.level == null || sense.level === level) return;
            const rise = (sense.heightM ?? 0) - heightAt;
            const hpa = pressureAt != null && sense.smoothedPressure != null ? sense.smoothedPressure - pressureAt : null;
            const toLevel = sense.level;
            level = toLevel;
            heightAt = sense.heightM ?? heightAt;
            pressureAt = sense.smoothedPressure;
            if (sense.motion === 'lift' || sense.motion === 'stairs') acceptFloor(toLevel, sense.motion, rise, hpa);
            else setFloorAsk({ toLevel, heightM: rise, hpaDelta: hpa });
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
    stepsRef.current += count;
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
    setError(null);
    setName(building.name);
    setCode(building.code);
    const ring = ringFromGeoJson(building.footprint_geojson);
    if (ring && ring.length >= 4) {
      const measured = measureFootprint(ring);
      setSetup({
        name: building.name,
        code: building.code,
        buildingId: building.id,
        description: building.description || 'Mapped by walking the outline.',
        ring,
        entrances: [],
        floorName,
        here: { latitude: building.latitude, longitude: building.longitude },
      });
      const caption = footprintCaption(measured.areaM2, measured.perimeterM);
      setNote(caption ? `${building.name}. ${caption}.` : building.name);
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
    setError(null);
    setNote(null);
    setCorners([]);
    setCentre({ latitude, longitude });
    setName(buildingName);
    setCode(buildingCode || suggestCode(buildingName));
    try {
      const found = await fetchBuildingFootprints(latitude, longitude, 55);
      setBuildings(found);
      if (!found.length) setNote('OpenStreetMap has no outline here. Tap the corners on the map.');
      setSetup({
        name: buildingName,
        code: buildingCode || suggestCode(buildingName),
        buildingId,
        description: 'Mapped by walking the outline.',
        ring: found[0]?.ring ?? [],
        entrances: found[0]?.entrances ?? [],
        floorName,
        here: { latitude, longitude },
      });
      setPhase('outline');
    } catch (lookupError) {
      setBuildings([]);
      setError(lookupError instanceof Error ? lookupError.message : 'OpenStreetMap could not be reached. Tap the corners on the map.');
      setPhase('outline');
    }
  }

  async function newBuilding() {
    setBusy(true);
    setError(null);
    const located = await locate();
    const point = located ?? { latitude: campus.latitude, longitude: campus.longitude };
    if (!located) setNote('Location is unavailable. The search is centred on campus.');
    try {
      await lookUp(point.latitude, point.longitude, name.trim() || 'New building', code.trim() || suggestCode(name || 'New building'), null);
    } finally {
      setBusy(false);
    }
  }

  function useBuilding(building: OsmBuilding) {
    const measured = measureFootprint(building.ring);
    const next: Setup = {
      name: name.trim() || building.name || 'New building',
      code: code.trim() || suggestCode(name || building.name || 'New building'),
      buildingId: setup?.buildingId ?? null,
      description: 'Mapped by walking the outline.',
      ring: building.ring,
      entrances: building.entrances,
      floorName,
      here: setup?.here ?? null,
    };
    setSetup(next);
    const caption = footprintCaption(measured.areaM2, measured.perimeterM);
    setNote(caption ? `${next.name}. ${caption}.` : next.name);
    setPhase('ready');
  }

  function useCorners() {
    if (corners.length < 3) {
      setError('Tap at least three corners.');
      return;
    }
    const measured = measureFootprint(corners);
    if (!Number.isFinite(measured.areaM2) || measured.areaM2 < 4) {
      setError('That outline is too small. Tap the corners further apart.');
      return;
    }
    const next: Setup = {
      name: name.trim() || 'New building',
      code: (code.trim() || suggestCode(name || 'New building')).toUpperCase(),
      buildingId: setup?.buildingId ?? null,
      description: 'Outline traced on the map.',
      ring: corners,
      entrances: [],
      floorName,
      here: setup?.here ?? centre,
    };
    setSetup(next);
    setError(null);
    const caption = footprintCaption(measured.areaM2, measured.perimeterM);
    setNote(caption ? `${next.name}. ${caption}.` : next.name);
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
      setError('Choose an outline first.');
      return;
    }
    setBusy(true);
    setError(null);
    let point = entrance ?? (await locate(3000)) ?? setup.here;
    if (!point) {
      point = setup.ring[0];
      setNote('No GPS fix. The entrance is snapped to the outline from the first corner.');
    }
    let next: WalkDraft;
    try {
      next = createDraft({
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
      setDraft({ ...next, stage: 'walking' });
      setPhase('walk');
      void haptic('success');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Could not start the walk.');
    } finally {
      setBusy(false);
    }
  }

  function drop(kind: CaptureKind) {
    setDraft((current) => {
      if (!current) return current;
      return addCapture(current, {
        kind,
        roomNumber: kind === 'room' ? roomNumber : null,
        landmark: kind === 'landmark' ? landmark : null,
        photoUri,
        floorName,
      });
    });
    setPhotoUri(null);
    if (kind === 'room') setRoomNumber('');
    void haptic('light');
  }

  async function attachPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.5 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  function finishCalibration() {
    if (!calibrating || calRef.current == null) {
      calRef.current = stepsRef.current;
      setCalibrating(true);
      setNote('Walk 10 metres, then tap again.');
      return;
    }
    const steps = stepsRef.current - calRef.current;
    calRef.current = null;
    setCalibrating(false);
    const length = calibrateStepLength(steps, 10);
    if (length == null) {
      setNote('Need at least two steps over those 10 metres.');
      return;
    }
    setDraft((current) => (current ? { ...current, stepLengthM: length } : current));
    setNote(`Step length set to ${length.toFixed(2)} m.`);
  }

  function answerFloor(via: 'lift' | 'stairs') {
    if (!floorAsk) return;
    setDraft((current) =>
      current
        ? connectFloors(current, {
            toLevel: floorAsk.toLevel,
            toName: floorName.trim() || (floorAsk.toLevel === 0 ? 'Ground' : `Level ${floorAsk.toLevel}`),
            via,
            heightM: floorAsk.heightM,
            hpaDelta: floorAsk.hpaDelta,
          })
        : current,
    );
    setFloorAsk(null);
  }

  async function publish() {
    const current = draftRef.current;
    if (!current) return;
    if (!session) {
      armPublish(true);
      router.push({ pathname: '/login', params: { next: '/walk' } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await publishWalk(current, session.user.id);
      await AsyncStorage.removeItem(SAVE_KEY);
      setNote(result.warning || 'Published. The router can use this building now.');
      void haptic('success');
      router.replace('/');
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  }
  publishRef.current = () => {
    void publish();
  };

  const readyMetrics = setup?.ring?.length ? measureFootprint(setup.ring) : null;
  const activeFloor = draft?.floors.find((floor) => floor.level === (phase === 'review' ? reviewLevel : draft.activeLevel));

  return (
    <Screen scroll>
      {note ? <Notice tone="good">{note}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {draft?.rescaled ? (
        <Notice tone="info">Step length was shortened so a straight walk fits inside the building.</Notice>
      ) : null}

      {phase === 'place' ? (
        <>
          <AppText color={colors.muted}>
            Pick a building, or start a new one where you are standing. The outline from OpenStreetMap frames the walk.
          </AppText>
          <Field label="Building name" value={name} onChangeText={(value) => { setName(value); setCode(suggestCode(value)); }} placeholder="College library" />
          <Field label="Short code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="CL" />
          <Button label="New building at my location" icon="locate" haptic="light" onPress={() => void newBuilding()} disabled={busy} />
          <Field label="Find an existing building" value={query} onChangeText={(value) => void searchBuildings(value)} placeholder="Engineering" />
          {hits.map((building) => (
            <Card key={building.id}>
              <AppText weight="700">{building.name}</AppText>
              <AppText size={typeScale.label} color={colors.muted}>
                {building.code}
                {footprintCaption(building.area_m2, building.perimeter_m) ? ` · ${footprintCaption(building.area_m2, building.perimeter_m)}` : ''}
              </AppText>
              <Button label="Use this building" variant="secondary" onPress={() => void chooseExisting(building)} />
            </Card>
          ))}
        </>
      ) : null}

      {phase === 'outline' ? (
        <>
          <AppText weight="700" accessibilityRole="header">
            Building outline
          </AppText>
          <AppText color={colors.muted}>
            {buildings.length ? 'Choose the OpenStreetMap outline, or tap the corners yourself.' : 'Tap each corner of the building on the map.'}
          </AppText>
          <View style={{ height: 300, borderRadius: 18, overflow: 'hidden' }}>
            <CampusMap
              features={[]}
              onSelect={() => undefined}
              polygon={corners.length >= 3 ? corners : buildings[0]?.ring}
              focus={centre}
              onMapPress={(coord) => setCorners((current) => [...current, coord])}
              padding={{ top: 16, right: 16, bottom: 16, left: 16 }}
            />
          </View>
          {buildings.map((building) => (
            <Card key={building.id}>
              <AppText weight="700">{building.name || 'Unnamed building'}</AppText>
              <AppText color={colors.primary}>{footprintCaption(building.areaM2, building.perimeterM)}</AppText>
              {building.entrances.length ? (
                <AppText size={typeScale.label} color={colors.muted}>
                  Entrances: {building.entrances.map((entrance) => entrance.name).join(', ')}
                </AppText>
              ) : null}
              <Button label="Use this outline" onPress={() => useBuilding(building)} />
            </Card>
          ))}
          <AppText size={typeScale.label} color={colors.muted}>
            {corners.length ? `${corners.length} corner${corners.length === 1 ? '' : 's'} tapped.` : 'No corners tapped yet.'}
          </AppText>
          {corners.length >= 3 ? <AppText color={colors.primary}>{footprintCaption(measureFootprint(corners).areaM2, measureFootprint(corners).perimeterM)}</AppText> : null}
          <Button label="Undo corner" variant="secondary" onPress={() => setCorners((current) => current.slice(0, -1))} disabled={!corners.length} />
          <Button label="Use the tapped corners" onPress={useCorners} disabled={corners.length < 3} />
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
          <AppText color={colors.muted}>Stand at a door and start. The entrance snaps to the nearest wall.</AppText>
          {setup.entrances.map((entrance) => (
            <Button key={`${entrance.latitude},${entrance.longitude}`} label={`Entrance: ${entrance.name}`} variant="secondary" onPress={() => void start(entrance)} />
          ))}
          <Button label="Start here (entrance)" icon="walk" haptic="success" onPress={() => void start()} disabled={busy} />
        </>
      ) : null}

      {phase === 'walk' && draft ? (
        <>
          <WalkCanvas outline={draft.localRing} trace={draft.trace.filter((point) => point.floorLevel === draft.activeLevel)} nodes={draft.nodes.filter((node) => node.floorLevel === draft.activeLevel)} heading={heading || draft.lastHeadingDeg} />
          <AppText weight="700">
            {activeFloor?.name || floorName} · {Math.max(0, draft.trace.length - 1)} steps · {draft.stepLengthM.toFixed(2)} m
          </AppText>
          {sensorNote ? <Notice>{sensorNote}</Notice> : null}
          {floorAsk ? (
            <Card>
              <AppText weight="700">Did you take the lift or the stairs?</AppText>
              <Field label="Floor name" value={floorName} onChangeText={setFloorName} />
              <Button label="Lift" onPress={() => answerFloor('lift')} />
              <Button label="Stairs" variant="secondary" onPress={() => answerFloor('stairs')} />
            </Card>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Shorter step" variant="secondary" style={{ flex: 1 }} onPress={() => setDraft((current) => (current ? { ...current, stepLengthM: Math.max(0.3, Math.round((current.stepLengthM - 0.05) * 100) / 100) } : current))} />
            <Button label="Longer step" variant="secondary" style={{ flex: 1 }} onPress={() => setDraft((current) => (current ? { ...current, stepLengthM: Math.min(1.2, Math.round((current.stepLengthM + 0.05) * 100) / 100) } : current))} />
          </View>
          <Button label={calibrating ? 'That was 10 m' : 'Calibrate over 10 m'} variant="secondary" onPress={finishCalibration} />
          {manualSteps ? <Button label="Step forward" variant="secondary" onPress={() => pushSteps(1)} /> : null}
          <Field label="Room number" value={roomNumber} onChangeText={setRoomNumber} placeholder="201" />
          <Field label="Landmark note" value={landmark} onChangeText={setLandmark} placeholder="Past the noticeboard" />
          <Button label={photoUri ? 'Photo added to the next point' : 'Add a photo'} variant="secondary" onPress={() => void attachPhoto()} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {captures.map((item) => (
              <Button key={item.kind} label={item.label} variant="secondary" style={{ flexBasis: '47%', flexGrow: 1 }} onPress={() => drop(item.kind)} accessibilityHint={`Drop a ${item.label.toLowerCase()} at your position`} />
            ))}
          </View>
          <Button label="I changed floor" variant="secondary" onPress={() => setFloorAsk({ toLevel: draft.activeLevel + 1, heightM: 0, hpaDelta: null })} />
          <Button
            label="Back at the entrance"
            onPress={() => {
              const closed = closeWalk(draft);
              setDraft(closed);
              setReviewLevel(closed.floors[0]?.level ?? 0);
              setPhase('review');
            }}
          />
        </>
      ) : null}

      {phase === 'review' && draft ? (
        <>
          <Card>
            <AppText weight="700">{draft.buildingName}</AppText>
            <AppText color={colors.muted}>{draft.buildingCode}</AppText>
            <AppText weight="700" color={colors.primary}>
              {footprintCaption(draft.areaM2, draft.perimeterM)}
            </AppText>
          </Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {draft.floors.map((floor) => (
              <Button key={floor.level} label={floor.name} variant={reviewLevel === floor.level ? 'primary' : 'secondary'} onPress={() => setReviewLevel(floor.level)} />
            ))}
          </View>
          <FloorPlan
            rooms={[]}
            metres
            outline={draft.localRing}
            route={draft.trace.filter((point) => point.floorLevel === reviewLevel)}
            planX={draft.nodes.find((node) => node.floorLevel === reviewLevel)?.x}
            planY={draft.nodes.find((node) => node.floorLevel === reviewLevel)?.y}
          />
          {draft.nodes
            .filter((node) => node.floorLevel === reviewLevel)
            .map((node) => (
              <Card key={node.id}>
                <AppText weight="700">{node.name}</AppText>
                <AppText size={typeScale.label} color={colors.muted}>
                  {node.kind}
                  {node.roomNumber ? ` · Room ${node.roomNumber}` : ''}
                </AppText>
                <Field label={`Point name ${node.id}`} value={node.name} onChangeText={(value) => setDraft((current) => (current ? updateNode(current, node.id, { name: value }) : current))} />
                {node.kind === 'room' ? (
                  <Field label="Room number" value={node.roomNumber ?? ''} onChangeText={(value) => setDraft((current) => (current ? updateNode(current, node.id, { roomNumber: value }) : current))} />
                ) : null}
                {node.kind !== 'entrance' ? <Button label="Delete point" variant="danger" onPress={() => setDraft((current) => (current ? deleteNode(current, node.id) : current))} /> : null}
              </Card>
            ))}
          <Button label={busy ? 'Publishing' : 'Publish'} onPress={() => void publish()} disabled={busy || draft.nodes.length < 1} />
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
