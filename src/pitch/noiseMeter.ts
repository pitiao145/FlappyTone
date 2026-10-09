/**
 * Per-session room-noise measurement. Pure — zero Web Audio dependencies.
 *
 * The voicing gate ignores anything quieter than `noiseFloor * rmsMult`. That
 * floor used to be measured once, at calibration, and reused forever — so a
 * calibration taken in a noisy moment made every later session deaf to the
 * quiet tail of each word (a real PWA case: a saved floor of 0.0044 put the
 * cutoff at ~0.013, right on top of normal phone-mic speech at 0.008–0.015).
 *
 * Instead, each game run and Visualiser visit measures the room itself in the
 * first moments after the mic opens, while the player is waiting and quiet:
 * skip `skipMs` (the tap that opened the mic), then take the median frame RMS
 * over the next `measureMs`. The result is clamped to [min, max] so neither a
 * player talking through the measurement (too high → deaf) nor a dead-silent
 * room (too low → the gate stops gating) can break the session.
 */
import { median } from "./calibration.ts";

export interface NoiseMeterConfig {
  /** Audio skipped after the first frame — the gesture's own tap. */
  skipMs: number;
  /** Audio measured after the skip. */
  measureMs: number;
  /** Lower clamp on the result. */
  min: number;
  /** Upper clamp on the result — and on the starting value. */
  max: number;
}

export function clampNoiseFloor(rms: number, cfg: Pick<NoiseMeterConfig, "min" | "max">): number {
  return Math.min(cfg.max, Math.max(cfg.min, rms));
}

export class NoiseMeter {
  private elapsedMs = 0;
  private samples: number[] = [];
  private result: number | null = null;

  private cfg: NoiseMeterConfig;

  constructor(cfg: NoiseMeterConfig) {
    this.cfg = cfg;
  }

  /**
   * Feed one frame's RMS and how much new audio it carries. Returns the
   * clamped floor once, on the frame the measurement completes; null before
   * and after.
   */
  push(rms: number, frameMs: number): number | null {
    if (this.result !== null) return null;
    this.elapsedMs += frameMs;
    if (this.elapsedMs <= this.cfg.skipMs) return null;
    this.samples.push(rms);
    if (this.elapsedMs < this.cfg.skipMs + this.cfg.measureMs) return null;
    this.result = clampNoiseFloor(median(this.samples), this.cfg);
    return this.result;
  }

  /** The measured floor, or null while still measuring. */
  done(): number | null {
    return this.result;
  }
}
