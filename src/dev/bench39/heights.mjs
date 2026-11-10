// Is the TARGET shape a true picture of what Jane said?
// Compares each catalog polyline (src/data/wordsFallback.json, textbook) with
// the independent reference contour of the same clip.
//   node src/dev/bench39/heights.mjs [--worst]
import { readFileSync, existsSync } from "node:fs";
import { corridorChaoAt, corridorToleranceAt, toleranceChao } from "../../game/gates.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { clipList, loadRef, groupOf } from "./tracks.mjs";
import { pct, med, mean, fmt } from "./lib.mjs";

const clips = clipList();
// --- Jane's own voice, from the reference only -----------------------------
const f0sOf = (set, filt = () => true) => clips.filter((c) => c.set === set && filt(c)).flatMap((c) => { const r = loadRef(c.set, c.id); return r.f0.filter((f, i) => r.trusted[i]); });
const centreTextbook = med(f0sOf("textbook")), centreNatural = med(f0sOf("natural"));
console.log("### Jane's voice (reference, trusted frames)");
console.log("median pitch: textbook set", fmt(centreTextbook, 1), "Hz | natural set", fmt(centreNatural, 1), "Hz");
const CREAK = (c) => c * 2 ** (-10 / 12);

console.log("\n### Jane's real tone heights, single syllables, in semitones from her own median of that set (creak frames left out)");
console.log("set | tone | clips | start st | lowest st | highest st | end st | span st | creak share of frames");
const real = {};
for (const set of ["textbook", "natural"]) {
  const C = set === "textbook" ? centreTextbook : centreNatural;
  for (const tone of [1, 2, 3, 4]) {
    const cs = clips.filter((c) => c.set === set && c.tones.length === 1 && c.tones[0] === tone);
    const st = [], en = [], lo = [], hi = []; let cr = 0, n = 0;
    for (const c of cs) {
      const r = loadRef(c.set, c.id);
      const all = r.f0.filter((f, i) => r.trusted[i]); n += all.length; cr += all.filter((f) => f < CREAK(C)).length;
      const v = all.filter((f) => f >= CREAK(C)).map((f) => 12 * Math.log2(f / C));
      if (v.length < 8) continue;
      const k = Math.max(2, Math.round(v.length * 0.15));
      st.push(med(v.slice(0, k))); en.push(med(v.slice(-k))); lo.push(pct(v, 5)); hi.push(pct(v, 95));
    }
    real[`${set}${tone}`] = { st: med(st), en: med(en), lo: med(lo), hi: med(hi) };
    console.log([set, `T${tone}`, cs.length, fmt(med(st), 1), fmt(med(lo), 1), fmt(med(hi), 1), fmt(med(en), 1), fmt(med(hi) - med(lo), 1), fmt((100 * cr) / n, 1) + "%"].join(" | "));
  }
}

// --- "Jane as a player": the board the app's calibration would give her -----
// READ IN CODE: centre = median voiced f0 of the talk step (Calibration.tsx),
// up = p90 of semitones during T1 gates, down = -p10 during T3 gates
// (run.ts voicedByTone -> computeRangeHalvesFromExtremes), quarter-st rounding.
// ASSUMED: her natural clips stand in for the talk step; her textbook single
// T1/T3 clips stand in for the calibration flight.
const C = centreNatural;
const stPool = (tone) => clips.filter((c) => c.set === "textbook" && c.tones.length === 1 && c.tones[0] === tone).flatMap((c) => { const r = loadRef(c.set, c.id); return r.f0.filter((f, i) => r.trusted[i] && f >= 70).map((f) => 12 * Math.log2(f / C)); });
const up = Math.round(pct(stPool(1), 90) * 4) / 4, down = Math.round(-pct(stPool(3), 10) * 4) / 4;
console.log(`\n### Jane-as-player board (calibration rule applied to her own clips): centre ${fmt(C, 1)} Hz, up ${up} st (= chao 5), down ${down} st (= chao 1)`);
const toChao = (f) => semitonesToChao(12 * Math.log2(f / C), up, down);
const toChaoRaw = (f) => { const s = 12 * Math.log2(f / C); return 3 + (s / (s >= 0 ? up : down)) * 2; };

// --- target vs what she said -----------------------------------------------
const rows = JSON.parse(readFileSync("src/data/wordsFallback.json", "utf8")).rows;
const out = [];
for (const w of rows) {
  const file = `fixtures/clips/jane/${w.id}.wav`;
  if (!existsSync(file) || !w.polyline?.length) continue;
  const tones = w.syllables === 1 ? [w.tone] : w.tones;
  const r = loadRef("textbook", w.id);
  const shape = { polyline: w.polyline, durationS: w.duration_s };
  const tol = toleranceChao(tones, 0.11);
  const pts = [];
  for (let i = 0; i < r.t.length; i++) {
    if (!r.trusted[i] || r.f0[i] < 70) continue;
    const tn = (r.t[i] - w.onset_s) / w.duration_s;
    if (tn < 0 || tn > 1) continue;
    pts.push({ tn, honest: toChao(r.f0[i]), raw: toChaoRaw(r.f0[i]), target: corridorChaoAt(shape, tn), tolAt: corridorToleranceAt(shape, tn, tol) });
  }
  if (pts.length < 5) continue;
  // best straight-line (affine) fit of honest(raw) onto target = "shape only" error
  const x = pts.map((p) => p.raw), y = pts.map((p) => p.target), mx = mean(x), my = mean(y);
  const sxx = x.reduce((a, v) => a + (v - mx) ** 2, 0), sxy = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0), syy = y.reduce((a, v) => a + (v - my) ** 2, 0);
  const a = sxx > 1e-9 ? sxy / sxx : 0, b = my - a * mx;
  out.push({ id: w.id, tones, g: groupOf(tones), n: pts.length,
    absDiff: mean(pts.map((p) => Math.abs(p.honest - p.target))), signed: mean(pts.map((p) => p.honest - p.target)),
    inside: mean(pts.map((p) => (Math.abs(p.honest - p.target) <= p.tolAt ? 1 : 0))),
    pin5: mean(pts.map((p) => (p.raw >= 5 ? 1 : 0))), pin1: mean(pts.map((p) => (p.raw <= 1 ? 1 : 0))),
    shapeResid: mean(pts.map((p, i) => Math.abs(a * x[i] + b - p.target))), corr: sxx > 1e-9 && syy > 1e-9 ? sxy / Math.sqrt(sxx * syy) : NaN, gain: a,
    hStart: med(pts.slice(0, Math.max(2, Math.round(pts.length * 0.15))).map((p) => p.raw)), hEnd: med(pts.slice(-Math.max(2, Math.round(pts.length * 0.15))).map((p) => p.raw)),
    hLo: pct(pts.map((p) => p.raw), 5), hHi: pct(pts.map((p) => p.raw), 95),
    tStart: w.polyline[0][1], tEnd: w.polyline.at(-1)[1], tLo: Math.min(...w.polyline.map((p) => p[1])), tHi: Math.max(...w.polyline.map((p) => p[1])) });
}
console.log("\n### Target polyline vs what Jane said (her reference pitch on her own player board). chao units; the game corridor is ±0.73 (±0.95 with a third tone)");
console.log("group | clips | mean gap chao (med / p90) | her frames inside her own corridor % (med / p10) | her frames above chao 5 % | below chao 1 % | shape-only gap after best stretch (med) | shape correlation (med / p10) | stretch needed (target ÷ real, med)");
for (const g of ["T1", "T2", "T3", "T4", "pairs", "3+syll"]) {
  const k = out.filter((o) => o.g === g);
  if (!k.length) continue;
  console.log([g, k.length, `${fmt(med(k.map((o) => o.absDiff)))} / ${fmt(pct(k.map((o) => o.absDiff), 90))}`, `${fmt(100 * med(k.map((o) => o.inside)), 0)} / ${fmt(100 * pct(k.map((o) => o.inside), 10), 0)}`,
    fmt(100 * mean(k.map((o) => o.pin5)), 0), fmt(100 * mean(k.map((o) => o.pin1)), 0), fmt(med(k.map((o) => o.shapeResid))), `${fmt(med(k.map((o) => o.corr).filter(Number.isFinite)))} / ${fmt(pct(k.map((o) => o.corr).filter(Number.isFinite), 10))}`, fmt(med(k.map((o) => o.gain)))].join(" | "));
}
console.log("\n### Heights: what she said (unclamped, on her player board) vs the target, single tones, medians");
console.log("tone | said start | target start | said low | target low | said high | target high | said end | target end");
for (const g of ["T1", "T2", "T3", "T4"]) {
  const k = out.filter((o) => o.g === g);
  const m = (f) => fmt(med(k.map(f)));
  console.log([g, m((o) => o.hStart), m((o) => o.tStart), m((o) => o.hLo), m((o) => o.tLo), m((o) => o.hHi), m((o) => o.tHi), m((o) => o.hEnd), m((o) => o.tEnd)].join(" | "));
}
console.log("\n### Pairs by combo: her frames inside her own corridor %, and height gap (said − target, chao)");
const combos = {};
for (const o of out.filter((o) => o.g === "pairs")) (combos[o.tones.join("")] ??= []).push(o);
console.log(Object.entries(combos).sort().map(([c, k]) => `${c}: n${k.length} inside ${fmt(100 * med(k.map((o) => o.inside)), 0)}% gap ${fmt(med(k.map((o) => o.signed)), 2)}`).join("\n"));
if (process.argv.includes("--worst")) {
  console.log("\n### 20 words where the target is furthest from what she said (after best stretch)");
  [...out].sort((a, b) => b.shapeResid - a.shapeResid).slice(0, 20).forEach((o) => console.log(o.id, "shape gap", fmt(o.shapeResid), "corr", fmt(o.corr), "inside", fmt(100 * o.inside, 0) + "%"));
}
