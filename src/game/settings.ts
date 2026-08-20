/**
 * Settings persistence via localStorage.
 * CalibrationSettings holds the user's mic calibration (f0 centre, noise floor)
 * and their preferred tone range.
 */

import {
  RANGE_DOWN_SEMITONES_MIN,
  RANGE_SEMITONES_MAX,
  RANGE_UP_SEMITONES_MIN,
} from "../pitch/calibration.ts";
import { CORRIDOR_WIDTHS, type CorridorWidth } from "./gates.ts";
import {
  INITIAL_TRACKING_WINDOW,
  type RecalTrackingState,
} from "./recalibration.ts";
import { CUE_STYLES, type CueStyle } from "./run.ts";

export interface CalibrationSettings {
  /** Baseline f0 in Hz, typically ~100–150 for most speakers. Used to map voice pitch to Chao 1–5. */
  f0Center: number;
  /** Noise floor from the calibration silence capture (RMS). Voicing gate uses noiseFloor*3 as threshold. */
  noiseFloor: number;
  /** Tone range in semitones from centre *up* to Chao 5. Seeded from the
   * speaker's high sweep; bounds in RANGE_UP_SEMITONES_MIN/MAX. */
  rangeSemitones: number;
  /** Semitones from centre *down* to Chao 1, from the low sweep. Separate
   * because a speaking voice is not the middle of its range — see
   * `semitonesToChao`. Records written before this field mirror the up half. */
  rangeDownSemitones: number;
}

/**
 * v2 because v1 records cannot be trusted, and cannot be told apart.
 *
 * Between the asymmetric-board commits and `REACH_TO_TONE_SPACE`, calibrations
 * were saved with each half set to the speaker's raw maximum reach — a board on
 * which Tone 1 asks for a shout and an ordinary Tone 2 onset draws on the floor.
 * A good v1 record and a bad one look identical from here, so the whole key is
 * retired rather than migrated. The cost is one 15-second flow, once.
 */
const KEY = "toneflap.settings.v2";

/**
 * Load calibration settings from localStorage.
 * Returns null if not found, corrupt, or out-of-range.
 * Validation:
 * - f0Center: 70–400 Hz (human voice range)
 * - noiseFloor: > 0
 * - rangeSemitones: RANGE_UP_SEMITONES_MIN–MAX
 *
 * `rangeDownSemitones` is migrated rather than validated away: a record saved
 * before the board became asymmetric has no such field, and rejecting it would
 * throw away a working calibration and force everyone through the flow again.
 * Absent or out-of-range mirrors the up half, which is exactly the board that
 * record was calibrated on.
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
      s.rangeSemitones < RANGE_UP_SEMITONES_MIN ||
      s.rangeSemitones > RANGE_SEMITONES_MAX
    ) {
      return null;
    }
    const down = s.rangeDownSemitones;
    const downValid =
      typeof down === "number" &&
      down >= RANGE_DOWN_SEMITONES_MIN &&
      down <= RANGE_SEMITONES_MAX;
    return { ...s, rangeDownSemitones: downValid ? down : s.rangeSemitones };
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

// -------------------------------------------------- recalibration tracking

const RECAL_TRACKING_KEY = "toneflap.recal.tracking.v1";

function freshRecalTracking(): RecalTrackingState {
  return { windowSize: INITIAL_TRACKING_WINDOW, samples: [] };
}

/**
 * The window of per-run measured ranges `App.tsx` is accumulating toward the
 * next recalibration judgment. See `recalibration.ts`'s `RecalTrackingState`
 * for why the window size varies between calls.
 */
export function loadRecalTracking(): RecalTrackingState {
  try {
    const raw = localStorage.getItem(RECAL_TRACKING_KEY);
    if (!raw) return freshRecalTracking();
    const s = JSON.parse(raw) as RecalTrackingState;
    if (typeof s.windowSize !== "number" || !Array.isArray(s.samples)) {
      return freshRecalTracking();
    }
    return s;
  } catch {
    return freshRecalTracking();
  }
}

export function saveRecalTracking(state: RecalTrackingState): void {
  localStorage.setItem(RECAL_TRACKING_KEY, JSON.stringify(state));
}

/**
 * Called only from a genuine visit to the calibration tool (`Calibration.tsx`'s
 * `save()`, covering both the first-run flow and Settings → Fine-tune) — never
 * from accepting a game-over suggestion, which already starts its next window
 * fresh at the moment the check fires. See `recalibration.ts` for the full
 * reasoning.
 */
export function resetRecalTracking(): void {
  saveRecalTracking(freshRecalTracking());
}

// ------------------------------------------------------------ corridor width

const WIDTH_KEY = "toneflap.width.v1";
/**
 * Wide, not the PRD's tolerance.
 *
 * The corridors are measured from one speaker's takes now, and a first-time
 * player is being asked to match a stranger's syllable inside a wall drawn from
 * it. Being told you missed, when what you produced was a perfectly good tone
 * in your own voice, is the single fastest way to lose someone — the same
 * argument "couldn't hear that" is built on. Narrow is one tap away in
 * Settings for anyone who wants it.
 */
const DEFAULT_WIDTH: CorridorWidth = "wide";

/** Load the player's chosen corridor width. Falls back to DEFAULT_WIDTH when unset or corrupt. */
export function loadCorridorWidth(): CorridorWidth {
  const raw = localStorage.getItem(WIDTH_KEY);
  return raw !== null && (CORRIDOR_WIDTHS as string[]).includes(raw)
    ? (raw as CorridorWidth)
    : DEFAULT_WIDTH;
}

export function saveCorridorWidth(width: CorridorWidth): void {
  localStorage.setItem(WIDTH_KEY, width);
}

// -------------------------------------------------------- English translation

const TRANSLATION_KEY = "toneflap.translation.v1";

/**
 * Show the English gloss above the pinyin. On by default.
 *
 * On, because the person this game is for does not yet know what 賣 means, and
 * a syllable they cannot attach a meaning to is a sound they are imitating
 * rather than a word they are learning. Off exists for the case where that is
 * the point — reading the hanzi without a crutch.
 */
export function loadShowTranslation(): boolean {
  const raw = localStorage.getItem(TRANSLATION_KEY);
  // Anything other than an explicit "off" is on, so a corrupt value fails to
  // the more useful state rather than silently hiding the translations.
  return raw !== "off";
}

export function saveShowTranslation(show: boolean): void {
  localStorage.setItem(TRANSLATION_KEY, show ? "on" : "off");
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
