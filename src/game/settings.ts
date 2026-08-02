/**
 * Settings persistence via localStorage.
 * CalibrationSettings holds the user's mic calibration (f0 centre, noise floor)
 * and their preferred tone range. Also persists the chosen game pace.
 */

import {
  CORRIDOR_WIDTHS,
  PACES,
  type CorridorWidth,
  type Pace,
} from "./gates.ts";

export interface CalibrationSettings {
  /** Baseline f0 in Hz, typically ~100–150 for most speakers. Used to map voice pitch to Chao 1–5. */
  f0Center: number;
  /** Noise floor from the calibration silence capture (RMS). Voicing gate uses noiseFloor*3 as threshold. */
  noiseFloor: number;
  /** Tone range in semitones: PRD default 5, range 3–8. Maps to playable vertical space. */
  rangeSemitones: number;
}

const KEY = "toneflap.settings.v1";

/**
 * Load calibration settings from localStorage.
 * Returns null if not found, corrupt, or out-of-range.
 * Validation:
 * - f0Center: 70–400 Hz (human voice range)
 * - noiseFloor: > 0
 * - rangeSemitones: 3–8
 */
export function loadSettings(): CalibrationSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CalibrationSettings;
    if (
      typeof s.f0Center !== "number" ||
      s.f0Center < 70 ||
      s.f0Center > 400 ||
      typeof s.noiseFloor !== "number" ||
      s.noiseFloor <= 0 ||
      typeof s.rangeSemitones !== "number" ||
      s.rangeSemitones < 3 ||
      s.rangeSemitones > 8
    ) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/**
 * Save calibration settings to localStorage.
 */
export function saveSettings(s: CalibrationSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/**
 * Clear calibration settings from localStorage (used by settings reset).
 */
export function clearSettings(): void {
  localStorage.removeItem(KEY);
}

// ---------------------------------------------------------------- game pace

const PACE_KEY = "toneflap.pace.v1";
const DEFAULT_PACE: Pace = "normal";

/**
 * Load the player's chosen pace. Defaults to "normal" (a notch calmer than
 * the PRD baseline) when unset or corrupt — playtesting found the baseline
 * too fast for learning.
 */
export function loadPace(): Pace {
  const raw = localStorage.getItem(PACE_KEY);
  return raw !== null && (PACES as string[]).includes(raw)
    ? (raw as Pace)
    : DEFAULT_PACE;
}

export function savePace(pace: Pace): void {
  localStorage.setItem(PACE_KEY, pace);
}

// ------------------------------------------------------------ corridor width

const WIDTH_KEY = "toneflap.width.v1";
const DEFAULT_WIDTH: CorridorWidth = "normal";

/** Load the player's chosen corridor width. Defaults to "normal" when unset or corrupt. */
export function loadCorridorWidth(): CorridorWidth {
  const raw = localStorage.getItem(WIDTH_KEY);
  return raw !== null && (CORRIDOR_WIDTHS as string[]).includes(raw)
    ? (raw as CorridorWidth)
    : DEFAULT_WIDTH;
}

export function saveCorridorWidth(width: CorridorWidth): void {
  localStorage.setItem(WIDTH_KEY, width);
}
