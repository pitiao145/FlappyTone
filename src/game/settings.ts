/**
 * Settings persistence via localStorage.
 * CalibrationSettings holds the user's mic calibration (f0 centre, noise floor)
 * and their preferred tone range.
 */

import { accountStorage } from "../lib/accountStorage.ts";
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
import { CUE_STYLES, WORD_MIXES, type CueStyle, type WordMix } from "./run.ts";
import type { Proficiency, Tier } from "./tiers.ts";
import type { LevelChoice, SpeechStyle } from "./words.ts";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "./themes.ts";
export type { LevelChoice } from "./words.ts";
import { type VoicePref } from "./voice.ts";

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
  /**
   * Which recorded voice this player flies against, as an *axis* (a gender)
   * rather than a speaker id: a stored id breaks the moment the roster holds
   * two speakers of the same kind. Absent means "never chosen and never
   * guessed", which resolves to the default speaker.
   *
   * Optional, and added additively: the key below stays `v3`. Bumping it to
   * gain one field would wipe every existing player's noise floor, f0 centre
   * and both range halves — the trade `runHistory.ts` already refused.
   */
  voice?: VoicePref;
  /**
   * Median RMS of the player's voiced frames in calibration's talk step — how
   * loud this player is on this device. Caps the per-session noise cutoff so
   * a noisy room can raise it, but never above a fraction of the voice
   * (`tuning().voiceCapFraction`). Optional and additive, like `voice`:
   * absent on older records, which fall back to the fixed `noiseFloorMax`.
   */
  voiceRms?: number;
}

/**
 * v3 because v2 records predate the 29 Aug 2026 calibration rewrite (see
 * DECISIONS.md) and cannot be told apart from a fresh one — same shape
 * (`f0Center`/`noiseFloor`/`rangeSemitones`/`rangeDownSemitones`), computed by
 * a since-replaced flow. Bumping the key, not migrating the data, is the same
 * call made for v1→v2: a good v2 record and a stale one look identical from
 * here, so every returning player gets routed through calibration again once
 * on this release rather than silently keeping numbers from the old flow.
 *
 * v2 because v1 records cannot be trusted, and cannot be told apart.
 *
 * Between the asymmetric-board commits and `REACH_TO_TONE_SPACE`, calibrations
 * were saved with each half set to the speaker's raw maximum reach — a board on
 * which Tone 1 asks for a shout and an ordinary Tone 2 onset draws on the floor.
 * A good v1 record and a bad one look identical from here, so the whole key is
 * retired rather than migrated. The cost is one 15-second flow, once.
 */
const KEY = "toneflap.settings.v3";

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
 *
 * `voice` follows the same precedent one step further: absent or malformed, it
 * is dropped and the rest of the record is kept. A player whose stored
 * preference is unreadable should fly the default voice, not be sent back
 * through calibration.
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
    const voice =
      s.voice !== null &&
      typeof s.voice === "object" &&
      (s.voice.gender === "male" || s.voice.gender === "female")
        ? { gender: s.voice.gender }
        : undefined;
    const down = s.rangeDownSemitones;
    const downValid =
      typeof down === "number" &&
      down >= RANGE_DOWN_SEMITONES_MIN &&
      down <= RANGE_SEMITONES_MAX;
    const loaded: CalibrationSettings = {
      ...s,
      rangeDownSemitones: downValid ? down : s.rangeSemitones,
    };
    if (voice) loaded.voice = voice;
    else delete loaded.voice;
    if (!(typeof s.voiceRms === "number" && s.voiceRms > 0 && s.voiceRms < 1)) {
      delete loaded.voiceRms;
    }
    return loaded;
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
  const raw = accountStorage.getItem(WIDTH_KEY);
  return raw !== null && (CORRIDOR_WIDTHS as string[]).includes(raw)
    ? (raw as CorridorWidth)
    : DEFAULT_WIDTH;
}

export function saveCorridorWidth(width: CorridorWidth): void {
  accountStorage.setItem(WIDTH_KEY, width);
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
  const raw = accountStorage.getItem(TRANSLATION_KEY);
  // Anything other than an explicit "off" is on, so a corrupt value fails to
  // the more useful state rather than silently hiding the translations.
  return raw !== "off";
}

export function saveShowTranslation(show: boolean): void {
  accountStorage.setItem(TRANSLATION_KEY, show ? "on" : "off");
}

// --------------------------------------------------------------- pinyin

const PINYIN_KEY = "toneflap.pinyin.v1";

/**
 * Show the pinyin line in the HUD syllable card. On by default, same
 * fail-open precedent as `loadShowTranslation`.
 */
export function loadShowPinyin(): boolean {
  const raw = accountStorage.getItem(PINYIN_KEY);
  return raw !== "off";
}

export function saveShowPinyin(show: boolean): void {
  accountStorage.setItem(PINYIN_KEY, show ? "on" : "off");
}

// ----------------------------------------------------------- tone marks

const TONE_MARKS_KEY = "toneflap.tonemarks.v1";

/**
 * Show the sandhi-adjusted tone-mark row in the HUD syllable card (see
 * `src/game/sandhi.ts`). On by default, same fail-open precedent as
 * `loadShowTranslation`.
 */
export function loadShowToneMarks(): boolean {
  const raw = accountStorage.getItem(TONE_MARKS_KEY);
  return raw !== "off";
}

export function saveShowToneMarks(show: boolean): void {
  accountStorage.setItem(TONE_MARKS_KEY, show ? "on" : "off");
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
  const raw = accountStorage.getItem(CUE_STYLE_KEY);
  return raw !== null && (CUE_STYLES as string[]).includes(raw)
    ? (raw as CueStyle)
    : DEFAULT_CUE_STYLE;
}

export function saveCueStyle(style: CueStyle): void {
  accountStorage.setItem(CUE_STYLE_KEY, style);
}

// ------------------------------------------------------------- word mix

const WORD_MIX_KEY = "toneflap.wordmix.v1";
const DEFAULT_WORD_MIX: WordMix = "single";

/**
 * Classic `game` mode's word pool: single-syllable only (default), pairs
 * only, or a roll per gate (`tuning().multiGateChance`). Only meaningful
 * once the inventory has multi-syllable words — see `Settings.tsx`'s
 * `multiWords(words).length === 0` visibility gate.
 */
export function loadWordMix(): WordMix {
  const raw = accountStorage.getItem(WORD_MIX_KEY);
  return raw !== null && (WORD_MIXES as string[]).includes(raw)
    ? (raw as WordMix)
    : DEFAULT_WORD_MIX;
}

export function saveWordMix(mix: WordMix): void {
  accountStorage.setItem(WORD_MIX_KEY, mix);
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
    const raw = accountStorage.getItem(MOTION_KEY);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch {
    return null;
  }
  return null;
}

export function saveReduceMotion(v: boolean | null): void {
  if (v === null) accountStorage.removeItem(MOTION_KEY);
  else accountStorage.setItem(MOTION_KEY, v ? "on" : "off");
}

// ------------------------------------------------------------ analytics

/**
 * The "Usage analytics" switch (brief 35; "Share game data" before it, same
 * key, so an old `"off"` is still off). `"off"` means opted out; anything
 * else is on. Code never turns an `"off"` back on: only the player's own
 * toggle, here or on another device through the account
 * (`src/data/usageAnalytics.ts`), does.
 */
export const SHARE_DATA_KEY = "toneflap.sharedata.v1";

/**
 * Whether usage analytics is on. On by default; defaults to true when storage
 * is unreadable, matching every other read here: an unreadable store means
 * "no preference recorded", not "opted out".
 *
 * Reads the signed-in account's value (`accountStorage`), or this browser's
 * signed-out value when no account is known. Site pages read it too, before
 * the SDK starts.
 */
export function loadShareData(): boolean {
  try {
    return accountStorage.getItem(SHARE_DATA_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Saves the switch for the current account. An "off" is also saved as this
 * browser's signed-out value, so a sign-out (or a site page with no account)
 * keeps it. An account's "on" never overwrites that value: only a choice
 * made while signed out (no account, so the plain key) turns it back on.
 */
export function saveShareData(v: boolean): void {
  try {
    accountStorage.setItem(SHARE_DATA_KEY, v ? "on" : "off");
    if (!v) localStorage.setItem(SHARE_DATA_KEY, "off");
  } catch {
    // Blocked storage. The toggle still applies to this session.
  }
}

// -------------------------------------------------------- proficiency

const PROFICIENCY_KEY = "toneflap.proficiency.v1";
const DEFAULT_PROFICIENCY: Proficiency = "beginner";

/**
 * Beginner (single syllable) or Intermediate (two syllable) — a Settings
 * choice, not a per-run one (unlike the TOCFL level, chosen fresh every
 * play on the pre-game screen). Defaults to Beginner for a new player.
 */
export function loadProficiency(): Proficiency {
  const raw = accountStorage.getItem(PROFICIENCY_KEY);
  return raw === "beginner" || raw === "intermediate" ? raw : DEFAULT_PROFICIENCY;
}

/**
 * Also writes `wordMix` — the classic run's actual single/multi draw
 * (`run.ts`'s `wantsMultiGate`) is driven by `loadWordMix()`, not by
 * `loadProficiency()` directly, so a caller that saved proficiency without
 * this would leave the run flying the OLD mix. This was a real bug: the
 * pre-game `LevelSelect` screen only ever called `saveProficiency`, so a
 * player who chose Intermediate there (and never separately opened Settings,
 * whose own control used to be the only place `saveWordMix` was called)
 * still had `wordMix === "single"` — the run drew no multi-syllable words at
 * all, silently falling back to the generic per-tone placeholder for every
 * gate. Collapsing both writes into one call makes that pairing impossible
 * to break again from a second call site.
 *
 * Intermediate maps to `"all"`, not `"multi"` — Intermediate's own pool
 * (`wordsForList` in `words.ts`) is additive (single OR two-syllable), so
 * the draw has to actually reach both halves of it. `"multi"` would force
 * every gate into a pair (`wantsMultiGate()` returning unconditionally
 * true), which is the same bug as the one this function exists to prevent,
 * just flipped: instead of a mix that never draws a pair, a "mix" that only
 * ever draws pairs and never the single-syllable half of the pool it just
 * grew to include.
 */
export function saveProficiency(p: Proficiency): void {
  accountStorage.setItem(PROFICIENCY_KEY, p);
  saveWordMix(p === "beginner" ? "single" : "all");
}

// ------------------------------------------------------- TOCFL level choice

const LAST_LEVEL_KEY = "toneflap.lastlevel.v1";

/**
 * The last TOCFL level (or Mix) chosen on the pre-game picker, kept
 * separately per proficiency since free's own access differs between them
 * (Beginner: 1/2/Mix; Intermediate: 1 only). Re-picked every play — this is
 * only the screen's pre-selected default, not an access grant on its own;
 * `tierLimits()` is still checked fresh each time in case the tier changed.
 */
interface LastLevelState {
  beginner?: LevelChoice;
  intermediate?: LevelChoice;
}

function isLevelChoice(v: unknown): v is LevelChoice {
  return v === "mix" || v === 1 || v === 2 || v === 3;
}

export function loadLastLevel(proficiency: Proficiency): LevelChoice | null {
  try {
    const raw = accountStorage.getItem(LAST_LEVEL_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LastLevelState;
    const v = s[proficiency];
    return isLevelChoice(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLastLevel(proficiency: Proficiency, level: LevelChoice): void {
  let state: LastLevelState = {};
  try {
    const raw = accountStorage.getItem(LAST_LEVEL_KEY);
    if (raw) state = JSON.parse(raw) as LastLevelState;
  } catch {
    state = {};
  }
  state[proficiency] = level;
  accountStorage.setItem(LAST_LEVEL_KEY, JSON.stringify(state));
}

// -------------------------------------------------------- speech style

const SPEECH_STYLE_KEY = "toneflap.speechstyle.v1";

/**
 * The stored Speech style preference — which recording style a run plays.
 * Device-local, not synced. Defaults to textbook. Read it through
 * `effectiveSpeechStyle`, never directly, when deciding what a run flies.
 */
export function loadSpeechStyle(): SpeechStyle {
  try {
    const raw = accountStorage.getItem(SPEECH_STYLE_KEY);
    return raw === "natural" ? "natural" : "textbook";
  } catch {
    return "textbook";
  }
}

export function saveSpeechStyle(style: SpeechStyle): void {
  accountStorage.setItem(SPEECH_STYLE_KEY, style);
}

/**
 * The style a run (or the visualiser) actually uses. A guest always plays
 * textbook; the stored value is left alone, so a free/Pro player who signs
 * out and back in gets their choice back. UX gating only — not a security
 * boundary (spec decision 2).
 */
export function effectiveSpeechStyle(tier: Tier): SpeechStyle {
  return tier === "guest" ? "textbook" : loadSpeechStyle();
}

// ---------------------------------------------------------------- theme

const THEME_KEY = "toneflap.theme.v1";

/**
 * The stored game-canvas theme. Device-local, not synced. Read it through
 * `effectiveTheme` (src/game/themes.ts) when deciding what to draw, so a
 * theme the player has not unlocked falls back to the default.
 */
export function loadTheme(): ThemeId {
  // Guarded: the renderer reads this where tests have no localStorage.
  try {
    const raw = accountStorage.getItem(THEME_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(id: ThemeId): void {
  accountStorage.setItem(THEME_KEY, id);
}
