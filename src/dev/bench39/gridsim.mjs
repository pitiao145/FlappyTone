// Brief 44: plays recorded clips as a run of gates through the game's own
// learning function (learnGridFromGate) and compares the grid with the true
// ruler of the same frames. Dev-only, offline, numbers only.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { learnGridFromGate, newGridLearnState, startGridRun } from "../../pitch/calibration.ts";
import { heardUtterance } from "../../game/scoring.ts";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { tuning, gridLearnParams } from "../../game/tuning.ts";
import { corridorChaoAt, nextTone } from "../../game/gates.ts";
import { F0C, clipList, cachedTrack, cachedRun } from "./tracks.mjs";
import { listWavs, med, pct } from "./lib.mjs";

const SHAPES = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8"));
// Pierre's words -> Jane's word with the same syllables and tones (no match: no target).
const PIERRE_TO_JANE = { ma1: "ma1b", ma2: "ma2", ma3: "ma3b", ma4: "ma4b", shu1: "shu1", shu4: "shu4", yi1: "yi1", yi3: "yi3", bangmang12: "bangmang12", duimian44: "duimian44", gongren12: "gongren12", haowan32: "haowan32", keneng32: "keneng32", mama10: "mama10", nihao33: "nihao33", niunai23: "niunai23" };
export const GATES_PER_RUN = 10; // ASSUMED run length for the per-run step cap
const BAND_HZ = [70, 400]; // tracker band in the cached live runs (Jane and Pierre floors are 70)

/** Deterministic random numbers (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/**
 * The gate order. "game": the game's default (single words; each gate's tone
 * from the game's own `nextTone`, then a random word of that tone). "all": every
 * clip, pairs included, shuffled and cycled.
 */
export function gateOrder(gates, n, seed, mix = "game") {
  const rnd = rng(seed);
  if (mix === "pairs") {
    // The game's pairs mode: multi-syllable words only, drawn at random.
    const multi = gates.filter((g) => g.tones.length >= 2);
    return Array.from({ length: n }, () => multi[Math.floor(rnd() * multi.length)]);
  }
  if (mix === "all") {
    const out = [...gates];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return Array.from({ length: n }, (_, k) => out[k % out.length]);
  }
  const byTone = { 1: [], 2: [], 3: [], 4: [] };
  for (const g of gates) if (g.tone) byTone[g.tone].push(g);
  const tones = [], out = [];
  for (let k = 0; k < n; k++) {
    const t = nextTone(tones, rnd); tones.push(t);
    out.push(byTone[t][Math.floor(rnd() * byTone[t].length)]);
  }
  return out;
}

/** One speaker's gates: { tone (single 1-4, else null), stHz: semitones from 1 Hz-free reference F0C, t (ms) }. */
export function speakerGates(who, style = "textbook") {
  if (who === "jane") {
    return clipList().filter((c) => c.set === style && c.tones.length >= 1).map((c) => {
      const o = cachedTrack(c, "live");
      return gateOf(c.id, c.tones, o, 0, SHAPES[style][c.id]);
    });
  }
  const DIR = "fixtures/captures/pierre";
  const cal = JSON.parse(readFileSync(`${DIR}/calibration.json`, "utf8"));
  return listWavs(DIR).map((file) => ({ set: "pierre", file, id: basename(file, ".wav") }))
    .filter((c) => /^pierre_[a-z]+\d+_\d$/.test(c.id))
    .map((c) => {
      const tones = c.id.match(/^pierre_[a-z]+?(\d+)_\d$/)[1].split("").map(Number);
      const o = cachedRun(c, "live-pierre", { minVoicedRunMs: 64, noiseFloor: 1e-4, f0Center: cal.f0Center });
      const word = c.id.match(/^pierre_([a-z]+\d+)_\d$/)[1];
      const jid = PIERRE_TO_JANE[word];
      return gateOf(c.id, tones, o, 12 * Math.log2(cal.f0Center / F0C), jid ? SHAPES.textbook[jid] : undefined);
    });
}
/**
 * One gate. Target line per frame on the player's own clock: t runs from the
 * first to the last voiced frame of the gate (the game does not know where the
 * word starts inside the gate either).
 */
function gateOf(id, tones, o, centreSt, shape) {
  const st = [], times = [], samples = [];
  for (let i = 0; i < o.t.length; i++) {
    samples.push({ atMs: o.t[i] * 1000, voiced: !!o.v[i] });
    if (o.v[i] && o.st[i] !== null) { st.push(o.st[i] + centreSt); times.push(o.t[i]); } // st from F0C
  }
  const tone = tones.length === 1 && tones[0] >= 1 ? tones[0] : null;
  const span = times.length > 1 ? times.at(-1) - times[0] : 0;
  const targetChao = shape && span > 0 ? times.map((t) => corridorChaoAt(shape, (t - times[0]) / span)) : undefined;
  return { id, tone, tones, st, times, targetChao, heard: heardUtterance(samples, tuning().mergeGapMs) };
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
export function simulate(gates, start, { n = 120, seed = 44, voiceShift = 0, params = gridLearnParams(), mix = "game", truth = trueRuler(gates) } = {}) {
  const t = { mid: truth.mid + voiceShift, top: truth.top + voiceShift, bottom: truth.bottom + voiceShift };
  const order = gateOrder(gates, n, seed, mix);
  const refSt = start.mid; // refHz = the calibrated middle
  let s = newGridLearnState({ midSt: 0, up: start.up, down: start.down });
  const curve = [];
  for (let k = 0; k < n; k++) {
    if (k % GATES_PER_RUN === 0) s = startGridRun(s);
    const g = order[k];
    s = learnGridFromGate(s, {
      semitones: g.st.map((x) => x + voiceShift - refSt),
      targetChao: g.targetChao,
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

/** Single tones right (%) with the reader (classifier v2) on a grid (st from F0C). Same rule as scorecard.mjs section 4. */
export function singlesRight(gates, grid, voiceShift = 0) {
  let n = 0, ok = 0;
  for (const g of gates.filter((g) => g.tones.length === 1 && g.tones[0] >= 1)) {
    if (g.st.length < 3) continue;
    const pts = g.st.map((x, i) => ({ tMs: (g.times[i] - g.times[0]) * 1000, chao: semitonesToChao(x + voiceShift - grid.mid, grid.up, grid.down) }));
    n++;
    const r = classifyToneV2({ points: pts, startedAtMs: 0, endedAtMs: pts.at(-1).tMs });
    if (r && r.tone === g.tones[0]) ok++;
  }
  return (100 * ok) / n;
}

/**
 * Brief 44 acceptance 2: the reader after learning (120 gates, game mix) from a
 * correct start vs from a voice 2 st lower than calibrated. Truth = Jane's one ruler.
 */
export function readerAfterLearning(gates, truth, { n = 120, seed = 44 } = {}) {
  const start = { mid: truth.mid, up: truth.top - truth.mid, down: truth.mid - truth.bottom };
  const correct = simulate(gates, start, { n, seed, truth });
  const lower = simulate(gates, start, { n, seed, truth, voiceShift: -2 });
  return {
    correct: singlesRight(gates, correct.grid),
    lower: singlesRight(gates, lower.grid, -2),
    notLearned: singlesRight(gates, start.mid !== undefined ? start : start, -2),
    grids: { correct: correct.grid, lower: lower.grid },
  };
}

/**
 * 44 review checks. Worst error (st) over the last 100 of `n` gates.
 * lines: middle, top and bottom vs the (shifted) truth; halves: vs the start halves.
 */
export function longRun(gates, truth, { mix = "game", voiceShift = 0, n = 400, seed = 44 } = {}) {
  const start = { mid: truth.mid, up: truth.top - truth.mid, down: truth.mid - truth.bottom };
  const r = simulate(gates, start, { n, seed, mix, voiceShift, truth });
  const tail = r.curve.slice(-100);
  const lines = Math.max(...tail.map(worst));
  const halves = Math.max(...tail.map((c) => Math.max(Math.abs(c.top - c.mid), Math.abs(c.mid - c.bottom))));
  return { lines, halves, grid: r.grid, start };
}
