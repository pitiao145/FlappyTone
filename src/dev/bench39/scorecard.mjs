// Brief 40 — the pitch scorecard. One line per number: value, baseline, PASS/FAIL.
// Praat is the answer sheet (node_modules/.cache/bench39/ref-praat, from praat-ref.py).
//   npm run bench                     # compare with docs/briefs/refs/39-baseline.json
//   npm run bench -- --write-baseline # write the current values as the new baseline
// Exits 1 on any FAIL. Tracker runs are cached by a hash of src/pitch/ (tracks.mjs).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { readContourSyllables } from "../../game/freeAttempts.ts";
import { corridorChaoAt } from "../../game/gates.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { CACHE, F0C, clipList, groupOf, refAt, cachedRun, cachedTrack, cfgFor, PITCH_HASH } from "./tracks.mjs";
import { pct, med, mean, fmt } from "./lib.mjs";

const t0 = Date.now();
const BASELINE = "docs/briefs/refs/39-baseline.json";
if (!existsSync(`${CACHE}/ref-praat/textbook`) || !existsSync(`${CACHE}/ref-praat/natural`)) {
  console.error(`Praat reference cache missing (${CACHE}/ref-praat/). Make it first:
  python3 -m venv ${CACHE}/venv
  ${CACHE}/venv/bin/pip install praat-parselmouth
  ${CACHE}/venv/bin/python src/dev/bench39/praat-ref.py`);
  process.exit(2);
}
const praatRef = (c) => JSON.parse(readFileSync(`${CACHE}/ref-praat/${c.set}/${c.id}.json`, "utf8"));

const CREAK = F0C * 2 ** (-10 / 12); // under ~102 Hz for Jane = creak, no single true pitch
const DELAY = 0.04; // the listener's delay (Phase A, 4.1); used where a number is "delay removed"
const STYLES = ["textbook", "natural"];
const GROUPS = ["T1", "T2", "T3", "T4", "pairs"];
const clips = clipList().filter((c) => GROUPS.includes(groupOf(c.tones)));
const refs = new Map(clips.map((c) => [c.id + c.set, praatRef(c)]));
const R = (c) => refs.get(c.id + c.set);

// ---- metrics registry -------------------------------------------------------
// better: "lower" or "higher". tol: how far it may move the wrong way.
const ST_TOL = 0.02, PP_TOL = 1, MS_TOL = 0;
const rows = [];
const put = (key, value, better, tol, unit) => rows.push({ key, value: Number.isFinite(value) ? +value.toFixed(unit === "ms" ? 0 : unit === "st" || unit === "chao" || unit === "r" ? 3 : 2) : null, better, tol, unit });

// ---- per-frame helpers ------------------------------------------------------
const okRef = (a) => a.trusted && a.f0 >= CREAK;
/** Absolute error (st) of tracker frames vs Praat at time t - shift. */
function errs(o, r, shift) {
  const e = [];
  for (let i = 0; i < o.t.length; i++) if (o.v[i]) { const a = refAt(r, o.t[i] - shift); if (okRef(a)) e.push(Math.abs(12 * Math.log2(o.f0[i] / a.f0))); }
  return e;
}
/** Low/high end lost (st): Praat's 5th/95th percentile minus the tracker's, per clip. */
function ends(o, r, k = 1) {
  const refSt = [], trSt = [];
  for (let i = 0; i < r.t.length; i++) if (r.trusted[i] && r.f0[i] >= CREAK) refSt.push(12 * Math.log2(r.f0[i] / F0C));
  for (let i = 0; i < o.t.length; i++) if (o.v[i]) trSt.push(12 * Math.log2(o.f0[i] / (F0C * k)));
  if (refSt.length < 4) return null;
  if (trSt.length < 3) return { low: pct(refSt, 95) - pct(refSt, 5), high: pct(refSt, 95) - pct(refSt, 5) };
  return { low: pct(trSt, 5) - pct(refSt, 5), high: pct(refSt, 95) - pct(trSt, 95) };
}
/** Voice heard: Praat voiced (non-creak) frames that the tracker draws, by third of the clip's voiced span. */
function heard(o, r, k = 1) {
  const idx = [];
  for (let i = 0; i < r.t.length; i++) if (r.trusted[i] && r.f0[i] >= CREAK) idx.push(i);
  const res = { all: [0, 0], first: [0, 0], last: [0, 0] };
  if (idx.length < 3) return res;
  const a = r.t[idx[0]], b = r.t[idx.at(-1)], span = b - a;
  for (let j = 0; j < o.t.length; j++) {
    const tr = (o.t[j] - DELAY) / k; // tracker frame j shows what was said DELAY earlier
    const x = refAt(r, tr);
    if (!okRef(x)) continue;
    const pos = (r.t[x.i] - a) / Math.max(span, 1e-6);
    const h = o.v[j] ? 1 : 0;
    res.all[0]++; res.all[1] += h;
    if (pos < 1 / 3) { res.first[0]++; res.first[1] += h; }
    if (pos > 2 / 3) { res.last[0]++; res.last[1] += h; }
  }
  return res;
}
const P = (n) => (n[0] ? (100 * n[1]) / n[0] : NaN);
const add = (x, y) => { x[0] += y[0]; x[1] += y[1]; };

// ---- 1. listener vs Praat, live and pipeline --------------------------------
const SHIFTS = Array.from({ length: 11 }, (_, i) => i * 0.01);
for (const style of STYLES) for (const g of GROUPS) {
  const cs = clips.filter((c) => c.set === style && groupOf(c.tones) === g);
  const tag = `${style}.${g}`;
  for (const name of ["live", "pipe"]) {
    const drawn = [], fixed = [], byShift = SHIFTS.map(() => []);
    const lows = [], highs = []; const H = { all: [0, 0], first: [0, 0], last: [0, 0] };
    let trV = 0, falseV = 0;
    for (const c of cs) {
      const r = R(c), o = cachedTrack(c, name);
      drawn.push(...errs(o, r, 0)); fixed.push(...errs(o, r, DELAY));
      if (name === "live") {
        SHIFTS.forEach((s, k) => byShift[k].push(...errs(o, r, s)));
        const e = ends(o, r); if (e) { lows.push(e.low); highs.push(e.high); }
        const h = heard(o, r); add(H.all, h.all); add(H.first, h.first); add(H.last, h.last);
        for (let i = 0; i < o.t.length; i++) if (o.v[i]) { trV++; if (refAt(r, o.t[i] - DELAY).clearlyUnvoiced) falseV++; }
      }
    }
    if (name === "pipe") {
      put(`pipe.err.delayRemoved.med.${tag}`, med(fixed), "lower", ST_TOL, "st");
      put(`pipe.err.delayRemoved.p90.${tag}`, pct(fixed, 90), "lower", ST_TOL, "st");
      continue;
    }
    put(`live.err.asDrawn.med.${tag}`, med(drawn), "lower", ST_TOL, "st");
    put(`live.err.asDrawn.p90.${tag}`, pct(drawn, 90), "lower", ST_TOL, "st");
    put(`live.err.delayRemoved.med.${tag}`, med(fixed), "lower", ST_TOL, "st");
    put(`live.err.delayRemoved.p90.${tag}`, pct(fixed, 90), "lower", ST_TOL, "st");
    const meds = byShift.map((e) => med(e));
    put(`live.delay.ms.${tag}`, 1000 * SHIFTS[meds.indexOf(Math.min(...meds))], "lower", MS_TOL, "ms");
    put(`live.heard.all.pct.${tag}`, P(H.all), "higher", PP_TOL, "%");
    put(`live.heard.firstThird.pct.${tag}`, P(H.first), "higher", PP_TOL, "%");
    put(`live.heard.lastThird.pct.${tag}`, P(H.last), "higher", PP_TOL, "%");
    put(`live.voiceWherePraatSilent.pct.${tag}`, (100 * falseV) / Math.max(1, trV), "lower", PP_TOL, "%");
    put(`live.lowEndLost.med.${tag}`, med(lows), "lower", ST_TOL, "st");
    put(`live.lowEndLost.p90.${tag}`, pct(lows, 90), "lower", ST_TOL, "st");
    put(`live.highEndLost.med.${tag}`, med(highs), "lower", ST_TOL, "st");
    put(`live.highEndLost.p90.${tag}`, pct(highs, 90), "lower", ST_TOL, "st");
  }
}

// ---- 2. deep-voice stand-in (Jane replayed slower: pitch × k) ----------------
for (const k of [0.6, 0.5]) for (const style of STYLES) for (const g of GROUPS) {
  const cs = clips.filter((c) => c.set === style && groupOf(c.tones) === g);
  let n = 0, under = 0; const lows = [];
  for (const c of cs) {
    const r = R(c), o = cachedRun(c, "live", cfgFor(c, "live"), k);
    for (let i = 0; i < r.t.length; i++) if (r.trusted[i] && r.f0[i] >= CREAK) { n++; if (r.f0[i] * k < 70) under++; }
    // ends() needs the reference on the stretched clock: compare pitch sets only (time-free).
    const e = ends(o, r, k); if (e) lows.push(e.low);
  }
  const tag = `${style}.${g}`;
  put(`deep${k}.underBand.pct.${tag}`, (100 * under) / Math.max(1, n), "lower", PP_TOL, "%");
  put(`deep${k}.lowEndLost.med.${tag}`, med(lows), "lower", ST_TOL, "st");
}

// ---- 3. gate at 40% of the voice: T4 last third ------------------------------
for (const style of STYLES) {
  const H = [0, 0];
  for (const c of clips.filter((c) => c.set === style && groupOf(c.tones) === "T4")) {
    const base = cachedTrack(c, "live");
    const v = med(base.rms.filter((_, i) => base.v[i]));
    if (!Number.isFinite(v)) continue;
    const o = cachedRun(c, "gate40", { minVoicedRun: 3, noiseFloor: +((v * 0.4) / 3).toPrecision(6) });
    add(H, heard(o, R(c)).last);
  }
  put(`gate40.T4.lastThirdHeard.pct.${style}`, P(H), "higher", PP_TOL, "%");
}

// ---- 4. the reader (classifier v2 + pair read) on the live contour -----------
const UP = 7, DOWN = 5.75; // Phase A "Jane as a player" board (reading.mjs)
function contour(c, shift) {
  const o = cachedTrack(c, "live"), pts = [];
  for (let i = 0; i < o.t.length; i++) if (o.v[i]) pts.push({ tMs: o.t[i] * 1000, chao: semitonesToChao(o.st[i] + shift, UP, DOWN) });
  if (pts.length < 3) return null;
  const t0 = pts[0].tMs;
  return { points: pts.map((p) => ({ tMs: p.tMs - t0, chao: p.chao })), startedAtMs: 0, endedAtMs: pts.at(-1).tMs - t0 };
}
for (const [label, shift] of [["calibrated", 0], ["voice2stLower", -2]]) for (const style of STYLES) {
  let n = 0, ok = 0;
  for (const c of clips.filter((c) => c.set === style && c.tones.length === 1 && c.tones[0] >= 1)) {
    const k = contour(c, shift); if (!k) continue;
    n++; const res = classifyToneV2(k); if (res && res.tone === c.tones[0]) ok++;
  }
  put(`reader.singlesRight.pct.${label}.${style}`, (100 * ok) / n, "higher", PP_TOL, "%");
  if (label !== "calibrated") continue;
  let pn = 0, two = 0, both = 0;
  for (const c of clips.filter((c) => c.set === style && c.tones.length === 2 && c.tones.every((t) => t >= 1))) {
    const k = contour(c, 0); if (!k) continue;
    pn++; const syl = readContourSyllables(k);
    if (syl && syl.length === 2) { two++; if (syl.every((s, i) => s && s.tone === c.tones[i])) both++; }
  }
  put(`reader.pairsSplitInTwo.pct.${style}`, (100 * two) / pn, "higher", PP_TOL, "%");
  put(`reader.pairsBothRight.pct.${style}`, (100 * both) / pn, "higher", PP_TOL, "%");
}

// ---- 5. targets vs what Jane said (heights.mjs method, Praat reference) ------
{
  const all = clipList();
  const f0s = (set) => all.filter((c) => c.set === set).flatMap((c) => { const r = praatRef(c); return r.f0.filter((f, i) => r.trusted[i]); });
  const C = med(f0s("natural"));
  const pool = (tone) => all.filter((c) => c.set === "textbook" && c.tones.length === 1 && c.tones[0] === tone).flatMap((c) => { const r = praatRef(c); return r.f0.filter((f, i) => r.trusted[i] && f >= 70).map((f) => 12 * Math.log2(f / C)); });
  const up = Math.round(pct(pool(1), 90) * 4) / 4, down = Math.round(-pct(pool(3), 10) * 4) / 4;
  const toChao = (f) => semitonesToChao(12 * Math.log2(f / C), up, down);
  const toRaw = (f) => { const s = 12 * Math.log2(f / C); return 3 + (s / (s >= 0 ? up : down)) * 2; };
  const out = [];
  for (const w of JSON.parse(readFileSync("src/data/wordsFallback.json", "utf8")).rows) {
    const file = `fixtures/clips/jane/${w.id}.wav`;
    if (!existsSync(file) || !w.polyline?.length) continue;
    const tones = w.syllables === 1 ? [w.tone] : w.tones;
    const r = praatRef({ set: "textbook", id: w.id }), shape = { polyline: w.polyline, durationS: w.duration_s };
    const pts = [];
    for (let i = 0; i < r.t.length; i++) {
      if (!r.trusted[i] || r.f0[i] < 70) continue;
      const tn = (r.t[i] - w.onset_s) / w.duration_s;
      if (tn >= 0 && tn <= 1) pts.push({ said: toChao(r.f0[i]), raw: toRaw(r.f0[i]), target: corridorChaoAt(shape, tn) });
    }
    if (pts.length < 5) continue;
    const x = pts.map((p) => p.raw), y = pts.map((p) => p.target), mx = mean(x), my = mean(y);
    const sxx = x.reduce((a, v) => a + (v - mx) ** 2, 0), syy = y.reduce((a, v) => a + (v - my) ** 2, 0), sxy = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0);
    out.push({ g: groupOf(tones), gap: mean(pts.map((p) => Math.abs(p.said - p.target))), corr: sxx > 1e-9 && syy > 1e-9 ? sxy / Math.sqrt(sxx * syy) : NaN });
  }
  for (const g of GROUPS) {
    const k = out.filter((o) => o.g === g);
    put(`heights.gapChao.med.${g}`, med(k.map((o) => o.gap)), "lower", ST_TOL, "chao");
    // A first-tone target is flat: no shape to correlate with, so no shape number for T1.
    if (g !== "T1") put(`heights.shapeMatch.med.${g}`, med(k.map((o) => o.corr).filter(Number.isFinite)), "higher", ST_TOL, "r");
  }
}

// ---- report -----------------------------------------------------------------
const write = process.argv.includes("--write-baseline");
const base = !write && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
let fails = 0;
console.log(`pitch scorecard — reference: Praat | src/pitch hash ${PITCH_HASH} | ${clips.length} clips (T1–T4, pairs)`);
console.log("number | value | baseline | allowed | result");
for (const r of rows) {
  const b = base?.metrics?.[r.key];
  let res = "NEW";
  if (b) {
    const worse = r.value === null ? Infinity : r.better === "lower" ? r.value - b.value : b.value - r.value;
    const ok = worse <= b.tol + 1e-9;
    res = ok ? "PASS" : "FAIL";
    if (!ok) fails++;
  } else if (base) { res = "FAIL (not in baseline)"; fails++; }
  console.log([r.key, fmt(r.value, r.unit === "ms" ? 0 : r.unit === "%" ? 1 : 2), b ? fmt(b.value, r.unit === "ms" ? 0 : r.unit === "%" ? 1 : 2) : "—", `${r.better === "lower" ? "≤ +" : "≥ −"}${r.tol}${r.unit === "%" ? " pp" : " " + r.unit}`, res].join(" | "));
}
if (base) for (const k of Object.keys(base.metrics)) if (!rows.some((r) => r.key === k)) { console.log(`${k} | — | ${base.metrics[k].value} | — | FAIL (missing)`); fails++; }
if (write) {
  const metrics = Object.fromEntries(rows.map((r) => [r.key, { value: r.value, better: r.better, tol: r.tol, unit: r.unit }]));
  writeFileSync(BASELINE, JSON.stringify({
    about: "Pitch scorecard baseline (brief 40). Made by `node src/dev/bench39/scorecard.mjs --write-baseline`. Reference: Praat (praat-ref.py). A brief may only change a number its own acceptance section names.",
    tolerance: "Each metric has `better` (lower|higher) and `tol`: how far it may move the wrong way and still PASS. Defaults: pitch error, delay-free error, loss, chao gap and shape match ±0.02 (st, chao or correlation); percentages 1 percentage point; delay 0 ms (any later best-fit step fails).",
    madeOn: new Date().toISOString().slice(0, 10), pitchHash: PITCH_HASH, metrics,
  }, null, 1) + "\n");
  console.log(`\nwrote ${BASELINE} (${rows.length} numbers)`);
}
console.log(`\n${rows.length} numbers, ${fails} FAIL. Time ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
process.exit(fails ? 1 : 0);
