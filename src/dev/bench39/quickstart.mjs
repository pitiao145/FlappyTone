// Brief 50 step 1: a first run with NO calibration. The player picks "lower"
// or "higher" voice, the grid starts from that preset (115 / 200 Hz, +6 / -5
// st, the landing demo's), and the learned scale (brief 44) fits it while they
// play. Replays recorded clips as gates and counts wall hits with a simple
// model of the game's corridor:
//   - the voice is drawn on the current grid (semitonesToChao),
//   - the corridor is the word's target line ± the "wide" tolerance
//     (toleranceChao × 1.4, plus the timing widening, corridorToleranceAt),
//   - a wall hit = voiced frames outside the corridor for collisionSustainMs.
// Timing is the player's own clock (first to last voiced frame), so the model
// never charges a late start: it is a best case for timing, a fair case for height.
// 3 hearts per run, as in the game; a dead run starts a new one.
// Dev-only, offline, numbers only.
//   node src/dev/bench39/quickstart.mjs [--n 60]
import { speakerGates, trueRuler, gateOrder } from "./gridsim.mjs";
import { learnGridFromGate, newGridLearnState, startGridRun, gridLearned } from "../../pitch/calibration.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { tuning, gridLearnParams } from "../../game/tuning.ts";
import { corridorChaoAt, corridorToleranceAt, toleranceChao } from "../../game/gates.ts";
import { readFileSync } from "node:fs";
import { F0C } from "./tracks.mjs";

const N = process.argv.includes("--n") ? +process.argv[process.argv.indexOf("--n") + 1] : 60;
const SEEDS = [44, 45, 46, 47, 48];
const SHAPES = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8"));
const PRESET = { lower: { hz: 115, up: 6, down: 5 }, higher: { hz: 200, up: 6, down: 5 } };
const WIDE = 1.4;
const HEARTS = 3;
const st = (hz) => 12 * Math.log2(hz / F0C);

/** One gate's wall hit on a grid (st from F0C). */
function wallHit(g, shape, grid, shift) {
  if (!shape || g.st.length < 3 || !g.heard) return false;
  const gs = { polyline: shape.polyline, durationS: shape.duration_s ?? 0.6 };
  const tol0 = toleranceChao(g.tones, tuning().baseToleranceH * WIDE);
  const span = g.times.at(-1) - g.times[0];
  let since = null;
  for (let i = 0; i < g.st.length; i++) {
    const t = span > 0 ? (g.times[i] - g.times[0]) / span : 0;
    const chao = semitonesToChao(g.st[i] + shift - grid.mid, grid.up, grid.down);
    const err = Math.abs(chao - corridorChaoAt(gs, t));
    if (err > corridorToleranceAt(gs, t, tol0, 1)) {
      since ??= g.times[i];
      if ((g.times[i] - since) * 1000 >= tuning().collisionSustainMs) return true;
    } else since = null;
  }
  return false;
}

/**
 * Plays `n` gates from a preset. Returns walls in run 1 (until 3 hearts or
 * gate 10), walls in the first 10 / 30 gates, gates in run 1, and the gate
 * after which the worst line error stays within 1 st.
 */
function play(gates, shapes, voiceShift, preset, params, seed) {
  const truth0 = trueRuler(gates);
  const truth = { mid: truth0.mid + voiceShift, top: truth0.top + voiceShift, bottom: truth0.bottom + voiceShift };
  const order = gateOrder(gates, N, seed, "game");
  const ref = st(preset.hz);
  let s = startGridRun(newGridLearnState({ midSt: 0, up: preset.up, down: preset.down }));
  let hearts = HEARTS, run = 1, run1Walls = 0, run1Gates = 0, w10 = 0, w30 = 0;
  const err = [], hits = [];
  for (let k = 0; k < N; k++) {
    const g = order[k];
    const grid = { mid: ref + s.grid.midSt, up: s.grid.up, down: s.grid.down };
    const hit = wallHit(g, shapes[g.id], grid, voiceShift);
    if (run === 1) { run1Gates++; if (hit) run1Walls++; }
    hits.push(hit);
    if (hit && k < 10) w10++;
    if (hit && k < 30) w30++;
    s = learnGridFromGate(s, {
      semitones: g.st.map((x) => x + voiceShift - ref),
      targetChao: g.targetChao, tone: g.tone, heard: g.heard, wallHit: hit,
      bandLowSt: st(70) + 0 - ref, bandHighSt: st(400) - ref,
    }, params);
    if (hit && --hearts <= 0) { run++; hearts = HEARTS; s = startGridRun(s); }
    const m = ref + s.grid.midSt;
    err.push(Math.max(Math.abs(m - truth.mid), Math.abs(m + s.grid.up - truth.top), Math.abs(m - s.grid.down - truth.bottom)));
  }
  const settled = err.findIndex((_, i) => err.slice(i).every((e) => e <= 1));
  return { hits, run1Walls, run1Gates, w10, w30, settled: settled < 0 ? null : settled + 1, learned: gridLearned(s, params.minFrames), runs: run };
}

const base = gridLearnParams();
const SPEEDS = {
  "today (10%, cap 1.5/run)": { ...base },
  "start 50% x3, no cap until learned": { ...base, startRate: 0.5, startGates: 3, uncappedUntilLearned: true },
  "start 50% x5, no cap until learned": { ...base, startRate: 0.5, startGates: 5, uncappedUntilLearned: true },
  "start 30% x8, no cap until learned": { ...base, startRate: 0.3, startGates: 8, uncappedUntilLearned: true },
  "start 70% x3, no cap until learned": { ...base, startRate: 0.7, startGates: 3, uncappedUntilLearned: true },
  "start 80% x2, no cap until learned": { ...base, startRate: 0.8, startGates: 2, uncappedUntilLearned: true },
  "no start rate, no cap until learned": { ...base, uncappedUntilLearned: true },
};

const jane = speakerGates("jane", "textbook");
const pierre = speakerGates("pierre");
const PIERRE_SHAPES = {};
const P2J = { ma1: "ma1b", ma2: "ma2", ma3: "ma3b", ma4: "ma4b", shu1: "shu1", shu4: "shu4", yi1: "yi1", yi3: "yi3" };
for (const g of pierre) { const w = g.id.match(/^pierre_([a-z]+\d+)_\d$/)[1]; if (P2J[w]) PIERRE_SHAPES[g.id] = SHAPES.textbook[P2J[w]]; else if (SHAPES.textbook[w]) PIERRE_SHAPES[g.id] = SHAPES.textbook[w]; }
const midHz = (gates) => F0C * 2 ** (trueRuler(gates).mid / 12);
const jMid = midHz(jane), pMid = midHz(pierre);
const shiftTo = (from, hz) => 12 * Math.log2(hz / from);
const tr = (gates) => { const r = trueRuler(gates); return `up ${(r.top - r.mid).toFixed(1)} down ${(r.mid - r.bottom).toFixed(1)}`; };
console.log(`true middles: native speaker ${jMid.toFixed(0)} Hz (${tr(jane)}), Pierre ${pMid.toFixed(0)} Hz (${tr(pierre)}) | ${N} gates, seeds ${SEEDS.join(",")}, wide corridor, 3 hearts`);

const CASES = [
  ["Pierre 129 Hz, picks lower", pierre, PIERRE_SHAPES, 0, "lower"],
  ["native 181 Hz, picks higher", jane, SHAPES.textbook, 0, "higher"],
  ["Pierre's voice at 150 Hz, picks lower", pierre, PIERRE_SHAPES, shiftTo(pMid, 150), "lower"],
  ["Pierre's voice at 150 Hz, picks higher", pierre, PIERRE_SHAPES, shiftTo(pMid, 150), "higher"],
  ["native voice at 150 Hz, picks lower", jane, SHAPES.textbook, shiftTo(jMid, 150), "lower"],
  ["native voice at 150 Hz, picks higher", jane, SHAPES.textbook, shiftTo(jMid, 150), "higher"],
  ["Pierre 129 Hz, picks higher (wrong pick)", pierre, PIERRE_SHAPES, 0, "higher"],
  ["Pierre, calibrated (reference)", pierre, PIERRE_SHAPES, 0, "cal"],
];
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (xs) => avg(xs).toFixed(1);
for (const [name, gates, shapes, shift, pick] of CASES) {
  const cal = JSON.parse(readFileSync("fixtures/captures/pierre/calibration.json", "utf8"));
  const preset = pick === "cal" ? { hz: cal.f0Center, up: cal.rangeSemitones, down: cal.rangeDownSemitones } : PRESET[pick];
  console.log(`\n${name}`);
  for (const [label, params] of Object.entries(SPEEDS)) {
    if (pick === "cal" && label !== Object.keys(SPEEDS)[0]) continue;
    const r = SEEDS.map((seed) => play(gates, shapes, shift, preset, params, seed));
    const settled = r.map((x) => x.settled);
    const byGate = Array.from({ length: 10 }, (_, i) => r.filter((x) => x.hits[i]).length).join("");
    console.log(`  ${label.padEnd(38)} walls per gate 1-10 (of ${SEEDS.length} seeds): ${byGate} | run 1: ${fmt(r.map((x) => x.run1Walls))} walls in ${fmt(r.map((x) => x.run1Gates))} gates | walls in gates 1-10 ${fmt(r.map((x) => x.w10))}, 1-30 ${fmt(r.map((x) => x.w30))} | settled (<=1 st for good) at gate ${settled.map((x) => x ?? "-").join("/")}`);
  }
}
