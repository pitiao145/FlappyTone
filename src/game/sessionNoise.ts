/**
 * Glue between `tuning()` and the pure `NoiseMeter` for the two live screens
 * (Game, Visualiser): each measures the room at the start of its own session
 * rather than trusting the floor saved at calibration. See
 * `src/pitch/noiseMeter.ts` for why.
 */
import { clampNoiseFloor, NoiseMeter } from "../pitch/noiseMeter.ts";
import { rmsOf } from "../pitch/math.ts";
import { tuning } from "./tuning.ts";

/** New audio per capture frame — `HOP_SIZE` in `src/audio/mic.ts`. */
const HOP_SAMPLES = 1024;

/** The saved calibration floor, clamped — used only until the session's own measurement lands. */
export function startingNoiseFloor(saved: number): number {
  const t = tuning();
  return clampNoiseFloor(saved, { min: t.noiseFloorMin, max: t.noiseFloorMax });
}

/**
 * Returns a per-frame feeder: call it with every frame the tracker sees; it
 * returns the measured floor once (to hand to `setNoiseFloor`), else null.
 */
export function sessionNoiseMeter(): (frame: Float32Array, sampleRate: number) => number | null {
  const t = tuning();
  const meter = new NoiseMeter({
    skipMs: t.noiseSkipMs,
    measureMs: t.noiseMeasureMs,
    min: t.noiseFloorMin,
    max: t.noiseFloorMax,
  });
  return (frame, sampleRate) => meter.push(rmsOf(frame), (HOP_SAMPLES / sampleRate) * 1000);
}
