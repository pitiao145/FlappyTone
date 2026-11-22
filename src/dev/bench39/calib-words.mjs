// Brief 50, 22 Nov: which calibration words and which rule give the player's
// scale (middle, up half, down half) closest to their true one-ruler scale
// (brief 43: middle = median of all tone frames, top = p90 first tones,
// bottom = p10 third tones), from one take per word?
//   A "媽+馬 midpoint": today's tuner (each word's median, average; top p90 媽, bottom p10 馬)
//   B "媽+馬 fit": the fit below on 媽 and 馬 only
//   C "mā má mǎ mà fit": the fit on the four words learners know first
// The fit: every voiced frame says  st = middle + a*up + b*down , where the
// word's target at that moment gives a = max(c-3,0)/2, b = min(c-3,0)/2 (the
// game's own chao rule). Linear in (middle, up, down): least squares,
// re-weighted (Huber, 1 st) so a mis-timed glide does not drag it.
// The learned scale votes the same way in play, so calibration and learning agree.
//   node src/dev/bench39/calib-words.mjs
import { speakerGates, trueRuler } from "./gridsim.mjs";
import { F0C, cachedRun } from "./tracks.mjs";
import { readFileSync } from "node:fs";
import { corridorChaoAt } from "../../game/gates.ts";

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); const i = (p / 100) * (s.length - 1); const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const creak = (st) => { const m = med(st); return st.filter((x) => x >= m - 10); };

function midpoint(t1, t3) {
  const m1 = med(creak(t1.st)), m3 = med(creak(t3.st)), mid = (m1 + m3) / 2;
  return { mid, up: pct(creak(t1.st), 90) - mid, down: mid - pct(creak(t3.st).filter((x) => x >= mid - 10), 10) };
}

/**
 * D/E: Mandarin's high and low points across the four tones: the top from the
 * frames whose target sits at the top (first tone, the start of the fourth,
 * the end of the second), p90; the bottom from frames whose target sits at
 * the bottom (third-tone dip, end of the fourth, second-tone dip), p10.
 */
function ends(s, mid) {
  const hi = [], lo = [];
  for (const k of [1, 2, 3, 4]) {
    const g = s[k];
    const keep = creak(g.st), floor = Math.min(...keep);
    g.st.forEach((x, i) => { const c = g.targetChao[i]; if (x < floor || !Number.isFinite(c)) return; if (c >= 4.5) hi.push(x); if (c <= 1.5) lo.push(x); });
  }
  return { mid, up: pct(hi, 90) - mid, down: mid - pct(lo, 10) };
}

/** Solve the 3x3 normal equations with weights. */
function solve(rows, w) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], y = [0, 0, 0];
  rows.forEach(([x, s], i) => { for (let r = 0; r < 3; r++) { y[r] += w[i] * x[r] * s; for (let c = 0; c < 3; c++) A[r][c] += w[i] * x[r] * x[c]; } });
  // Gaussian elimination
  for (let i = 0; i < 3; i++) {
    let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [y[i], y[p]] = [y[p], y[i]];
    if (Math.abs(A[i][i]) < 1e-9) return null;
    for (let r = i + 1; r < 3; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c]; y[r] -= f * y[i]; }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) { let s = y[i]; for (let c = i + 1; c < 3; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return x;
}
export function fitScale(gates) {
  const rows = [];
  for (const g of gates) {
    const keep = creak(g.st);
    const floor = Math.min(...keep);
    g.st.forEach((s, i) => {
      const c = g.targetChao?.[i];
      if (!Number.isFinite(c) || s < floor) return;
      rows.push([[1, Math.max(c - 3, 0) / 2, Math.min(c - 3, 0) / 2], s]);
    });
  }
  let w = rows.map(() => 1), x = null;
  for (let it = 0; it < 8; it++) {
    x = solve(rows, w);
    if (!x) return null;
    w = rows.map(([r, s]) => { const e = Math.abs(s - (x[0] + r[1] * x[1] + r[2] * x[2])); return e <= 1 ? 1 : 1 / e; });
  }
  return { mid: x[0], up: x[1], down: x[2] };
}

const report = (name, truth, sets) => {
  const tr = { mid: truth.mid, up: truth.top - truth.mid, down: truth.mid - truth.bottom };
  console.log(`\n${name}: true middle ${(F0C * 2 ** (tr.mid / 12)).toFixed(0)} Hz, up ${tr.up.toFixed(2)}, down ${tr.down.toFixed(2)} | ${sets.length} sets of one take per word`);
  for (const [label, fn] of [
    ["A 媽+馬 midpoint", (s) => midpoint(s[1], s[3])],
    ["B 媽+馬 fit", (s) => fitScale([s[1], s[3]])],
    ["C mā má mǎ mà fit", (s) => fitScale([s[1], s[2], s[3], s[4]])],
    ["D 4 words, ends", (s) => ends(s, midpoint(s[1], s[3]).mid)],
    ["E 4 words, all", (s) => ends(s, med(creak([1, 2, 3, 4].flatMap((k) => s[k].st))))],
  ]) {
    const errs = sets.map((s) => { const r = fn(s); return r ? [r.mid - tr.mid, r.up - tr.up, r.down - tr.down] : [NaN, NaN, NaN]; });
    const col = (k) => { const e = errs.map((x) => x[k]); return `${med(e).toFixed(2).padStart(5)} (worst ${e.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0).toFixed(2).padStart(5)})`; };
    console.log(`  ${label.padEnd(20)} middle ${col(0)} | up ${col(1)} | down ${col(2)}   st, median (worst) error`);
  }
};

const pierre = speakerGates("pierre");
const by = (w, k) => pierre.find((g) => g.id === `pierre_ma${w}_${k}`);
const pSets = [];
for (let m = 0; m < 16; m++) pSets.push({ 1: by(1, (m & 1) + 1), 2: by(2, ((m >> 1) & 1) + 1), 3: by(3, ((m >> 2) & 1) + 1), 4: by(4, ((m >> 3) & 1) + 1) });
report("Pierre (his 40 takes give the truth)", trueRuler(pierre), pSets);
// The native speaker's mā má mǎ mà: her older raw takes (as middle-words.mjs), targets from her shapes.
const jane = speakerGates("jane", "textbook");
const OLD = "fixtures/recordings/2026-08-07-xujzgs";
const SH = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8")).textbook;
const jOld = (id, tone) => {
  const o = cachedRun({ set: "jane-older", id, file: `${OLD}/${id}.wav` }, "live-older", { minVoicedRunMs: 64, noiseFloor: 1e-4 });
  const st = [], times = [];
  for (let i = 0; i < o.t.length; i++) if (o.v[i] && o.st[i] !== null) { st.push(o.st[i]); times.push(o.t[i]); }
  const span = times.at(-1) - times[0];
  return { id, tone, tones: [tone], st, times, targetChao: times.map((t) => corridorChaoAt(SH[id], (t - times[0]) / span)) };
};
report("native speaker (357 textbook clips give the truth)", trueRuler(jane), [{ 1: jOld("ma1b", 1), 2: jOld("ma2", 2), 3: jOld("ma3b", 3), 4: jOld("ma4b", 4) }]);
