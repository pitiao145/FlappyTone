/**
 * Settings persistence via localStorage.
 * CalibrationSettings holds the user's mic calibration (f0 centre, noise floor)
 * and their preferred tone range. Also persists the chosen game pace.
 */

import {
  RANGE_SEMITONES_MAX,
  RANGE_SEMITONES_MIN,
} from "../pitch/calibration.ts";
import {
  CORRIDOR_WIDTHS,
  PACES,
  type CorridorWidth,
  type Pace,
} from "./gates.ts";
import { CUE_STYLES, type CueStyle } from "./run.ts";

export interface CalibrationSettings {
  /** Baseline f0 in Hz, typically ~100–150 for most speakers. Used to map voice pitch to Chao 1–5. */
  f0Center: number;
  /** Noise floor from the calibration silence capture (RMS). Voicing gate uses noiseFloor*3 as threshold. */
  noiseFloor: number;
  /** Tone range in semitones from centre to Chao 1/5. Seeded from the speaker's
   * measured excursion during calibration; bounds in RANGE_SEMITONES_MIN/MAX. */
  rangeSemitones: number;
}

const KEY = "toneflap.settings.v1";

/**
 * Load calibration settings from localStorage.
 * Returns null if not found, corrupt, or out-of-range.
 * Validation:
 * - f0Center: 70–400 Hz (human voice range)
 * - noiseFloor: > 0
 * - rangeSemitones: RANGE_SEMITONES_MIN–MAX
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
      s.rangeSemitones < RANGE_SEMITONES_MIN ||
      s.rangeSemitones > RANGE_SEMITONES_MAX
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

// ------------------------------------------------------------------ demo cue

const CUE_STYLE_KEY = "toneflap.demo.v1";
const DEFAULT_CUE_STYLE: CueStyle = "pause";

/**
 * Load the chosen demo style. Defaults to "pause" (world freezes while the
 * demo is traced) — playtesting found "flow" blurs the example into the
 * player's attempt.
 */
export function loadCueStyle(): CueStyle {
  const raw = localStorage.getItem(CUE_STYLE_KEY);
  return raw !== null && (CUE_STYLES as string[]).includes(raw)
    ? (raw as CueStyle)
    : DEFAULT_CUE_STYLE;
}

export function saveCueStyle(style: CueStyle): void {
  localStorage.setItem(CUE_STYLE_KEY, style);
}

// -------------------------------------------------------------- reduce motion

const MOTION_KEY = "toneflap.motion.v1";

/**
 * The player's motion preference: `null` means follow the OS
 * (`prefers-reduced-motion`), which is the default and the right one for
 * almost everyone. The explicit values exist because the OS setting is a blunt
 * instrument — someone may want the screen shake here without turning off
 * every animation on their phone, or the reverse.
 */
export function loadReduceMotion(): boolean | null {
  // Guarded because the renderer reads this at module scope, where the test
  // environment has no localStorage — and "follow the OS" is the right answer
  // when we cannot tell.
  try {
    const raw = localStorage.getItem(MOTION_KEY);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch {
    return null;
  }
  return null;
}

export function saveReduceMotion(v: boolean | null): void {
  if (v === null) localStorage.removeItem(MOTION_KEY);
  else localStorage.setItem(MOTION_KEY, v ? "on" : "off");
}

// ------------------------------------------------------------ analytics

const SHARE_DATA_KEY = "toneflap.sharedata.v1";
const NOTICE_KEY = "toneflap.analytics.notice.v1";

/**
 * Whether anonymous gameplay data is sent home. On by default — the game is in
 * testing and the whole point of this round is to find out where it fails.
 *
 * Defaults to true when storage is unreadable, matching every other read here:
 * an unreadable store means "no preference recorded", not "opted out".
 */
export function loadShareData(): boolean {
  try {
    return localStorage.getItem(SHARE_DATA_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveShareData(v: boolean): void {
  try {
    localStorage.setItem(SHARE_DATA_KEY, v ? "on" : "off");
  } catch {
    // Blocked storage. The toggle still applies to this session.
  }
}

/**
 * Whether the first-run notice has been dismissed.
 *
 * Clearing site data brings it back, which is correct rather than a bug: that
 * is also when the analytics player id is regenerated, so it genuinely is a
 * first run again.
 */
export function loadNoticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === "seen";
  } catch {
    // Unreadable storage means we cannot know it was shown. Showing a notice
    // twice is a small annoyance; never showing it is a broken disclosure.
    return false;
  }
}

export function saveNoticeSeen(): void {
  try {
    localStorage.setItem(NOTICE_KEY, "seen");
  } catch {
    // ignore
  }
}
