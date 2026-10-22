import assert from 'node:assert/strict';
import test from 'node:test';

import { footprintsNear } from '../lib/campusFootprints.ts';
import { containsPoint, dominantAxisDeg, measureFootprint, nearestOnOutline, snapToOutline, toLngLat, type LngLat, type XY } from '../lib/footprint.ts';
import { parseOverpass } from '../lib/overpass.ts';
import { calibrateStepLength, closeLoop, detectSteps, integrateTrace, smoothHeading, snapHeading, straighten } from '../lib/pdr.ts';
import { addCapture, appendWalkStep, buildPublishPlan, closeWalk, connectFloors, createDraft, deleteNode } from '../lib/walkGraph.ts';

const origin: LngLat = { latitude: 6.6745, longitude: -1.5716 };

function rect(width: number, height: number, at: LngLat = origin): LngLat[] {
  return [
    at,
    toLngLat(at, { x: width, y: 0 }),
    toLngLat(at, { x: width, y: height }),
    toLngLat(at, { x: 0, y: height }),
  ];
}

function localRect(width: number, height: number): XY[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

test('footprint area, perimeter, and dominant east-west axis', () => {
  const ring = rect(20, 10);
  const measured = measureFootprint(ring);
  assert.ok(Math.abs(measured.areaM2 - 200) < 0.5, `area ${measured.areaM2}`);
  assert.ok(Math.abs(measured.perimeterM - 60) < 0.5, `perimeter ${measured.perimeterM}`);
  assert.equal(dominantAxisDeg(localRect(30, 8)), 90);
});

test('entrance snaps to the nearest outline edge', () => {
  const ring = localRect(20, 10);
  const snapped = snapToOutline({ x: 3, y: 4 }, ring);
  assert.ok(Math.abs(snapped.point.x) < 1e-6);
  assert.ok(Math.abs(snapped.point.y - 4) < 1e-6);
  assert.equal(snapped.edgeIndex, 3);
  const geographic = nearestOnOutline({ x: 3, y: 4 }, ring);
  assert.equal(geographic.distance, 3);
});

test('a trace that drifts outside the footprint is clamped back inside', () => {
  const ring = localRect(20, 12);
  const drifted = integrateTrace({
    headingsDeg: Array(20).fill(90),
    stepLengthM: 0.7,
    ring,
    axisDeg: 90,
    snapToleranceDeg: 5,
    origin: { x: 18, y: 6 },
  });
  for (const point of drifted.trace) {
    assert.equal(containsPoint(point, ring, 0.05), true, `${point.x},${point.y}`);
  }
  const outside = drifted.trace.some((point, index) => index > 0 && point.x <= 20 + 1e-6);
  assert.equal(outside, true);
  assert.ok(Math.max(...drifted.trace.map((point) => point.x)) <= 20 + 1e-6);
});

test('a straight corridor longer than the building rescales the step length', () => {
  const ring = localRect(8, 5);
  const walked = integrateTrace({
    headingsDeg: Array(20).fill(90),
    stepLengthM: 0.7,
    ring,
    axisDeg: 90,
    snapToleranceDeg: 5,
  });
  const maxX = Math.max(...walked.trace.map((point) => point.x));
  assert.ok(maxX <= 8 + 0.05, `extent ${maxX}`);
  assert.equal(walked.rescaled, true);
  assert.ok(walked.stepLengthM < 0.7);
  for (const point of walked.trace) assert.equal(containsPoint(point, ring, 0.05), true);
});

test('heading snaps to the footprint axis and a drifted square loop closes', () => {
  assert.equal(snapHeading(98, 90, 15), 90);
  assert.equal(snapHeading(8, 90, 15), 0);
  const side = 8;
  const raw = integrateTrace({
    headingsDeg: [...Array(side).fill(98), ...Array(side).fill(8), ...Array(side).fill(278), ...Array(side).fill(188)],
    stepLengthM: 0.7,
    snapToleranceDeg: 0,
  });
  const drifted = raw.trace.map((point, index) => ({ x: point.x + index * 0.08, y: point.y + index * 0.03 }));
  const endGap = Math.hypot(drifted[drifted.length - 1].x - drifted[0].x, drifted[drifted.length - 1].y - drifted[0].y);
  assert.ok(endGap > 1);
  const closed = closeLoop(drifted);
  const closedGap = Math.hypot(closed[closed.length - 1].x - closed[0].x, closed[closed.length - 1].y - closed[0].y);
  assert.ok(closedGap < 1e-6);
  const mid = Math.floor((drifted.length - 1) / 2);
  const share = mid / (drifted.length - 1);
  assert.ok(Math.abs(closed[mid].x - (drifted[mid].x + (drifted[0].x - drifted[drifted.length - 1].x) * share)) < 1e-6);

  const straight = straighten(raw.trace, 90, 15);
  for (let i = 1; i < straight.length; i += 1) {
    const dx = straight[i].x - straight[i - 1].x;
    const dy = straight[i].y - straight[i - 1].y;
    if (Math.hypot(dx, dy) < 1e-6) continue;
    const heading = (Math.atan2(dx, dy) * 180) / Math.PI;
    const folded = ((heading % 360) + 360) % 360;
    const off = Math.min(folded, Math.abs(folded - 90), Math.abs(folded - 180), Math.abs(folded - 270), Math.abs(folded - 360));
    assert.ok(off < 1, `heading ${folded}`);
  }
});

test('step length calibration and step peaks', () => {
  assert.equal(calibrateStepLength(14, 10), 0.71);
  assert.equal(calibrateStepLength(1, 10), null);
  const smoothed = smoothHeading(10, 40, 0.5);
  assert.ok(smoothed > 20 && smoothed < 30);
  const peaks = detectSteps(
    [
      { t: 0, value: 0.2 },
      { t: 100, value: 1.6 },
      { t: 200, value: 0.2 },
      { t: 500, value: 1.8 },
      { t: 600, value: 0.1 },
      { t: 700, value: 1.5 },
      { t: 800, value: 0.2 },
    ],
    { threshold: 1.2, minGapMs: 300 },
  );
  assert.deepEqual(peaks, [100, 500]);
});

test('a corridor walk records rooms on the trace', () => {
  let draft = createDraft({
    buildingName: 'Engineering Lecture Block',
    ring: rect(40, 16),
    entrance: origin,
    headingDeg: 90,
    floorName: 'Ground',
  });
  assert.equal(draft.nodes[0].kind, 'entrance');
  assert.ok(Math.abs(draft.nodes[0].x) < 1e-6);
  for (let i = 0; i < 6; i += 1) draft = appendWalkStep(draft, 90);
  draft = addCapture(draft, { kind: 'room', roomNumber: '101', name: 'Lecture Theatre 101' });
  for (let i = 0; i < 4; i += 1) draft = appendWalkStep(draft, 90);
  draft = addCapture(draft, { kind: 'junction', name: 'Corridor' });
  draft = addCapture(draft, { kind: 'room', roomNumber: '102' });
  draft = addCapture(draft, { kind: 'obstacle', name: 'Single step' });
  const rooms = draft.nodes.filter((node) => node.kind === 'room');
  assert.equal(rooms.length, 2);
  assert.equal(rooms[0].roomNumber, '101');
  assert.equal(rooms[1].name, 'Room 102');
  const edges = draft.edges;
  assert.equal(edges.length, 4);
  assert.ok(edges.every((edge) => edge.lengthM > 0));
  assert.equal(edges[edges.length - 1].stepFree, false);
  assert.match(edges[edges.length - 1].instruction, /step/i);
  const plan = buildPublishPlan(draft, (node) => `TP-${node.id}`);
  assert.equal(plan.building?.code, 'ELB');
  assert.ok((plan.building?.area_m2 ?? 0) > 600);
  assert.equal(plan.nodes.find((node) => node.name === 'Lecture Theatre 101')?.room_number, '101');
  assert.equal(plan.nodes.find((node) => node.type === 'obstacle')?.step_free, false);
  const door = plan.nodes.find((node) => node.room_number === '101');
  assert.ok(door && door.longitude > draft.entrance.longitude);
});

test('a two-floor walk via a lift records a step-free vertical edge and the measured rise', () => {
  let draft = createDraft({
    buildingName: 'College Library',
    ring: rect(30, 20),
    entrance: origin,
    floorName: 'Ground',
  });
  for (let i = 0; i < 4; i += 1) draft = appendWalkStep(draft, 0);
  draft = addCapture(draft, { kind: 'lift', name: 'Lift A' });
  draft = connectFloors(draft, { toLevel: 1, toName: 'Level 1', via: 'lift', heightM: 3.6, hpaDelta: -0.432 });
  const liftEdge = draft.edges.find((edge) => edge.type === 'lift');
  assert.ok(liftEdge);
  assert.equal(liftEdge?.stepFree, true);
  assert.equal(liftEdge?.lengthM, 3.6);
  assert.match(liftEdge?.instruction ?? '', /Lift A to Level 1/);
  const upper = draft.floors.find((floor) => floor.level === 1);
  assert.equal(upper?.floorHeightM, 3.6);
  assert.ok(Math.abs((upper?.hpaPerM ?? 0) - 0.12) < 0.001);
  assert.equal(draft.activeLevel, 1);
  draft = addCapture(draft, { kind: 'room', roomNumber: '201' });
  assert.equal(draft.nodes.filter((node) => node.floorLevel === 1 && node.kind === 'room').length, 1);

  let stairs = createDraft({ buildingName: 'Block', ring: rect(20, 12), entrance: origin });
  stairs = connectFloors(stairs, { toLevel: 1, toName: 'Level 1', via: 'stairs', heightM: 3.4, hpaDelta: -0.4 });
  const stairEdge = stairs.edges.find((edge) => edge.type === 'stairs');
  assert.equal(stairEdge?.stepFree, false);
  assert.match(stairEdge?.instruction ?? '', /stairs/i);
});

test('closing a drifted walk returns to the entrance and keeps the trace inside', () => {
  let draft = createDraft({
    buildingName: 'Square Hall',
    ring: rect(40, 40),
    entrance: origin,
    headingDeg: 90,
  });
  const side = 6;
  for (const heading of [98, 8, 278, 188]) {
    for (let i = 0; i < side; i += 1) draft = appendWalkStep(draft, heading);
  }
  const drifted = draft.trace.map((point, index) => ({ ...point, x: point.x + index * 0.15, y: point.y - index * 0.04 }));
  const open = Math.hypot(drifted[drifted.length - 1].x, drifted[drifted.length - 1].y);
  assert.ok(open > 1);
  const closed = closeWalk({ ...draft, trace: drifted });
  const back = closed.trace[closed.trace.length - 1];
  assert.ok(Math.hypot(back.x - closed.trace[0].x, back.y - closed.trace[0].y) < 1e-6);
  for (const point of closed.trace) assert.equal(containsPoint(point, closed.localRing, 0.08), true);
  assert.equal(closed.stage, 'review');
  const kept = deleteNode(closed, closed.nodes[0].id);
  assert.equal(kept.nodes[0].kind, 'entrance');
});

test('OSM entrances on the outline are offered with the building', () => {
  const ring = rect(25, 15);
  const door = toLngLat(origin, { x: 12, y: 0 });
  const parsed = parseOverpass(
    {
      elements: [
        {
          type: 'way',
          id: 42,
          tags: { building: 'university', name: 'Great Hall' },
          geometry: [...ring, ring[0]].map((point) => ({ lat: point.latitude, lon: point.longitude })),
        },
        { type: 'node', id: 7, lat: door.latitude, lon: door.longitude, tags: { entrance: 'yes', name: 'North door' } },
        { type: 'node', id: 8, lat: origin.latitude + 0.01, lon: origin.longitude, tags: { entrance: 'yes' } },
      ],
    },
    origin,
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Great Hall');
  assert.ok(parsed[0].areaM2 > 300);
  assert.equal(parsed[0].entrances.length, 1);
  assert.equal(parsed[0].entrances[0].name, 'North door');
});

test('saved KNUST outlines resolve without a network call', () => {
  const library = footprintsNear(6.675352, -1.573008, 40);
  assert.ok(library.some((building) => building.name === 'Prempeh II Library'));
  assert.equal(footprintsNear(0, 0, 40).length, 0);
});
