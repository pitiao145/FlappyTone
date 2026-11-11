// Brief 44: plays recorded clips as a run of gates through the game's own
// learning function (learnGridFromGate) and compares the grid with the true
// ruler of the same frames. Dev-only, offline, numbers only.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { learnGridFromGate, newGridLearnState, startGridRun } from "../../pitch/calibration.ts";
import { heardUtterance } from "../../game/scoring.ts";
import { tuning, gridLearnParams } from "../../game/tuning.ts";
import { F0C, clipList, cachedTrack, cachedRun } from "./tracks.mjs";
import { listWavs, med, pct } from "./lib.mjs";

export const GATES_PER_RUN = 10; // ASSUMED run length for the per-run step cap
const BAND_HZ = [70, 400]; // tracker band in the cached live runs (Jane and Pierre floors are 70)

/** Deterministic shuffle (mulberry32). */
function shuffled(list, seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** One speaker's gates: { tone (single 1-4, else null), stHz: semitones from 1 Hz-free reference F0C, t (ms) }. */
export function speakerGates(who, style = "textbook") {
  if (who === "jane") {
    return clipList().filter((c) => c.set === style && c.tones.length >= 1).map((c) => {
      const o = cachedTrack(c, "live");
      return gateOf(c.id, c.tones, o, 0);
    });
  }
  const DIR = "fixtures/captures/pierre";
  const cal = JSON.parse(readFileSync(`${DIR}/calibration.json`, "utf8"));
  return listWavs(DIR).map((file) => ({ set: "pierre", file, id: basename(file, ".wav") }))
    .filter((c) => /^pierre_[a-z]+\d+_\d$/.test(c.id))
    .map((c) => {
      const tones = c.id.match(/^pierre_[a-z]+?(\d+)_\d$/)[1].split("").map(Number);
      const o = cachedRun(c, "live-pierre", { minVoicedRunMs: 64, noiseFloor: 1e-4, f0Center: cal.f0Center });
      return gateOf(c.id, tones, o, 12 * Math.log2(cal.f0Center / F0C));
    });
}
function gateOf(id, tones, o, centreSt) {
  const st = [], samples = [];
  for (let i = 0; i < o.t.length; i++) {
    samples.push({ atMs: o.t[i] * 1000, voiced: !!o.v[i] });
    if (o.v[i] && o.st[i] !== null) st.push(o.st[i] + centreSt); // st from F0C
  }
  const tone = tones.length === 1 && tones[0] >= 1 ? tones[0] : null;
  return { id, tone, st, heard: heardUtterance(samples, tuning().mergeGapMs) };
}

/** The true ruler of these gates' frames (brief 43 rule), st from F0C. */
export function trueRuler(gates) {
  const all = gates.filter((g) => g.heard).flatMap((g) => g.st);
  const creak = med(all) - 10;
  const mid = med(all.filter((s) => s >= creak));
  const pool = (t) => gates.filter((g) => g.heard && g.tone === t).flatMap((g) => g.st).filter((s) => s >= creak);
  return { mid, top: pct(pool(1), 90), bottom: pct(pool(3), 10) };
}

/**
 * Plays `n` gates in a fixed order (cycling when the speaker has fewer clips)
 * from a start grid. `voiceShift` moves the voice (st), as "voice 2 st lower".
 * Returns per-gate errors vs the true ruler and the final grid (st from F0C).
 */
export function simulate(gates, start, { n = 120, seed = 44, voiceShift = 0, params = gridLearnParams() } = {}) {
  const truth = trueRuler(gates);
  const t = { mid: truth.mid + voiceShift, top: truth.top + voiceShift, bottom: truth.bottom + voiceShift };
  const order = shuffled(gates, seed);
  const refSt = start.mid; // refHz = the calibrated middle
  let s = newGridLearnState({ midSt: 0, up: start.up, down: start.down });
  const curve = [];
  for (let k = 0; k < n; k++) {
    if (k % GATES_PER_RUN === 0) s = startGridRun(s);
    const g = order[k % order.length];
    s = learnGridFromGate(s, {
      semitones: g.st.map((x) => x + voiceShift - refSt),
      tone: g.tone,
      heard: g.heard,
      bandLowSt: 12 * Math.log2(BAND_HZ[0] / F0C) + voiceShift - refSt,
      bandHighSt: 12 * Math.log2(BAND_HZ[1] / F0C) + voiceShift - refSt,
    }, params);
    const mid = refSt + s.grid.midSt;
    curve.push({ gate: k + 1, mid: mid - t.mid, top: mid + s.grid.up - t.top, bottom: mid - s.grid.down - t.bottom });
  }
  const mid = refSt + s.grid.midSt;
  return { truth: t, curve, grid: { mid, up: s.grid.up, down: s.grid.down }, state: s };
}

export const worst = (c) => Math.max(Math.abs(c.mid), Math.abs(c.top), Math.abs(c.bottom));
