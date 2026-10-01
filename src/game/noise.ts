// Maps tuning()'s noise mode onto PitchTracker config and mic constraints.
// No React, no Web Audio — just numbers (docs/noise-plan.md).
import type { PitchTrackerConfig } from "../pitch/types.ts";
import { tuning, type NoiseMode } from "./tuning.ts";

const HOP = 1024;

export function usesAdaptiveFloor(mode: NoiseMode = tuning().noiseMode): boolean {
  return mode === "adaptive" || mode === "strict" || mode === "browserAdaptive";
}

export function usesBrowserSuppression(mode: NoiseMode = tuning().noiseMode): boolean {
  return mode === "browser" || mode === "browserAdaptive";
}

/** Tracker overrides for the current noise mode; empty for "off"/"browser". */
export function trackerNoiseConfig(sampleRate: number): Partial<PitchTrackerConfig> {
  const t = tuning();
  if (!usesAdaptiveFloor(t.noiseMode)) return {};
  return {
    adaptiveGateOverNoise: t.noiseGateOverNoise,
    adaptiveWindowFrames: Math.max(8, Math.round((t.noiseFloorWindowMs / 1000) * (sampleRate / HOP))),
    adaptivePercentile: t.noiseFloorPercentile,
    ...(t.noiseMode === "strict" ? { clarityThreshold: t.noiseStrictClarity } : {}),
  };
}

/** True when the room is loud enough that a "hold the phone closer" hint helps. */
export function isLoudRoom(noiseEstimate: number, calibratedFloor: number): boolean {
  return calibratedFloor > 0 && noiseEstimate >= calibratedFloor * tuning().loudRoomRatio;
}
