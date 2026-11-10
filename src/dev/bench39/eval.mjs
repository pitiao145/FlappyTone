// Brief 39 bench — today's listener (the real PitchTracker) against the
// independent reference, on every local Jane clip.
//   node src/dev/bench39/eval.mjs            -> tables on stdout
//   node src/dev/bench39/eval.mjs --worst    -> also the worst clips
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PitchTracker } from "../../pitch/PitchTracker.ts";
import { findPitchInBand } from "../../pitch/mpm.ts";
import { listWavs, loadWav, rms, WIN, HOP, pct, med, mean, fmt } from "./lib.mjs";

export const CACHE = "node_modules/.cache/bench39/ref";
export const F0C = 181.3; // Jane's catalog reference centre (wordsFallback meta)
export const T3_RESCUE = { rescueClarity: 0.3, rescueRmsMult: 4, rescueMaxFrames: 8 }; // copy of clipCut.ts TONE_3_RESCUE

export function tonesOf(id) {
  const m = id.match(/(\d+)[a-z]?$/);
  return m ? m[1].split("").map(Number) : [];
}
export function loadRef(set, id) {
  return JSON.parse(readFileSync(`${CACHE}/${set}/${id}.json`, "utf8"));
}
/** reference at time t (nearest 10 ms frame): {f0, trusted, voiced, silent} */
export function refAt(r, t) {
  const i = Math.min(r.t.length - 1, Math.max(0, Math.round((t - r.t[0]) / 0.01)));
  const near = (k) => r.f0[Math.min(r.t.length - 1, Math.max(0, i + k))] > 0;
  return { f0: r.f0[i], trusted: !!r.trusted[i], voiced: r.f0[i] > 0, clearlyUnvoiced: !near(-2) && !near(-1) && !near(0) && !near(1) && !near(2) };
}
export function runTracker(samples, sr, cfg) {
  const tr = new PitchTracker({ sampleRate: sr, f0Center: F0C, rangeSemitones: 15, ...cfg });
  const out = [];
  for (let s = 0; s + WIN <= samples.length; s += HOP) {
    const fr = samples.subarray(s, s + WIN);
    const p = tr.push(fr);
    out.push({ t: (s + WIN / 2) / sr, voiced: p.voiced, f0: p.f0, st: p.semitones, clarity: p.clarity, rms: p.rms });
  }
  return out;
}
const stOf = (f) => 12 * Math.log2(f / F0C);

function evalClip(set, file) {
  const id = basename(file, ".wav");
  const tones = tonesOf(id);
  const w = loadWav(file), r = loadRef(set, id);
  // raw detector, no gates, no smoothing
  const raw = [];
  for (let s = 0; s + WIN <= w.samples.length; s += HOP) {
    const c = w.samples.subarray(s + 512, s + 1536);
    const [f, cl] = findPitchInBand(c, w.sampleRate, 70, 400);
    raw.push({ t: (s + WIN / 2) / w.sampleRate, f, cl, rms: rms(c) });
  }
  const voicedRms = med(raw.filter((x) => refAt(r, x.t).trusted).map((x) => x.rms));
  const quietRms = pct(raw.map((x) => x.rms), 10);
  const t3 = tones.length === 1 && tones[0] === 3 ? T3_RESCUE : {};
  const cfgs = {
    pipe: { minVoicedRun: 1, ...t3 },
    live_min: { minVoicedRun: 3, noiseFloor: 1e-4 },
    live_g10: { minVoicedRun: 3, noiseFloor: (voicedRms * 0.1) / 3 },
    live_g20: { minVoicedRun: 3, noiseFloor: (voicedRms * 0.2) / 3 },
    live_g40: { minVoicedRun: 3, noiseFloor: (voicedRms * 0.4) / 3 },
  };
  // reference voiced span (trusted frames) for thirds
  const tv = r.t.filter((_, i) => r.trusted[i]);
  const t0 = tv[0], t1 = tv.at(-1);
  const refSt = r.f0.map((f, i) => (r.trusted[i] ? stOf(f) : null)).filter((x) => x !== null);
  const res = { set, id, tones, voicedRms, quietRms, refLow: pct(refSt, 5), refHigh: pct(refSt, 95), refAbove400: mean(r.f0.filter((f, i) => r.trusted[i]).map((f) => (f > 400 ? 1 : 0))), refBelow70: mean(r.f0.filter((f, i) => r.trusted[i]).map((f) => (f < 70 ? 1 : 0))), cfg: {} };
  // raw detector accuracy on trusted frames
  {
    const e = [], cl = [];
    for (const x of raw) { const a = refAt(r, x.t); if (!a.trusted) continue; cl.push(x.cl); if (x.f > 0) e.push(12 * Math.log2(x.f / a.f0)); }
    res.raw = { n: cl.length, noPitch: cl.length - e.length, absErr: e.map(Math.abs), oct: e.filter((v) => Math.abs(Math.abs(v) - 12) < 1.5).length, clarity: cl };
  }
  for (const [name, cfg] of Object.entries(cfgs)) {
    const o = runTracker(w.samples, w.sampleRate, cfg);
    let refV = 0, hit = 0, falseV = 0, unv = 0;
    const errs = [], signed = [];
    const third = [[0, 0], [0, 0], [0, 0]];
    const trSt = [];
    for (const x of o) {
      const a = refAt(r, x.t);
      if (a.trusted) {
        refV++;
        const k = Math.max(0, Math.min(2, Math.floor((3 * (x.t - t0)) / (t1 - t0 + 1e-9))));
        third[k][0]++;
        if (x.voiced) { hit++; third[k][1]++; const e = 12 * Math.log2(x.f0 / a.f0); errs.push(Math.abs(e)); signed.push(e); }
      }
      if (a.clearlyUnvoiced) { unv++; if (x.voiced) falseV++; }
      if (x.voiced) trSt.push(stOf(x.f0));
    }
    // best lag: shift tracker earlier by L ms and re-score
    let bestL = 0, bestE = Infinity;
    for (let L = -20; L <= 120; L += 10) {
      const e = [];
      for (const x of o) { if (!x.voiced) continue; const a = refAt(r, x.t - L / 1000); if (a.trusted) e.push(Math.abs(12 * Math.log2(x.f0 / a.f0))); }
      const m = mean(e);
      if (e.length > 3 && m < bestE) { bestE = m; bestL = L; }
    }
    res.cfg[name] = { refV, hit, falseV, unv, errs, gross: errs.filter((e) => e > 3).length, oct: signed.filter((v) => Math.abs(Math.abs(v) - 12) < 1.5).length, third, lowLost: trSt.length ? pct(trSt, 5) - res.refLow : NaN, highLost: trSt.length ? res.refHigh - pct(trSt, 95) : NaN, bestL, bestE, meanErr: mean(errs), none: trSt.length === 0 };
  }
  return res;
}

const SETS = { textbook: "fixtures/clips/jane", natural: "fixtures/clips/jane/natural" };
const all = [];
for (const [set, dir] of Object.entries(SETS)) for (const f of listWavs(dir)) all.push(evalClip(set, f));

const groupOf = (c) => (c.tones.length === 1 ? `T${c.tones[0]}` : c.tones.length === 2 ? "pairs" : "3+syll");
const groups = ["T1", "T2", "T3", "T4", "pairs", "3+syll"];
function table(title, cfgName, rowsFn) {
  console.log(`\n### ${title}`);
  console.log("set      | group  | clips | recall% | start% | mid% | end% | false-voiced% | err st med | err p90 | gross>3st% | octave% | low end lost st (med / p90) | high end lost st med | delay ms med | clips with nothing heard");
  for (const set of ["textbook", "natural"]) for (const g of groups) {
    const cs = all.filter((c) => c.set === set && groupOf(c) === g);
    if (!cs.length) continue;
    const k = cs.map((c) => c.cfg[cfgName]);
    const sum = (f) => k.reduce((a, x) => a + f(x), 0);
    const errs = k.flatMap((x) => x.errs);
    console.log([set.padEnd(8), g.padEnd(6), String(cs.length).padStart(5), fmt((100 * sum((x) => x.hit)) / sum((x) => x.refV), 1, 7),
      ...[0, 1, 2].map((i) => fmt((100 * sum((x) => x.third[i][1])) / sum((x) => x.third[i][0]), 0, 5)),
      fmt((100 * sum((x) => x.falseV)) / Math.max(1, sum((x) => x.unv)), 2, 6), fmt(med(errs), 2, 6), fmt(pct(errs, 90), 2, 6),
      fmt((100 * sum((x) => x.gross)) / errs.length, 1, 6), fmt((100 * sum((x) => x.oct)) / errs.length, 2, 6),
      `${fmt(med(k.map((x) => x.lowLost).filter(Number.isFinite)), 2)} / ${fmt(pct(k.map((x) => x.lowLost).filter(Number.isFinite), 90), 2)}`,
      fmt(med(k.map((x) => x.highLost).filter(Number.isFinite)), 2, 6), fmt(med(k.map((x) => x.bestL)), 0, 5), String(k.filter((x) => x.none).length).padStart(4)].join(" | "));
  }
}
console.log("### Raw detector (MPM, centre 1024 samples, 70–400 Hz), no gates, no smoothing, on reference-trusted frames");
console.log("set | group | frames | no pitch% | err st med | p90 | gross>3st% | octave% | clarity<0.7 % | clarity<0.4 %");
for (const set of ["textbook", "natural"]) for (const g of groups) {
  const cs = all.filter((c) => c.set === set && groupOf(c) === g);
  if (!cs.length) continue;
  const n = cs.reduce((a, c) => a + c.raw.n, 0), e = cs.flatMap((c) => c.raw.absErr), cl = cs.flatMap((c) => c.raw.clarity);
  console.log([set, g, n, fmt((100 * cs.reduce((a, c) => a + c.raw.noPitch, 0)) / n, 1), fmt(med(e), 2), fmt(pct(e, 90), 2), fmt((100 * e.filter((v) => v > 3).length) / e.length, 1), fmt((100 * cs.reduce((a, c) => a + c.raw.oct, 0)) / e.length, 2), fmt((100 * cl.filter((v) => v < 0.7).length) / n, 1), fmt((100 * cl.filter((v) => v < 0.4).length) / n, 1)].join(" | "));
}
table("Clip-pipeline settings (fixed floor 0.0033, every frame, T3 rescue on single T3)", "pipe");
table("Live settings, quietest possible gate (floor 1e-4)", "live_min");
table("Live settings, gate at 10% of the clip's voice loudness", "live_g10");
table("Live settings, gate at 20% of the clip's voice loudness", "live_g20");
table("Live settings, gate at 40% of the clip's voice loudness (today's cap)", "live_g40");

console.log("\n### Clip loudness (centre-1024 RMS): the fixed pipeline gate is 0.0099, its rescue needs 0.033");
for (const set of ["textbook", "natural"]) {
  const cs = all.filter((c) => c.set === set);
  const v = cs.map((c) => c.voicedRms);
  console.log(set, "voice loudness median", fmt(med(v), 4), "p10", fmt(pct(v, 10), 4), "| pipeline gate as % of voice: median", fmt((100 * 0.0099) / med(v), 0), "%, for the quietest 10% of clips", fmt((100 * 0.0099) / pct(v, 10), 0), "% | clips whose median voice is under the rescue level 0.033:", cs.filter((c) => c.voicedRms < 0.033).length, "/", cs.length);
}
console.log("\n### Band limits: reference-trusted frames outside 70–400 Hz");
for (const set of ["textbook", "natural"]) {
  const cs = all.filter((c) => c.set === set);
  console.log(set, "clips with >5% of frames above 400 Hz:", cs.filter((c) => c.refAbove400 > 0.05).length, "| below 70 Hz:", cs.filter((c) => c.refBelow70 > 0.05).length, "| max share above 400:", fmt(Math.max(...cs.map((c) => c.refAbove400)), 2));
}
if (process.argv.includes("--worst")) {
  for (const cfgName of ["pipe", "live_min"]) {
    console.log(`\n### Worst 15 clips by low end lost (${cfgName})`);
    [...all].filter((c) => Number.isFinite(c.cfg[cfgName].lowLost)).sort((a, b) => b.cfg[cfgName].lowLost - a.cfg[cfgName].lowLost).slice(0, 15)
      .forEach((c) => console.log(c.set, c.id, "low lost", fmt(c.cfg[cfgName].lowLost), "st, recall", fmt((100 * c.cfg[cfgName].hit) / c.cfg[cfgName].refV, 0), "%"));
  }
}
