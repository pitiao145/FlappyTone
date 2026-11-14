/**
 * Brief 44: the player's one ruler, stored on the device.
 *
 * A new, versioned record beside `CalibrationSettings` (key `toneflap.settings.v3`),
 * not a new key for that record: the old record stays exactly as it is, so a
 * build without this feature (or with `tuning().playerRulerV2` off) is not
 * touched at all. An existing calibration seeds the ruler (middle and halves
 * carried over, marked "not yet learned"); nobody is sent through calibration
 * again for it. A record that cannot be read is seeded again from the
 * calibration, never a broken screen.
 *
 * Numbers only (hard rule 12): weighted histograms of the player's pitch in
 * semitones, kept in this browser. Nothing is uploaded.
 */
import {
  GRID_BIN_ST,
  GRID_SPAN_ST,
  gridLearned,
  learnGridFromGate,
  newGridLearnState,
  startGridRun,
  type GridHist,
  type GridLearnState,
  type LearnGate,
  type PlayerGrid,
} from "../pitch/calibration.ts";
import type { CalibrationSettings } from "./settings.ts";
import { gridLearnParams, tuning } from "./tuning.ts";

export const RULER_KEY = "toneflap.ruler.v1";
const BINS = Math.round((2 * GRID_SPAN_ST) / GRID_BIN_ST) + 1;

export interface PlayerRulerRecord {
  version: 1;
  /** The calibrated middle (Hz). Every semitone in `state` is relative to it. */
  refHz: number;
  /** `CalibrationSettings.f0Center` this record was seeded from; a new calibration reseeds. */
  calibratedF0: number;
  /** False until both the first-tone and the third-tone pools have enough frames. */
  learned: boolean;
  state: GridLearnState;
}

/** A fresh record from a calibration: middle and halves carried over, not yet learned. */
export function seedRuler(s: CalibrationSettings): PlayerRulerRecord {
  return {
    version: 1,
    refHz: s.f0Center,
    calibratedF0: s.f0Center,
    learned: false,
    state: newGridLearnState({ midSt: 0, up: s.rangeSemitones, down: s.rangeDownSemitones }),
  };
}

/** The grid the tracker flies on: centre in Hz and the two halves. */
export function rulerGrid(r: PlayerRulerRecord): { f0Center: number; up: number; down: number } {
  return { f0Center: r.refHz * 2 ** (r.state.grid.midSt / 12), up: r.state.grid.up, down: r.state.grid.down };
}

/** Pitch (Hz) as semitones from the record's fixed reference. */
export function stFromRef(r: PlayerRulerRecord, hz: number): number {
  return 12 * Math.log2(hz / r.refHz);
}

export function startRulerRun(r: PlayerRulerRecord): PlayerRulerRecord {
  return { ...r, state: startGridRun(r.state) };
}

/** Learn from one resolved gate (semitones from `refHz`). Unheard gates change nothing. */
export function learnRuler(r: PlayerRulerRecord, gate: LearnGate): PlayerRulerRecord {
  const state = learnGridFromGate(r.state, gate, gridLearnParams());
  if (state === r.state) return r;
  return { ...r, state, learned: gridLearned(state, tuning().gridLearnMinFrames) };
}

/** Sets the halves after the calibration flight measured them (top/bottom step). */
export function withHalves(r: PlayerRulerRecord, up: number, down: number): PlayerRulerRecord {
  const mid = r.state.grid.midSt;
  const grid: PlayerGrid = { midSt: mid, up, down };
  return { ...r, state: { ...r.state, grid } };
}

const okNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
function okHist(h: unknown): h is GridHist {
  const x = h as GridHist;
  return !!x && Array.isArray(x.w) && x.w.length === BINS && x.w.every((v) => okNum(v) && v >= 0) && okNum(x.frames) && x.frames >= 0;
}
function valid(r: unknown): r is PlayerRulerRecord {
  const x = r as PlayerRulerRecord;
  const t = tuning();
  if (!x || x.version !== 1 || !okNum(x.refHz) || x.refHz < 50 || x.refHz > 500 || !okNum(x.calibratedF0)) return false;
  const s = x.state, g = s?.grid;
  return (
    !!g && okNum(g.midSt) && Math.abs(g.midSt) <= 24 &&
    okNum(g.up) && g.up >= t.gridHalfMin - 1 && g.up <= t.gridHalfMax &&
    okNum(g.down) && g.down >= t.gridHalfMin - 1 && g.down <= t.gridHalfMax &&
    okHist(s.all) && okHist(s.t1) && okHist(s.t3) &&
    !!s.runMoved && okNum(s.runMoved.mid) && okNum(s.runMoved.up) && okNum(s.runMoved.down) && okNum(s.gates)
  );
}

/**
 * The ruler for this calibration: the stored one when it is readable and was
 * seeded from this same calibration, else a fresh seed. Never throws.
 */
export function loadRuler(s: CalibrationSettings): PlayerRulerRecord {
  try {
    const raw = localStorage.getItem(RULER_KEY);
    if (raw) {
      const r = JSON.parse(raw) as unknown;
      if (valid(r) && r.calibratedF0 === s.f0Center) return { ...r, learned: !!r.learned };
    }
  } catch {
    // unreadable: seed below
  }
  return seedRuler(s);
}

/** Stores the record; histogram weights rounded to keep it small. Never throws. */
export function saveRuler(r: PlayerRulerRecord): void {
  try {
    const round = (h: GridHist): GridHist => ({ w: h.w.map((v) => Math.round(v * 1000) / 1000), frames: h.frames });
    const out: PlayerRulerRecord = { ...r, state: { ...r.state, all: round(r.state.all), t1: round(r.state.t1), t3: round(r.state.t3) } };
    localStorage.setItem(RULER_KEY, JSON.stringify(out));
  } catch {
    // storage full or blocked: learning simply does not persist
  }
}
