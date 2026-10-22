/**
 * Pure floor detector. Pressure falls as you go up:
 * height metres = (reference hPa − smoothed hPa) / hpaPerM.
 *
 * Samples are pushed in with their own timestamps so tests can replay a ride
 * without a phone. The app feeds Barometer and DeviceMotion at about 300 ms.
 */

export const floorDetectorTuning = {
  calibrateMs: 2500,
  smoothMs: 4000,
  /** Fraction of a floor the smoothed height must enter before a change can commit. */
  hysteresis: 0.6,
  stableMs: 2000,
  liftStableMs: 800,
  stairsStableMs: 1000,
  /** Suggest a fresh landmark anchor after this long without one. */
  driftHintMs: 15 * 60 * 1000,
  sensorIntervalMs: 300,
} as const;

export type FloorMotion = 'unknown' | 'still' | 'moving' | 'lift' | 'stairs';

export type FloorSense = {
  calibrated: boolean;
  /** Latest raw pressure, hPa. */
  pressure: number | null;
  /** Median pressure over the smoothing window, hPa. */
  smoothedPressure: number | null;
  /** Smoothed height relative to the last anchor. Positive is up. */
  heightM: number | null;
  /** Floor committed for guidance. The anchor floor before the first commit. */
  level: number | null;
  confidence: number;
  motion: FloorMotion;
  needsRecalibration: boolean;
};

export type FloorDetectorConfig = {
  floorHeightM: number;
  hpaPerM: number;
};

type Sample = { t: number; v: number };
type LiftPhase = 'idle' | 'accel' | 'coast';

const LIFT_ACCEL = 0.35;
const LIFT_HOLD_MS = 400;
const LIFT_MEMORY_MS = 15000;
const COAST_TIMEOUT_MS = 12000;
const STAIR_PEAK = 1.2;
const STAIR_GAP_MIN_MS = 300;
const STAIR_GAP_MAX_MS = 800;
const STAIR_WINDOW_MS = 4000;
const STAIR_COUNT = 3;
const STAIR_MEMORY_MS = 8000;
const STILL_WINDOW_MS = 1500;
const STILL_RMS = 0.15;
const DRIFT_MPS = 0.04;
const ANCHOR_WINDOW_MS = 1000;

export type Vector3 = { x: number; y: number; z: number };

/**
 * Upward acceleration in m/s².
 * `includingGravity` is what the accelerometer reports at rest (it points up).
 * Returns null when user acceleration is missing, so the barometer can stand alone.
 */
export function verticalAcceleration(user: Vector3 | null, includingGravity: Vector3): number | null {
  if (!user) return null;
  const mag = Math.hypot(includingGravity.x, includingGravity.y, includingGravity.z);
  if (mag < 1) return null;
  return (user.x * includingGravity.x + user.y * includingGravity.y + user.z * includingGravity.z) / mag;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type FloorDetector = {
  arm(t: number, level: number, config?: FloorDetectorConfig): void;
  anchorFloor(t: number, level: number): void;
  observePressure(t: number, pressure: number): void;
  observeMotion(t: number, verticalAccel: number): void;
  sense(t: number): FloorSense;
  reset(): void;
  isArmed(): boolean;
};

function usable(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createDetector(config: FloorDetectorConfig): FloorDetector {
  let floorHeightM = usable(config.floorHeightM, 3.6);
  let hpaPerM = usable(config.hpaPerM, 0.12);
  let armed = false;
  let armedAt = 0;
  let armedLevel = 0;
  let calibrated = false;
  let refPressure: number | null = null;
  let anchorLevel = 0;
  let committed = 0;
  let lastAnchorAt = 0;
  let lastDriftAt = 0;
  let pending: number | null = null;
  let pendingSince = 0;
  let pressure: Sample[] = [];
  let accel: Sample[] = [];
  let liftPhase: LiftPhase = 'idle';
  let liftDir = 0;
  let travelDir = 0;
  let liftPhaseSince = 0;
  let lastHighAt = 0;
  let liftActiveUntil = 0;
  let stairsActiveUntil = 0;
  let lastPeakAt: number | null = null;
  let peaks: number[] = [];

  function reset() {
    armed = false;
    calibrated = false;
    refPressure = null;
    pending = null;
    pressure = [];
    accel = [];
    liftPhase = 'idle';
    liftDir = 0;
    travelDir = 0;
    liftActiveUntil = 0;
    stairsActiveUntil = 0;
    lastPeakAt = null;
    peaks = [];
  }

  function arm(t: number, level: number, next?: FloorDetectorConfig) {
    reset();
    if (next) {
      floorHeightM = usable(next.floorHeightM, floorHeightM);
      hpaPerM = usable(next.hpaPerM, hpaPerM);
    }
    armed = true;
    armedAt = t;
    armedLevel = level;
    anchorLevel = level;
    committed = level;
    lastAnchorAt = t;
    lastDriftAt = t;
  }

  function samplesBetween(source: Sample[], from: number, to: number) {
    const values: number[] = [];
    for (const sample of source) {
      if (sample.t >= from && sample.t <= to) values.push(sample.v);
    }
    return values;
  }

  function finishCalibration(t: number) {
    if (!armed || calibrated) return;
    if (t < armedAt + floorDetectorTuning.calibrateMs) return;
    const window = samplesBetween(pressure, armedAt, armedAt + floorDetectorTuning.calibrateMs);
    const values = window.length >= 3 ? window : pressure.slice(0, 3).map((sample) => sample.v);
    if (values.length < 3) return;
    const next = median(values);
    if (next == null) return;
    refPressure = next;
    calibrated = true;
    lastAnchorAt = t;
    lastDriftAt = t;
    anchorLevel = armedLevel;
    committed = armedLevel;
    pending = null;
  }

  function anchorFloor(t: number) {
    const recent = pressure.filter((sample) => t - sample.t <= ANCHOR_WINDOW_MS && sample.t <= t);
    const values = recent.length ? recent.map((sample) => sample.v) : pressure.slice(-1).map((sample) => sample.v);
    const next = median(values);
    if (next == null) return false;
    refPressure = next;
    pressure = recent.length ? recent : pressure.slice(-1);
    calibrated = true;
    pending = null;
    lastDriftAt = t;
    return true;
  }

  function confirmAnchor(t: number, level: number) {
    if (!armed) {
      arm(t, level);
    }
    anchorLevel = level;
    committed = level;
    armedLevel = level;
    lastAnchorAt = t;
    pending = null;
    anchorFloor(t);
  }

  function prune(t: number) {
    const oldestPressure = t - Math.max(floorDetectorTuning.smoothMs, 10000);
    if (pressure.length > 8 && pressure[0].t < oldestPressure) {
      pressure = pressure.filter((sample) => sample.t >= oldestPressure);
    }
    const oldestAccel = t - 8000;
    if (accel.length > 8 && accel[0].t < oldestAccel) {
      accel = accel.filter((sample) => sample.t >= oldestAccel);
    }
  }

  function observeMotion(t: number, vertical: number) {
    const previous = accel.length ? accel[accel.length - 1].v : 0;
    accel.push({ t, v: vertical });
    const mag = Math.abs(vertical);

    if (mag >= STAIR_PEAK && Math.abs(previous) < 0.8) {
      const gap = lastPeakAt == null ? null : t - lastPeakAt;
      if (gap == null || (gap >= STAIR_GAP_MIN_MS && gap <= STAIR_GAP_MAX_MS)) {
        peaks.push(t);
        lastPeakAt = t;
      } else if (gap > STAIR_GAP_MAX_MS) {
        peaks = [t];
        lastPeakAt = t;
      }
      peaks = peaks.filter((peak) => t - peak <= STAIR_WINDOW_MS);
      if (peaks.length >= STAIR_COUNT) {
        stairsActiveUntil = t + STAIR_MEMORY_MS;
        liftPhase = 'idle';
      }
    }

    if (t < stairsActiveUntil) {
      liftPhase = 'idle';
    } else if (mag >= LIFT_ACCEL && t >= liftActiveUntil) {
      lastHighAt = t;
      const sign = Math.sign(vertical) || 1;
      if (liftPhase === 'idle') {
        liftPhase = 'accel';
        liftDir = sign;
        liftPhaseSince = t;
      } else if (liftPhase === 'accel' && sign !== liftDir) {
        liftDir = sign;
        liftPhaseSince = t;
      } else if (liftPhase === 'coast' && sign === -liftDir) {
        travelDir = liftDir;
        liftActiveUntil = t + LIFT_MEMORY_MS;
        liftPhase = 'idle';
      } else if (liftPhase === 'coast' && sign === liftDir) {
        liftPhase = 'accel';
        liftPhaseSince = t;
      }
    } else if (t < liftActiveUntil) {
      // The braking tail is part of the ride we already accepted.
    } else if (liftPhase === 'accel' && t - lastHighAt > 300 && t - liftPhaseSince < LIFT_HOLD_MS) {
      liftPhase = 'idle';
    } else if (liftPhase === 'accel' && mag <= 0.2 && t - liftPhaseSince >= LIFT_HOLD_MS) {
      liftPhase = 'coast';
      liftPhaseSince = t;
    } else if (liftPhase === 'coast' && t - liftPhaseSince > COAST_TIMEOUT_MS) {
      liftPhase = 'idle';
    }

    evaluate(t);
  }

  function classify(t: number): FloorMotion {
    if (!accel.length) return 'unknown';
    if (t < liftActiveUntil) return 'lift';
    if (t < stairsActiveUntil) return 'stairs';
    if (liftPhase !== 'idle') return 'moving';
    const window = accel.filter((sample) => t - sample.t <= STILL_WINDOW_MS && sample.t <= t);
    if (window.length < 3) return 'unknown';
    const span = window[window.length - 1].t - window[0].t;
    if (span < 600) return 'unknown';
    let square = 0;
    let peak = 0;
    for (const sample of window) {
      square += sample.v * sample.v;
      peak = Math.max(peak, Math.abs(sample.v));
    }
    const rms = Math.sqrt(square / window.length);
    if (rms >= 0.25 || peak >= 0.8) return 'moving';
    if (rms <= STILL_RMS && peak < 0.4) return 'still';
    return rms < 0.2 ? 'still' : 'moving';
  }

  function heightOf(smoothed: number) {
    return (refPressure! - smoothed) / hpaPerM;
  }

  function candidateSteps(height: number) {
    const nominal = (committed - anchorLevel) * floorHeightM;
    const offset = height - nominal;
    const span = Math.abs(offset) / floorHeightM + (1 - floorDetectorTuning.hysteresis);
    const steps = Math.floor(span + 1e-9);
    if (steps <= 0) return 0;
    return offset >= 0 ? steps : -steps;
  }

  function evaluate(t: number): FloorSense {
    finishCalibration(t);
    prune(t);
    const motion = classify(t);
    const latest = pressure.length ? pressure[pressure.length - 1].v : null;
    const needsRecalibration =
      calibrated && lastAnchorAt > 0 && t - lastAnchorAt >= floorDetectorTuning.driftHintMs;

    if (!calibrated || refPressure == null) {
      return {
        calibrated: false,
        pressure: latest,
        smoothedPressure: null,
        heightM: null,
        level: armed ? armedLevel : null,
        confidence: armed ? 0.25 : 0,
        motion,
        needsRecalibration: false,
      };
    }

    const smoothed = median(samplesBetween(pressure, t - floorDetectorTuning.smoothMs, t));
    if (smoothed == null) {
      return {
        calibrated: true,
        pressure: latest,
        smoothedPressure: null,
        heightM: null,
        level: committed,
        confidence: 0.3,
        motion,
        needsRecalibration,
      };
    }

    const dt = clamp((t - lastDriftAt) / 1000, 0, 30);
    if (motion === 'still' && dt > 0) {
      const drift = heightOf(smoothed) - (committed - anchorLevel) * floorHeightM;
      const corr = clamp(drift, -DRIFT_MPS * dt, DRIFT_MPS * dt);
      refPressure -= corr * hpaPerM;
    }
    lastDriftAt = t;

    const height = heightOf(smoothed);
    const steps = candidateSteps(height);
    const candidate = committed + steps;
    const blocked = motion === 'still' && candidate !== committed;
    let stableNeed: number = floorDetectorTuning.stableMs;
    const rideDir = t < liftActiveUntil ? travelDir : liftDir;
    if (motion === 'lift' && steps !== 0 && rideDir !== 0 && Math.sign(steps) === rideDir) {
      stableNeed = floorDetectorTuning.liftStableMs;
    } else if (motion === 'stairs' && steps !== 0) {
      stableNeed = floorDetectorTuning.stairsStableMs;
    }

    if (candidate === committed || blocked) {
      pending = null;
    } else if (pending !== candidate) {
      pending = candidate;
      pendingSince = t;
    } else if (t - pendingSince >= stableNeed) {
      committed = candidate;
      pending = null;
    }

    let confidence = 0.74;
    if (motion === 'still') confidence = blocked ? 0.4 : 0.88;
    else if (motion === 'lift') confidence = 0.92;
    else if (motion === 'stairs') confidence = 0.86;
    else if (motion === 'moving') confidence = 0.72;
    if (needsRecalibration) confidence = Math.min(confidence, 0.45);

    return {
      calibrated: true,
      pressure: latest,
      smoothedPressure: smoothed,
      heightM: height,
      level: committed,
      confidence,
      motion,
      needsRecalibration,
    };
  }

  return {
    arm,
    anchorFloor: confirmAnchor,
    observePressure(t, next) {
      pressure.push({ t, v: next });
      evaluate(t);
    },
    observeMotion,
    sense: evaluate,
    reset,
    isArmed: () => armed,
  };
}
