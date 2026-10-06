// Maps tuning()'s noise mode onto PitchTracker config and mic constraints.
// No React, no Web Audio — just numbers (docs/noise-plan.md).
import type { PitchTrackerConfig } from "../pitch/types.ts";
import { tuning, type NoiseMode } from "./tuning.ts";

const HOP = 1024;

/**
 * Room-noise estimate carried from the last run's tracker. Each run builds a
 * fresh tracker, and a fresh tracker starts from the quiet calibrated floor
 * and needs ~2 s to learn the room — on the beach test (1 Oct 2026) that
 * warm-up was visibly the bird diving on bass after every restart.
 */
let carriedNoiseRms = 0;

export function rememberRoomNoise(rms: number): void {
  if (Number.isFinite(rms) && rms > 0) carriedNoiseRms = rms;
}

export function usesAdaptiveFloor(mode: NoiseMode = tuning().noiseMode): boolean {
  return mode === "adaptive" || mode === "strict" || mode === "browserAdaptive";
}

export function usesBrowserSuppression(mode: NoiseMode = tuning().noiseMode): boolean {
  return mode === "browser" || mode === "browserAdaptive";
}

/** Tracker overrides for the current noise mode; empty for "off"/"browser". */
export function trackerNoiseConfig(
  sampleRate: number,
  mode: NoiseMode = tuning().noiseMode,
): Partial<PitchTrackerConfig> {
  const t = tuning();
  if (!usesAdaptiveFloor(mode)) return {};
  return {
    adaptiveGateOverNoise: t.noiseGateOverNoise,
    adaptiveWindowFrames: Math.max(8, Math.round((t.noiseFloorWindowMs / 1000) * (sampleRate / HOP))),
    adaptivePercentile: t.noiseFloorPercentile,
    adaptiveSeedRms: carriedNoiseRms,
    ...(mode === "strict" ? { clarityThreshold: t.noiseStrictClarity } : {}),
  };
}

/** True when the room is loud enough that a "hold the phone closer" hint helps. */
export function isLoudRoom(noiseEstimate: number, calibratedFloor: number): boolean {
  return calibratedFloor > 0 && noiseEstimate >= calibratedFloor * tuning().loudRoomRatio;
}
