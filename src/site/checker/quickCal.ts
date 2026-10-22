/**
 * The tone visualizer's ~10 s calibration: one "mā" (high, level) and one "mǎ"
 * (low) instead of the app's full flow. Pure math + its own storage key — no
 * Web Audio, so it is tested offline and safe in the page's initial chunk.
 *
 * Same anchors as the real calibration (PRD §5.4): the board's upward half
 * from the player's Tone 1 level, the downward half from their Tone 3 floor,
 * through the same pure function the calibration flight uses
 * (`computeRangeHalvesFromExtremes`, no claw-back). What differs is the
 * centre: the app measures it from a talk step; here there is none, so it is
 * the geometric midpoint of the two medians — the height a level tone and a
 * low tone straddle. Good enough to draw a shape on; the app's own
 * calibration replaces it (`flappytone.quickcal.v1` is never read by /app).
 *
 * Deliberately never writes the app's settings key (`toneflap.settings.v3`).
 */

import {
  computeRangeHalvesFromExtremes,
  median,
  RANGE_DOWN_SEMITONES_MIN,
  RANGE_SEMITONES_MAX,
  RANGE_UP_SEMITONES_MIN,
} from "../../pitch/calibration.ts";
import { hzToSemitones } from "../../pitch/math.ts";

export const QUICK_CAL_KEY = "flappytone.quickcal.v1";

/** The subset of `CalibrationSettings` the checker's board needs. */
export interface QuickCal {
  f0Center: number;
  noiseFloor: number;
  rangeSemitones: number;
  rangeDownSemitones: number;
  voiceRms?: number;
}

/**
 * Below this gap between the "mā" and "mǎ" medians, the two takes did not
 * sound different enough to size a board on (a hum, two takes of one tone).
 */
export const MIN_HIGH_LOW_SEMITONES = 2;

/** Voiced frames each take needs — `computeRangeHalvesFromExtremes`' own floor. */
export const MIN_FRAMES = 10;

/**
 * The board from the two takes' voiced f0 (Hz), or null when either take is
 * too short or the two are not clearly apart ("couldn't hear that" — never a
 * blame on the speaker, hard rule 8).
 */
export function quickCalibration(
  highF0s: number[],
  lowF0s: number[],
  noiseFloor: number,
  voiceRms?: number,
): QuickCal | null {
  if (highF0s.length < MIN_FRAMES || lowF0s.length < MIN_FRAMES) return null;
  const high = median(highF0s);
  const low = median(lowF0s);
  if (hzToSemitones(high, low) < MIN_HIGH_LOW_SEMITONES) return null;
  const f0Center = Math.sqrt(high * low);
  if (f0Center < 70 || f0Center > 400) return null;
  const halves = computeRangeHalvesFromExtremes(
    highF0s.map((f) => hzToSemitones(f, f0Center)),
    lowF0s.map((f) => hzToSemitones(f, f0Center)),
  );
  if (!halves) return null;
  return {
    f0Center,
    noiseFloor,
    rangeSemitones: halves.up,
    rangeDownSemitones: halves.down,
    ...(voiceRms !== undefined && voiceRms > 0 && voiceRms < 1 ? { voiceRms } : {}),
  };
}

function valid(c: QuickCal): boolean {
  return (
    typeof c.f0Center === "number" &&
    c.f0Center >= 70 &&
    c.f0Center <= 400 &&
    typeof c.noiseFloor === "number" &&
    c.noiseFloor > 0 &&
    typeof c.rangeSemitones === "number" &&
    c.rangeSemitones >= RANGE_UP_SEMITONES_MIN &&
    c.rangeSemitones <= RANGE_SEMITONES_MAX &&
    typeof c.rangeDownSemitones === "number" &&
    c.rangeDownSemitones >= RANGE_DOWN_SEMITONES_MIN &&
    c.rangeDownSemitones <= RANGE_SEMITONES_MAX
  );
}

export function loadQuickCal(): QuickCal | null {
  try {
    const raw = localStorage.getItem(QUICK_CAL_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as QuickCal;
    return valid(c) ? c : null;
  } catch {
    return null;
  }
}

export function saveQuickCal(c: QuickCal): void {
  try {
    localStorage.setItem(QUICK_CAL_KEY, JSON.stringify(c));
  } catch {
    // Private mode: the board still works for this visit.
  }
}

export function clearQuickCal(): void {
  try {
    localStorage.removeItem(QUICK_CAL_KEY);
  } catch {
    // ignore
  }
}
