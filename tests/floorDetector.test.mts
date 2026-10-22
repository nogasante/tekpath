import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createDetector,
  verticalAcceleration,
  type FloorDetector,
  type FloorSense,
} from '../lib/floorDetector.ts';

const floorHeightM = 3.6;
const hpaPerM = 0.12;
const building = { floorHeightM, hpaPerM };
const groundPressure = 1013.25;

type Row = FloorSense & { t: number };

function play(
  detector: FloorDetector,
  samples: { t: number; pressure?: number; accel?: number }[],
): Row[] {
  const rows: Row[] = [];
  for (const sample of samples) {
    if (sample.accel != null) detector.observeMotion(sample.t, sample.accel);
    if (sample.pressure != null) detector.observePressure(sample.t, sample.pressure);
    rows.push({ t: sample.t, ...detector.sense(sample.t) });
  }
  return rows;
}

function assertNoFlicker(rows: Row[]) {
  for (let i = 1; i < rows.length; i += 1) {
    const previous = rows[i - 1].level ?? 0;
    const level = rows[i].level ?? 0;
    assert.ok(level >= previous, `floor flickered from ${previous} to ${level} at ${rows[i].t}`);
  }
}

function firstAt(rows: Row[], level: number) {
  return rows.find((row) => row.calibrated && row.level === level)?.t ?? null;
}

test('vertical acceleration is positive upward and optional', () => {
  assert.equal(verticalAcceleration(null, { x: 0, y: 0, z: 9.8 }), null);
  assert.equal(verticalAcceleration({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0.2 }), null);
  assert.equal(verticalAcceleration({ x: 0, y: 0, z: 1.5 }, { x: 0, y: 0, z: 9.8 }), 1.5);
  assert.equal(verticalAcceleration({ x: 0, y: 0, z: -0.8 }, { x: 0, y: 0, z: 9.8 }), -0.8);
  const tilted = verticalAcceleration({ x: 0, y: 2, z: 0 }, { x: 0, y: 9.8, z: 0 });
  assert.equal(tilted, 2);
});

test('calibration uses the median, so one gust does not set the baseline', () => {
  const detector = createDetector(building);
  detector.arm(0, 0, building);
  for (let t = 0; t <= 2400; t += 300) {
    detector.observePressure(t, t === 900 ? 1025 : groundPressure);
    detector.observeMotion(t, 0.02);
  }
  const early = detector.sense(2400);
  assert.equal(early.calibrated, false);
  assert.equal(early.confidence, 0.25);
  const locked = detector.sense(2500);
  assert.equal(locked.calibrated, true);
  assert.equal(locked.level, 0);
  assert.ok(locked.heightM != null && Math.abs(locked.heightM) < 0.05);
});

test('a lift ride up two floors commits, and motion commits sooner than pressure alone', () => {
  const t0 = 1_000_000;
  const depart = t0 + 4000;
  const arrive = depart + 6000;
  const end = arrive + 15000;
  const dest = groundPressure - 2 * floorHeightM * hpaPerM;
  const samples = [];
  for (let t = t0; t <= end; t += 300) {
    let pressure = groundPressure;
    if (t >= arrive) pressure = dest;
    else if (t > depart) {
      pressure = groundPressure + (dest - groundPressure) * ((t - depart) / (arrive - depart));
    }
    let accel = ((Math.round(t / 300) % 5) - 2) * 0.004;
    if (t >= depart && t < depart + 900) accel = 0.8;
    else if (t >= arrive - 900 && t < arrive) accel = -0.8;
    samples.push({ t, pressure, accel });
  }

  const motionDetector = createDetector(building);
  motionDetector.arm(t0, 0, building);
  const withMotion = play(motionDetector, samples);
  const pressureDetector = createDetector(building);
  pressureDetector.arm(t0, 0, building);
  const pressureOnly = play(
    pressureDetector,
    samples.map(({ t, pressure }) => ({ t, pressure })),
  );

  for (const rows of [withMotion, pressureOnly]) {
    assert.equal(rows.at(-1)?.level, 2);
    assert.equal(rows.at(-1)?.calibrated, true);
    assertNoFlicker(rows);
    assert.ok(rows.some((row) => row.t < depart && row.calibrated && row.level === 0));
    assert.ok(!rows.some((row) => (row.level ?? 0) > 2));
  }

  assert.ok(withMotion.some((row) => row.motion === 'lift'));
  assert.ok(pressureOnly.every((row) => row.motion === 'unknown'));
  const liftedAt = firstAt(withMotion, 2);
  const pressureAt = firstAt(pressureOnly, 2);
  assert.ok(liftedAt != null && pressureAt != null);
  assert.ok(liftedAt < pressureAt, `lift commit ${liftedAt} was not sooner than pressure ${pressureAt}`);
  const riding = withMotion.find((row) => row.motion === 'lift' && row.level === 2);
  assert.equal(riding?.confidence, 0.92);
});

test('stair steps commit one floor and are not treated as a stationary gust', () => {
  const t0 = 2_000_000;
  const climbStart = t0 + 4000;
  const climbEnd = climbStart + 14000;
  const end = climbEnd + 10000;
  const dest = groundPressure - floorHeightM * hpaPerM;
  const samples = [];
  for (let t = t0; t <= end; t += 200) {
    let pressure = groundPressure;
    if (t >= climbEnd) pressure = dest;
    else if (t > climbStart) {
      pressure = groundPressure + (dest - groundPressure) * ((t - climbStart) / (climbEnd - climbStart));
    }
    const into = t - climbStart;
    const stepping = t >= climbStart && t < climbEnd && into % 600 < 200;
    samples.push({ t, pressure, accel: stepping ? 1.8 : 0.02 });
  }
  const detector = createDetector(building);
  detector.arm(t0, 0, building);
  const rows = play(detector, samples);
  assert.equal(rows.at(-1)?.level, 1);
  assertNoFlicker(rows);
  assert.ok(rows.some((row) => row.motion === 'stairs'));
  assert.ok(!rows.some((row) => (row.level ?? 0) >= 2));
  assert.ok((rows.at(-1)?.confidence ?? 0) >= 0.8);
});

test('a pressure gust while the phone is still does not change the floor', () => {
  const t0 = 3_000_000;
  const gustStart = t0 + 5000;
  const gustEnd = gustStart + 15000;
  const samples = [];
  for (let t = t0; t <= gustEnd + 2000; t += 300) {
    const gusting = t >= gustStart && t < gustEnd;
    const wobble = Math.round(t / 300) % 2 === 0 ? 0.02 : -0.02;
    samples.push({
      t,
      pressure: gusting ? groundPressure - 0.55 + wobble : groundPressure,
      accel: 0.02,
    });
  }
  const detector = createDetector(building);
  detector.arm(t0, 0, building);
  const rows = play(detector, samples);
  assert.ok(rows.every((row) => row.level === 0));
  const held = rows.filter((row) => row.t >= gustStart + 5000 && row.t <= gustEnd - 500);
  assert.ok(held.length > 5);
  assert.ok(held.every((row) => row.motion === 'still'));
  assert.ok(held.every((row) => (row.heightM ?? 0) > floorHeightM * 0.6));
  assert.ok(held.every((row) => row.confidence <= 0.5));
  const above = held.filter((row) => (row.heightM ?? 0) > floorHeightM * 0.6);
  const span = above[above.length - 1].t - above[0].t;
  assert.ok(span > 3000, `gust only stayed past the threshold for ${span} ms`);
});

test('slow weather drift over 20 minutes stays on the anchor floor and asks for a fresh anchor', () => {
  const t0 = 4_000_000;
  const duration = 20 * 60 * 1000;
  const samples = [];
  for (let t = t0; t <= t0 + duration; t += 400) {
    const fallen = ((t - t0) / duration) * 1;
    samples.push({ t, pressure: groundPressure - fallen, accel: 0.015 });
  }
  const detector = createDetector(building);
  detector.arm(t0, 0, building);
  const rows = play(detector, samples);
  const lock = rows.find((row) => row.calibrated);
  assert.ok(lock);
  const at = (delay: number) => rows.find((row) => row.t >= lock.t + delay);
  const ten = at(10 * 60 * 1000);
  const fifteen = at(15 * 60 * 1000);
  const end = rows.at(-1);
  assert.equal(ten?.level, 0);
  assert.equal(ten?.needsRecalibration, false);
  assert.equal(fifteen?.needsRecalibration, true);
  assert.equal(fifteen?.level, 0);
  assert.equal(end?.level, 0);
  assert.equal(end?.needsRecalibration, true);
  assert.ok((end?.confidence ?? 1) <= 0.45);
  for (const row of rows) {
    if (!row.calibrated || row.heightM == null) continue;
    assert.ok(Math.abs(row.heightM) < 0.5, `height drifted to ${row.heightM} at ${row.t}`);
  }

  const anchoredAt = t0 + duration;
  detector.anchorFloor(anchoredAt, 1);
  const anchored = detector.sense(anchoredAt);
  assert.equal(anchored.level, 1);
  assert.equal(anchored.needsRecalibration, false);
  assert.ok(anchored.heightM != null && Math.abs(anchored.heightM) < 0.2);
});

test('confirming the current floor re-anchors and does not immediately climb again', () => {
  const t0 = 5_000_000;
  const dest = groundPressure - floorHeightM * hpaPerM;
  const detector = createDetector(building);
  detector.arm(t0, 0, building);
  const samples = [];
  for (let t = t0; t <= t0 + 8000; t += 300) {
    samples.push({ t, pressure: t < t0 + 4000 ? groundPressure : dest });
  }
  play(detector, samples);
  detector.anchorFloor(t0 + 8000, 1);
  const here = detector.sense(t0 + 8000);
  assert.equal(here.level, 1);
  assert.ok(here.heightM != null && Math.abs(here.heightM) < 0.25);
  for (let t = t0 + 8300; t <= t0 + 16000; t += 300) {
    detector.observePressure(t, dest);
  }
  const later = detector.sense(t0 + 16000);
  assert.equal(later.level, 1);
  assert.ok(later.heightM != null && Math.abs(later.heightM) < 0.25);
});
