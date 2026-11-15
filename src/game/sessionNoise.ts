/**
 * Glue between `tuning()` and the pure `NoiseMeter` for the two live screens
 * (Game, Visualiser): each measures the room at the start of its own session
 * rather than trusting the floor saved at calibration. See
 * `src/pitch/noiseMeter.ts` for why.
 */
import { clampNoiseFloor, NoiseMeter } from "../pitch/noiseMeter.ts";
import { DEFAULT_VOICING, rmsOf } from "../pitch/math.ts";
import { tuning } from "./tuning.ts";

/** New audio per capture frame — `HOP_SIZE` in `src/audio/mic.ts`. */
const HOP_SAMPLES = 1024;

/**
 * Highest noise floor this player's session may use. With a measured voice
 * loudness, the gate (`floor × rmsMult`) stays under `voiceCapFraction` of it;
 * without one (a calibration saved before `voiceRms` existed), the fixed
 * `noiseFloorMax`.
 */
export function noiseFloorCap(voiceRms: number | undefined): number {
  const t = tuning();
  if (voiceRms === undefined) return t.noiseFloorMax;
  return Math.max(t.noiseFloorMin, (voiceRms * t.voiceCapFraction) / DEFAULT_VOICING.rmsMult);
}

/** The saved calibration floor, clamped — used only until the session's own measurement lands. */
export function startingNoiseFloor(saved: number, voiceRms?: number): number {
  return clampNoiseFloor(saved, { min: tuning().noiseFloorMin, max: noiseFloorCap(voiceRms) });
}

/**
 * Returns a per-frame feeder: call it with every frame the tracker sees; it
 * returns the measured floor once (to hand to `setNoiseFloor`), else null.
 */
export function sessionNoiseMeter(
  voiceRms?: number,
): (frame: Float32Array, sampleRate: number) => number | null {
  const t = tuning();
  const meter = new NoiseMeter({
    skipMs: t.noiseSkipMs,
    measureMs: t.noiseMeasureMs,
    min: t.noiseFloorMin,
    max: noiseFloorCap(voiceRms),
  });
  return (frame, sampleRate) => meter.push(rmsOf(frame), (HOP_SAMPLES / sampleRate) * 1000);
}

/** One room measurement for one mic session, shared by every effect run that uses it. */
export interface SessionNoise {
  /** Feed a frame; returns the measured floor once, else null. */
  feed(frame: Float32Array, sampleRate: number): number | null;
  /** The floor once measured, else null. A tracker made later starts from it. */
  readonly floor: number | null;
}

const perOwner = new WeakMap<object, SessionNoise>();

/**
 * The room measurement for `owner` (the open mic session), made on first use
 * and reused after. The Visualiser's frame effect re-runs on every canvas size
 * change (resize, phone rotation); keyed by the mic session, that re-run no
 * longer starts a second measurement — which could land mid-speech and set
 * the floor from the player's own voice (brief 47).
 */
export function sessionNoiseFor(owner: object, voiceRms?: number): SessionNoise {
  const existing = perOwner.get(owner);
  if (existing) return existing;
  const measure = sessionNoiseMeter(voiceRms);
  let floor: number | null = null;
  const noise: SessionNoise = {
    feed(frame, sampleRate) {
      const m = measure(frame, sampleRate);
      if (m !== null) floor = m;
      return m;
    },
    get floor() {
      return floor;
    },
  };
  perOwner.set(owner, noise);
  return noise;
}
