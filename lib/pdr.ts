/**
 * Pedestrian dead reckoning in local metres.
 * Heading is compass degrees: 0 is north, 90 is east.
 * Positions are x east, y north.
 */

import {
  angleDelta,
  buildingExtents,
  clampToPolygon,
  dominantAxisDeg,
  normDeg,
  type XY,
} from '@/lib/footprint';

export const DEFAULT_STEP_LENGTH_M = 0.7;

export function smoothHeading(previous: number | null, next: number, alpha = 0.35) {
  if (!Number.isFinite(next)) return previous ?? 0;
  if (previous == null || !Number.isFinite(previous)) return normDeg(next);
  const weight = Math.min(1, Math.max(0, alpha));
  const prev = (normDeg(previous) * Math.PI) / 180;
  const incoming = (normDeg(next) * Math.PI) / 180;
  const x = (1 - weight) * Math.sin(prev) + weight * Math.sin(incoming);
  const y = (1 - weight) * Math.cos(prev) + weight * Math.cos(incoming);
  if (Math.hypot(x, y) < 1e-6) return normDeg(next);
  return normDeg((Math.atan2(x, y) * 180) / Math.PI);
}

/** Step length from a walked known distance, usually 10 m. Clamped to a human range. */
export function calibrateStepLength(stepCount: number, knownDistanceM: number) {
  if (!(stepCount >= 2) || !(knownDistanceM > 0)) return null;
  const length = knownDistanceM / stepCount;
  if (!Number.isFinite(length)) return null;
  return Math.round(Math.min(1.2, Math.max(0.3, length)) * 100) / 100;
}

/** Snap to the footprint's main axis or the axis 90° from it, when close enough. */
export function snapHeading(headingDeg: number, axisDeg: number, toleranceDeg = 20) {
  const heading = normDeg(headingDeg);
  const targets = [0, 90, 180, 270].map((turn) => normDeg(axisDeg + turn));
  let best = heading;
  let bestDelta = toleranceDeg;
  for (const target of targets) {
    const delta = angleDelta(heading, target);
    if (delta < bestDelta || (delta === bestDelta && target !== heading)) {
      best = target;
      bestDelta = delta;
    }
  }
  return bestDelta <= toleranceDeg ? best : heading;
}

function stepVector(headingDeg: number, length: number): XY {
  const rad = (normDeg(headingDeg) * Math.PI) / 180;
  return { x: length * Math.sin(rad), y: length * Math.cos(rad) };
}

function segmentHeading(from: XY, to: XY) {
  return normDeg((Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI);
}

function runStart(trace: XY[], headingDeg: number) {
  let index = trace.length - 1;
  while (index > 0) {
    const heading = segmentHeading(trace[index - 1], trace[index]);
    if (angleDelta(heading, headingDeg) > 12) break;
    index -= 1;
  }
  return index;
}

function scaleRun(trace: XY[], start: number, factor: number) {
  const origin = trace[start];
  return trace.map((point, index) => {
    if (index <= start) return point;
    return {
      x: origin.x + (point.x - origin.x) * factor,
      y: origin.y + (point.y - origin.y) * factor,
    };
  });
}

function runLength(trace: XY[], start: number) {
  let length = 0;
  for (let i = start + 1; i < trace.length; i += 1) {
    length += Math.hypot(trace[i].x - trace[i - 1].x, trace[i].y - trace[i - 1].y);
  }
  return length;
}

export function appendStep(input: {
  trace: XY[];
  headingDeg: number;
  stepLengthM: number;
  ring?: XY[];
  axisDeg?: number | null;
  snapToleranceDeg?: number;
}): { trace: XY[]; stepLengthM: number; headingDeg: number; rescaled: boolean } {
  const ring = input.ring ?? [];
  const axis = input.axisDeg ?? (ring.length >= 3 ? dominantAxisDeg(ring) : 90);
  const tolerance = input.snapToleranceDeg ?? 20;
  const heading = snapHeading(input.headingDeg, axis, tolerance);
  const length = input.stepLengthM > 0 ? input.stepLengthM : DEFAULT_STEP_LENGTH_M;
  const origin = input.trace.length ? input.trace[input.trace.length - 1] : { x: 0, y: 0 };
  const move = stepVector(heading, length);
  let trace = [...input.trace.map((point) => ({ ...point })), { x: origin.x + move.x, y: origin.y + move.y }];
  if (!input.trace.length) trace = [{ x: 0, y: 0 }, trace[trace.length - 1]];

  let stepLengthM = length;
  let rescaled = false;
  if (ring.length >= 3) {
    const spans = buildingExtents(ring, axis);
    const limit = angleDelta(heading % 180, axis % 180) < 45 ? spans.along : spans.across;
    const start = runStart(trace, heading);
    const walked = runLength(trace, start);
    if (limit > 0.5 && walked > limit) {
      const factor = (limit * 0.98) / walked;
      trace = scaleRun(trace, start, factor);
      stepLengthM = Math.round(Math.max(0.3, length * factor) * 100) / 100;
      rescaled = true;
    }
    trace = trace.map((point) => clampToPolygon(point, ring));
  }

  return { trace, stepLengthM, headingDeg: heading, rescaled };
}

export function integrateTrace(input: {
  headingsDeg: number[];
  stepLengthM?: number;
  ring?: XY[];
  axisDeg?: number | null;
  snapToleranceDeg?: number;
  origin?: XY;
}) {
  let trace: XY[] = [input.origin ?? { x: 0, y: 0 }];
  let stepLengthM = input.stepLengthM ?? DEFAULT_STEP_LENGTH_M;
  let rescaled = false;
  let headingDeg = input.headingsDeg[0] ?? 0;
  for (const heading of input.headingsDeg) {
    const next = appendStep({
      trace,
      headingDeg: heading,
      stepLengthM,
      ring: input.ring,
      axisDeg: input.axisDeg,
      snapToleranceDeg: input.snapToleranceDeg,
    });
    trace = next.trace;
    stepLengthM = next.stepLengthM;
    headingDeg = next.headingDeg;
    rescaled = rescaled || next.rescaled;
  }
  return { trace, stepLengthM, headingDeg, rescaled };
}

/** Spread the gap between the end and the start evenly along the trace. */
export function closeLoop<T extends XY>(trace: T[]): T[] {
  if (trace.length < 2) return trace.map((point) => ({ ...point }));
  const start = trace[0];
  const end = trace[trace.length - 1];
  const dx = start.x - end.x;
  const dy = start.y - end.y;
  const last = trace.length - 1;
  return trace.map((point, index) => ({
    ...point,
    x: point.x + dx * (index / last),
    y: point.y + dy * (index / last),
  }));
}

/** Rebuild near-axis segments so corridors sit on the footprint's walls, ±90°. */
export function straighten<T extends XY>(trace: T[], axisDeg: number, toleranceDeg = 18): T[] {
  if (trace.length < 2) return trace.map((point) => ({ ...point }));
  const next: T[] = [{ ...trace[0] }];
  for (let i = 1; i < trace.length; i += 1) {
    const prev = trace[i - 1];
    const current = trace[i];
    const dx = current.x - prev.x;
    const dy = current.y - prev.y;
    const len = Math.hypot(dx, dy);
    const origin = next[next.length - 1];
    if (len < 1e-6) {
      next.push({ ...current, x: origin.x, y: origin.y });
      continue;
    }
    const heading = normDeg((Math.atan2(dx, dy) * 180) / Math.PI);
    const snapped = snapHeading(heading, axisDeg, toleranceDeg);
    const rad = (snapped * Math.PI) / 180;
    next.push({
      ...current,
      x: origin.x + len * Math.sin(rad),
      y: origin.y + len * Math.cos(rad),
    });
  }
  return next;
}

/** Peaks in a vertical or magnitude signal. Returns the timestamps of new steps. */
export function detectSteps(
  samples: { t: number; value: number }[],
  options?: { threshold?: number; minGapMs?: number; since?: number },
) {
  const threshold = options?.threshold ?? 1.2;
  const minGap = options?.minGapMs ?? 300;
  const since = options?.since ?? Number.NEGATIVE_INFINITY;
  const peaks: number[] = [];
  let last = since;
  for (let i = 1; i < samples.length - 1; i += 1) {
    const sample = samples[i];
    if (sample.t <= since) continue;
    if (sample.value < threshold) continue;
    if (sample.value < samples[i - 1].value || sample.value < samples[i + 1].value) continue;
    if (sample.t - last < minGap) continue;
    peaks.push(sample.t);
    last = sample.t;
  }
  return peaks;
}
