// Dev-only: pick the noise front-end under test (docs/noise-plan.md).
// `?noise=adaptive` (or off/strict/browser/browserAdaptive) on /app, kept for
// the tab in sessionStorage so in-app navigation doesn't lose it.
import { NOISE_MODES, setTuning, tuning, type NoiseMode } from "../game/tuning.ts";

const KEY = "flappytone.noiseMode";

export function applyNoiseModeFromUrl(): void {
  let mode: string | null = new URLSearchParams(location.search).get("noise");
  try {
    if (mode) sessionStorage.setItem(KEY, mode);
    else mode = sessionStorage.getItem(KEY);
  } catch {
    /* storage unavailable — URL only */
  }
  if (mode && (NOISE_MODES as readonly string[]).includes(mode)) setTuning({ noiseMode: mode as NoiseMode });
}

export function cycleNoiseMode(): NoiseMode {
  const next = NOISE_MODES[(NOISE_MODES.indexOf(tuning().noiseMode) + 1) % NOISE_MODES.length];
  setTuning({ noiseMode: next });
  try {
    sessionStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}
