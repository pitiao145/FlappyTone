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
