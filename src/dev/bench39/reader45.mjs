// Brief 45: the reader (classifier v2) and tone accuracy on Jane's one ruler.
// Dev-only, offline, numbers only. Same live tracker cache and contour rule as
// scorecard.mjs section 4 (all voiced frames of the clip, time-zeroed).
//   node src/dev/bench39/reader45.mjs            # held-out half, every case
//   node src/dev/bench39/reader45.mjs --half fit # the fitting half
//   node src/dev/bench39/reader45.mjs --half all
// Split: a word goes to "fit" or "held" by a hash of its id, so the textbook
// and natural takes of one word are always in the same half.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { F0C, clipList, cachedTrack } from "./tracks.mjs";

export const RULER = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8")).ruler;
/** Jane's one ruler, st from F0C. */
export const TRUE_GRID = { mid: 12 * Math.log2(RULER.middleHz / F0C), up: RULER.upSemitones, down: RULER.downSemitones };
/** The scorecard's old "Jane as a player" board (section 4). */
export const OLD_GRID = { mid: 0, up: 7, down: 5.75 };

export const halfOf = (id) => (createHash("sha1").update(id).digest()[0] % 2 === 0 ? "fit" : "held");

/** Voiced live frames of a clip: [{ tMs, st }] (st from F0C), time-zeroed. */
const frameCache = new Map();
export function framesOf(c) {
  const key = c.set + c.id;
  if (!frameCache.has(key)) {
    const o = cachedTrack(c, "live"), out = [];
    for (let i = 0; i < o.t.length; i++) if (o.v[i]) out.push({ tMs: o.t[i] * 1000, st: o.st[i] });
    const t0 = out.length ? out[0].tMs : 0;
    frameCache.set(key, out.map((p) => ({ tMs: p.tMs - t0, st: p.st })));
  }
  return frameCache.get(key);
}
/** Frames drawn on a grid (st from F0C) as the game's chao, with a voice shift. */
export function contourOn(frames, grid, shift = 0) {
  if (frames.length < 3) return null;
  const points = frames.map((p) => ({ tMs: p.tMs, chao: semitonesToChao(p.st + shift - grid.mid, grid.up, grid.down) }));
  return { points, startedAtMs: 0, endedAtMs: points.at(-1).tMs };
}

/** The cases the brief names, plus two for information. */
export const CASES = {
  calibrated: (g) => ({ grid: g, shift: 0 }),
  lower2: (g) => ({ grid: g, shift: -2 }),
  higher2: (g) => ({ grid: g, shift: 2 }),
  narrow70: (g) => ({ grid: { ...g, up: 0.7 * g.up, down: 0.7 * g.down }, shift: 0 }),
  wide140: (g) => ({ grid: { ...g, up: 1.4 * g.up, down: 1.4 * g.down }, shift: 0 }),
};

export function singleClips(style, half = "held") {
  return clipList().filter((c) => c.set === style && c.tones.length === 1 && c.tones[0] >= 1 && (half === "all" || halfOf(c.id) === half));
}

/** Per-tone right %, confusion (true tone → read), over single clips. */
export function readSingles(clips, grid, shift = 0, classify = classifyToneV2) {
  const conf = {}, per = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] };
  let n = 0, ok = 0;
  for (const c of clips) {
    const k = contourOn(framesOf(c), grid, shift);
    if (!k) continue;
    const r = classify(k), t = c.tones[0], read = r ? r.tone : "none";
    n++; per[t][0]++;
    if (read === t) { ok++; per[t][1]++; }
    conf[t] ??= {}; conf[t][read] = (conf[t][read] ?? 0) + 1;
  }
  const pctOf = (p) => (p[0] ? (100 * p[1]) / p[0] : NaN);
  return { n, all: (100 * ok) / n, T1: pctOf(per[1]), T2: pctOf(per[2]), T3: pctOf(per[3]), T4: pctOf(per[4]), conf };
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
export function printCase(label, r) {
  console.log(`${label} | n ${r.n} | all ${f1(r.all)} | T1 ${f1(r.T1)} | T2 ${f1(r.T2)} | T3 ${f1(r.T3)} | T4 ${f1(r.T4)}`);
}
export function printConfusion(r) {
  console.log("true → read: 1 / 2 / 3 / 4 / none");
  for (const t of [1, 2, 3, 4]) {
    const row = r.conf[t] ?? {};
    console.log(`  T${t}: ${[1, 2, 3, 4, "none"].map((k) => row[k] ?? 0).join(" / ")}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hi = process.argv.indexOf("--half");
  const half = hi >= 0 ? process.argv[hi + 1] : "held";
  console.log(`half: ${half} | ruler middle ${RULER.middleHz} Hz (+${TRUE_GRID.mid.toFixed(2)} st from ${F0C}), up ${TRUE_GRID.up} / down ${TRUE_GRID.down}`);
  for (const style of ["textbook", "natural"]) {
    const clips = singleClips(style, half);
    console.log(`\n## ${style}`);
    printCase("old board, calibrated", readSingles(clips, OLD_GRID));
    for (const [name, mk] of Object.entries(CASES)) {
      const { grid, shift } = mk(TRUE_GRID);
      const r = readSingles(clips, grid, shift);
      printCase(`ruler, ${name}`, r);
      if (name === "calibrated" || process.argv.includes("--confusion")) printConfusion(r);
    }
  }
}

// ---- tone accuracy (step 4) -------------------------------------------------
import { longestUtterance, toneAccuracyDetail } from "../../game/toneAccuracy.ts";
import { setTuning, tuning } from "../../game/tuning.ts";
import { spokenTones } from "../../game/sandhi.ts";
import { wordsFromCatalog } from "../../game/words.ts";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
const SPOKEN = new Map(wordsFromCatalog(JSON.parse(readFileSync("src/data/wordsFallback.json", "utf8")).rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID }))).map((w) => [w.id, spokenTones(w)]));
/**
 * Jane's tone accuracy on her own clips: the game's rule (longest utterance,
 * `mergeGapMs` / `multiMergeGapMs`), spoken tones (sandhi; natural-only spoken
 * overrides live in the catalog and are not read here). `system`: "old" = flag
 * off, old board; "new" = flag on, her one ruler. Returns per group and all.
 */
export function janeAccuracy(style, half, system, heightWeight) {
  const before = tuning();
  setTuning({ playerRulerV2: system === "new", ...(heightWeight === undefined ? {} : { toneAccHeightWeight: heightWeight }) });
  const grid = system === "new" ? TRUE_GRID : OLD_GRID;
  const by = { T1: [], T2: [], T3: [], T4: [], pairs: [] };
  try {
    for (const c of clipList().filter((c) => c.set === style && (half === "all" || halfOf(c.id) === half))) {
      const tones = SPOKEN.get(c.id);
      if (!tones || tones.length > 2 || tones.includes(0)) continue;
      const k = contourOn(framesOf(c), grid);
      if (!k) continue;
      const gap = tones.length > 1 ? tuning().multiMergeGapMs : tuning().mergeGapMs;
      const d = toneAccuracyDetail(longestUtterance(k.points, gap), tones, undefined, style);
      if (d) by[tones.length === 1 ? `T${tones[0]}` : "pairs"].push(d.accuracy);
    }
  } finally {
    setTuning({ playerRulerV2: before.playerRulerV2, toneAccHeightWeight: before.toneAccHeightWeight });
  }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
  const out = Object.fromEntries(Object.entries(by).map(([g, v]) => [g, { n: v.length, med: med(v) }]));
  out.all = { n: Object.values(by).flat().length, med: med(Object.values(by).flat()) };
  return out;
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--accuracy")) {
  const hi = process.argv.indexOf("--half");
  const half = hi >= 0 ? process.argv[hi + 1] : "held";
  console.log(`\n## Jane's tone accuracy on her own clips (${half} half), median`);
  console.log("style | system | height weight | all | T1 | T2 | T3 | T4 | pairs");
  for (const style of ["textbook", "natural"]) for (const [system, w] of [["old", 0.15], ["old", 0], ["new", 0.15], ["new", 0]]) {
    const r = janeAccuracy(style, half, system, w);
    console.log([style, system, w, ...["all", "T1", "T2", "T3", "T4", "pairs"].map((g) => `${r[g].med.toFixed(3)} (n${r[g].n})`)].join(" | "));
  }
}

// ---- reader after brief 44 learning ------------------------------------------
/**
 * Brief 45 acceptance: the voice 2 st lower than calibrated, after 120 gates of
 * brief 44 learning (game mix, all of Jane's gates of that style), read on the
 * held-out singles; vs the same singles on her true ruler (as calibrated).
 * Flag on (ruler reader). Grid in st from F0C, as gridsim.mjs.
 */
export async function readerWithLearning(style, half = "held") {
  const { speakerGates, trueRuler, simulate } = await import("./gridsim.mjs");
  const before = tuning().playerRulerV2;
  setTuning({ playerRulerV2: true });
  try {
    const tb = speakerGates("jane", "textbook"), gates = style === "textbook" ? tb : speakerGates("jane", "natural");
    const truth = trueRuler(tb);
    const start = { mid: truth.mid, up: truth.top - truth.mid, down: truth.mid - truth.bottom };
    const lower = simulate(gates, start, { n: 120, seed: 44, truth, voiceShift: -2 }).grid;
    const clips = singleClips(style, half);
    return {
      asCalibrated: readSingles(clips, TRUE_GRID).all,
      learnedFrom2stLower: readSingles(clips, lower, -2).all,
      notLearned2stLower: readSingles(clips, TRUE_GRID, -2).all,
      grid: lower,
    };
  } finally {
    setTuning({ playerRulerV2: before });
  }
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--learning")) {
  for (const style of ["textbook", "natural"]) {
    const r = await readerWithLearning(style);
    console.log(`${style} (held): as calibrated ${r.asCalibrated.toFixed(1)} | voice −2 st, learned ${r.learnedFrom2stLower.toFixed(1)} | voice −2 st, not learned ${r.notLearned2stLower.toFixed(1)} | learned grid mid ${r.grid.mid.toFixed(2)} up ${r.grid.up.toFixed(2)} down ${r.grid.down.toFixed(2)} (truth mid ${TRUE_GRID.mid.toFixed(2)} → shifted ${(TRUE_GRID.mid - 2).toFixed(2)})`);
  }
}

// ---- Pierre's syllables: a check, never a training set ------------------------
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--pierre")) {
  const { speakerGates, trueRuler } = await import("./gridsim.mjs");
  const gates = speakerGates("pierre").filter((g) => g.tones.length === 1 && g.tones[0] >= 1 && g.st.length >= 3);
  const ruler = trueRuler(speakerGates("pierre"));
  const own = { mid: ruler.mid, up: ruler.top - ruler.mid, down: ruler.mid - ruler.bottom };
  const std = { mid: ruler.mid, up: tuning().gridUpSemitones, down: tuning().gridDownSemitones };
  console.log(`\n## Pierre's single syllables (${gates.length}); his ruler: middle ${(F0C * 2 ** (own.mid / 12)).toFixed(1)} Hz, up ${own.up.toFixed(2)}, down ${own.down.toFixed(2)}`);
  for (const [gname, grid] of [["his own ruler", own], ["standard halves 5.25 / 5.75 at his middle", std]]) for (const [rname, flag] of [["today's reader", false], ["ruler reader", true]]) for (const shift of [0, -2]) {
    setTuning({ playerRulerV2: flag });
    let ok = 0; const wrong = [];
    for (const g of gates) {
      const pts = g.st.map((x, i) => ({ tMs: (g.times[i] - g.times[0]) * 1000, chao: semitonesToChao(x + shift - grid.mid, grid.up, grid.down) }));
      const r = classifyToneV2({ points: pts, startedAtMs: 0, endedAtMs: pts.at(-1).tMs });
      if (r && r.tone === g.tones[0]) ok++; else wrong.push(`${g.id.replace("pierre_", "")}→${r ? r.tone : "none"}${r?.decisive ? "!" : ""}`);
    }
    console.log(`${gname} | ${rname} | voice ${shift ? "−2 st" : "as calibrated"}: ${ok}/${gates.length} | wrong: ${wrong.join(" ") || "—"}`);
  }
  setTuning({ playerRulerV2: false });
}
