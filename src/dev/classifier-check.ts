// CLI: npm run classifier-check -- [contours.json] [--anchors textbook|natural] [--verbose]
//
// `--anchors` picks which style's averages the classifier reads (speech style
// spec §5.2 follow-up): every template, so both the family correlation and the
// T2/T3 cue anchors. Default `textbook`, what the game runs. `natural` is an
// offline measurement only — the live classifier always reads textbook. The
// contours file decides which clips are read; pull textbook or natural rows.
//
// Reads the tone classifier against real measured shapes, twice: once with the
// averages baked into `src/game/toneAverages.ts` (what the game runs today),
// once with averages freshly computed from `src/data/wordsFallback.json` (what
// `npm run make-tone-averages` would write). Before a regeneration the two
// columns are "old vs new"; after it they are identical, which is the check
// that the regeneration took.
//
// Sources, each printed as its own confusion matrix (true tone → classifier
// read), because they answer different questions:
//
//   contours.json  every published textbook clip's measured `word_clips.contour`
//                  (optional, not committed — pull it with a read-only SELECT;
//                  rows are [id, [tone], onset_s, duration_s, [[t01, chao]...]]).
//                  Raw voiced frames, so NOT circular with the averages, which
//                  are built from the fitted polylines.
//   fixtures/captures/jane_ma1..4.wav   through PitchTracker, longest utterance.
//   synthetic      the two toneClassifier.test.ts shapes the regeneration broke.
//
// What matters for the live game is not only accuracy: a wrong read that
// `isDrasticToneMismatch` accepts is a forced wall hit on a correct speaker,
// so "wall hits" is the number to watch. "boost" counts correct reads
// confident enough for `applyClassifierBoost`.
//
// With contours.json, two more sections: the same clips pushed through
// simulated trouble (a miscalibrated range, a shifted board, jitter and
// dropouts, a creaky T3 whose dip goes unvoiced, a low onset scoop), and the
// four fallback corridors flown up to 120ms early or late.

import { existsSync, readFileSync } from "node:fs";
import { classifyTone, type ClassifiedTone, type ToneClassification } from "../game/toneClassifier.ts";
import { isDrasticToneMismatch } from "../game/scoring.ts";
import { corridorChaoAt, shapeForTone } from "../game/gates.ts";
import { AVERAGED_TONE_SHAPE } from "../game/toneAverages.ts";
import { averagePolyline } from "../game/toneAverage.ts";
import { wordsFromCatalog, wordsOfTone } from "../game/words.ts";
import { DEFAULT_SPEAKER_ID } from "../data/catalogRows.ts";
import { tuning } from "../game/tuning.ts";
import type { Tone } from "../game/gates.ts";
import type { Contour } from "../game/contours.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { decodeWav } from "./wav.ts";

const root = new URL("../../", import.meta.url).pathname;
const TONES: Tone[] = [1, 2, 3, 4];
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const anchorsAt = args.indexOf("--anchors");
const anchorStyle = anchorsAt >= 0 ? args[anchorsAt + 1] : "textbook";
if (anchorStyle !== "textbook" && anchorStyle !== "natural") {
  console.error(`--anchors must be textbook or natural, got ${anchorStyle}`);
  process.exit(1);
}
const contoursPath = args.find((a, i) => !a.startsWith("--") && i !== anchorsAt + 1);
/** The templates every read below uses. */
const live: Record<Tone, number[]> = AVERAGED_TONE_SHAPE[anchorStyle];

// ---- Fresh averages, the same computation make-tone-averages bakes.
const words = wordsFromCatalog(
  (JSON.parse(readFileSync(`${root}src/data/wordsFallback.json`, "utf8")) as {
    rows: Record<string, unknown>[];
  }).rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })),
);
const fresh = {} as Record<Tone, number[]>;
for (const t of TONES) fresh[t] = averagePolyline(wordsOfTone(words, t));

// The fresh-vs-baked comparison only means something for textbook (the
// bundle is textbook-only); with natural anchors it is skipped.
const sameAverages =
  anchorStyle !== "textbook" ||
  TONES.every((t) => fresh[t].every((v, i) => Math.abs(v - live[t][i]) < 5e-5));

interface Case {
  id: string;
  tone: Tone;
  contour: Contour;
}

function contourOf(points: { tMs: number; chao: number }[]): Contour {
  return {
    points,
    startedAtMs: points[0]?.tMs ?? 0,
    endedAtMs: points[points.length - 1]?.tMs ?? 0,
  };
}

// ---- Source 1: measured clip contours.
function clipCases(path: string): Case[] {
  const rows = JSON.parse(readFileSync(path, "utf8")) as [
    string,
    number[],
    number,
    number,
    [number, number][],
  ][];
  return rows
    .filter((r) => r[1].length === 1 && r[1][0] >= 1 && r[1][0] <= 4 && r[4].length >= 2)
    .map(([id, tones, , durationS, contour]) => ({
      id,
      tone: tones[0] as Tone,
      // `contour`'s t is a 0..1 fraction of the tone window.
      contour: contourOf(contour.map(([t, chao]) => ({ tMs: t * durationS * 1000, chao }))),
    }));
}

// ---- Source 2: Jane's ground-truth captures, through the real tracker.
function captureCases(): Case[] {
  const f0Center = (
    JSON.parse(readFileSync(`${root}fixtures/captures/speakers.json`, "utf8")) as Record<string, number>
  ).jane;
  const out: Case[] = [];
  for (const t of TONES) {
    const path = `${root}fixtures/captures/jane_ma${t}.wav`;
    if (!existsSync(path)) continue;
    const { samples, sampleRate } = decodeWav(readFileSync(path));
    const tracker = new PitchTracker({ sampleRate, f0Center });
    const frames: { tMs: number; chao: number | null }[] = [];
    for (let s = 0; s + 2048 <= samples.length; s += 1024) {
      const st = tracker.push(samples.subarray(s, s + 2048));
      frames.push({ tMs: (s / sampleRate) * 1000, chao: st.voiced ? st.smoothedChao : null });
    }
    // Longest voiced run, merging gaps under mergeGapMs — the utterance the
    // game would judge.
    let best: { tMs: number; chao: number }[] = [];
    let cur: { tMs: number; chao: number }[] = [];
    let lastVoiced = -Infinity;
    for (const f of frames) {
      if (f.chao === null) continue;
      if (f.tMs - lastVoiced > tuning().mergeGapMs) cur = [];
      cur.push({ tMs: f.tMs, chao: f.chao });
      lastVoiced = f.tMs;
      if (cur.length > best.length) best = cur;
    }
    if (best.length >= 2) out.push({ id: `jane_ma${t}.wav`, tone: t, contour: contourOf(best) });
  }
  return out;
}

// ---- Source 3: the synthetic shapes from toneClassifier.test.ts.
function syntheticCases(templates: Record<Tone, number[]>): Case[] {
  const chaoAtT = (shape: number[], t: number) => {
    const idx = t * (shape.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(shape.length - 1, i0 + 1);
    return shape[i0] + (shape[i1] - shape[i0]) * (idx - i0);
  };
  const onsetSwing = [
    ...Array.from({ length: 6 }, (_, k) => ({ tMs: (k / 5) * 200, chao: 1 + (k / 5) * 4 })),
    ...Array.from({ length: 20 }, (_, k) => ({
      tMs: 200 + (k / 19) * 800,
      chao: chaoAtT(templates[2], k / 19),
    })),
  ];
  const holdThenRise = (riseStart: number) =>
    Array.from({ length: 40 }, (_, k) => {
      const t = k / 39;
      const chao =
        t < 0.15 ? 3 - 2 * Math.min(1, t / 0.075) : t < riseStart ? 1 : 1 + 4 * ((t - riseStart) / (1 - riseStart));
      return { tMs: t * 900, chao };
    });
  return [
    { id: "onset swing + T2 template", tone: 2, contour: contourOf(onsetSwing) },
    { id: "hold-then-rise 0.80", tone: 3, contour: contourOf(holdThenRise(0.8)) },
    { id: "hold-then-rise 0.85", tone: 3, contour: contourOf(holdThenRise(0.85)) },
    { id: "hold-then-rise 0.50", tone: 3, contour: contourOf(holdThenRise(0.5)) },
    {
      id: "shallow early dip (T2)",
      tone: 2,
      contour: contourOf(
        Array.from({ length: 30 }, (_, k) => {
          const t = k / 29;
          return { tMs: t * 900, chao: t < 0.3 ? 2.9 - 0.6 * (t / 0.3) : 2.3 + 2.6 * ((t - 0.3) / 0.7) };
        }),
      ),
    },
  ];
}

// ---- Reporting.
type Read = { tone: ClassifiedTone | null; confidence: number; full: ToneClassification | null };

function readAll(cases: Case[], templates: Record<Tone, number[]>): Read[] {
  return cases.map((c) => {
    const r = classifyTone(c.contour, templates);
    return r ? { tone: r.tone, confidence: r.confidence, full: r } : { tone: null, confidence: 0, full: null };
  });
}

function matrix(label: string, cases: Case[], reads: Read[]): void {
  const cols: (ClassifiedTone | "null")[] = [1, 2, 3, 4, "none", "null"];
  console.log(`  ${label}`);
  console.log(`    true │ ${cols.map((c) => String(c === "null" ? "–" : c === "none" ? "none" : `T${c}`).padStart(5)).join("")} │ right  wall-hits  boost`);
  for (const t of TONES) {
    const idx = cases.map((c, i) => (c.tone === t ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const counts = cols.map((col) =>
      idx.filter((i) => (reads[i].tone ?? "null") === col).length,
    );
    const right = idx.filter((i) => reads[i].tone === t).length;
    // What the live game would turn into a wall hit on this correct speaker.
    const confWrong = idx.filter((i) => isDrasticToneMismatch(t, reads[i].full)).length;
    const boost = idx.filter(
      (i) => reads[i].tone === t && reads[i].confidence >= tuning().toneClassifierBoostMinConfidence,
    ).length;
    console.log(
      `    T${t} ${String(idx.length).padStart(3)} │ ${counts.map((n) => String(n || "·").padStart(5)).join("")} │ ${`${Math.round((right / idx.length) * 100)}%`.padStart(5)}  ${String(confWrong).padStart(9)}  ${String(boost).padStart(5)}`,
    );
  }
}

function fmt(r: Read): string {
  if (r.tone === null) return "–";
  const cue = r.full?.t2t3Cue;
  return `${r.tone === "none" ? "none" : `T${r.tone}`} ${r.confidence.toFixed(2)}${cue == null ? "" : ` cue ${cue.toFixed(2)}${r.full!.decisive ? "" : "·"}`}`;
}

function source(
  name: string,
  casesFor: Case[] | ((templates: Record<Tone, number[]>) => Case[]),
  showAll: boolean,
): void {
  // A synthetic case built FROM a template must be rebuilt per template set,
  // exactly as the test would be after a regeneration.
  const build = typeof casesFor === "function" ? casesFor : () => casesFor;
  const cases = build(live);
  console.log(`\n== ${name} (${cases.length})`);
  if (cases.length === 0) return;
  const baked = readAll(cases, live);
  const fresh_ = readAll(build(fresh), fresh);
  matrix(`baked ${anchorStyle} averages (toneAverages.ts)`, cases, baked);
  if (!sameAverages) matrix("fresh averages (from wordsFallback.json)", cases, fresh_);
  const changed = cases
    .map((c, i) => ({ c, a: baked[i], b: fresh_[i] }))
    .filter(({ a, b }) => a.tone !== b.tone);
  if (!sameAverages) {
    console.log(`  reads that change baked → fresh: ${changed.length}`);
    for (const { c, a, b } of changed) {
      console.log(`    ${c.id.padEnd(28)} target T${c.tone}   ${fmt(a).padEnd(10)} → ${fmt(b)}`);
    }
  }
  if (showAll || verbose) {
    console.log("  every case:");
    cases.forEach((c, i) =>
      console.log(`    ${c.id.padEnd(28)} target T${c.tone}   baked ${fmt(baked[i]).padEnd(10)} fresh ${fmt(fresh_[i])}`),
    );
  }
}

console.log(`Anchors: ${anchorStyle} averages${anchorStyle === "textbook" ? " (live)" : " (offline only, not live)"}.`);
console.log(
  anchorStyle !== "textbook"
    ? "Fresh-vs-baked comparison skipped (natural anchors)."
    : sameAverages
    ? "Baked averages match wordsFallback.json — one column shown."
    : "Baked averages differ from wordsFallback.json — showing both.",
);
console.log(`Level/start of each average (baked → fresh):`);
for (const t of TONES) {
  const b = live[t];
  const f = fresh[t];
  console.log(
    `  T${t}  start ${b[0].toFixed(2)} → ${f[0].toFixed(2)}   mid ${b[30].toFixed(2)} → ${f[30].toFixed(2)}   end ${b[60].toFixed(2)} → ${f[60].toFixed(2)}`,
  );
}

if (contoursPath) source(`measured clip contours (${contoursPath})`, clipCases(contoursPath), false);
else console.log("\n(no contours.json given — skipping measured clip contours)");
source("jane_ma*.wav through PitchTracker", captureCases(), true);
source("synthetic test shapes (the T2 one is rebuilt from each template set)", syntheticCases, true);
console.log("  (· after a cue = not decisive: may be named, can never cost a heart)");

// ---- Stress: the measured clips through simulated trouble.
if (contoursPath) {
  const clips = clipCases(contoursPath);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const clamp = (c: number) => Math.max(1, Math.min(5, c));
  type Pts = { tMs: number; chao: number }[];
  const variants: [string, (p: Pts) => Pts][] = [
    ["clean", (p) => p],
    ["range x0.7", (p) => p.map((x) => ({ ...x, chao: clamp(3 + (x.chao - 3) * 0.7) }))],
    ["range x1.3", (p) => p.map((x) => ({ ...x, chao: clamp(3 + (x.chao - 3) * 1.3) }))],
    ["shift +0.6", (p) => p.map((x) => ({ ...x, chao: clamp(x.chao + 0.6) }))],
    ["shift -0.6", (p) => p.map((x) => ({ ...x, chao: clamp(x.chao - 0.6) }))],
    ["jitter+dropouts", (p) => {
      const q = p.filter(() => rnd() > 0.2).map((x) => ({ ...x, chao: clamp(x.chao + 0.15 * gauss()) }));
      return q.length >= 2 ? q : p;
    }],
    ["creak gap", (p) => {
      const floor = Math.min(...p.map((x) => x.chao));
      const q = p.filter((x) => x.chao > floor + 0.35);
      return q.length >= 4 ? q : p;
    }],
    ["onset scoop", (p) => [
      ...[0, 1, 2].map((k) => ({ tMs: p[0].tMs - 150 + k * 50, chao: clamp(p[0].chao - 0.8 + k * 0.25) })),
      ...p,
    ]],
  ];
  console.log(`\n== stress: measured clips through simulated trouble (${clips.length} each)`);
  let allRight = 0;
  let allHits = 0;
  for (const [name, warp] of variants) {
    seed = 7;
    const right: Record<Tone, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const n: Record<Tone, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let hits = 0;
    for (const c of clips) {
      const r = classifyTone(contourOf(warp(c.contour.points)), live);
      n[c.tone]++;
      if (r?.tone === c.tone) right[c.tone]++;
      else if (isDrasticToneMismatch(c.tone, r)) hits++;
    }
    const total = TONES.reduce((s, t) => s + right[t], 0);
    allRight += total;
    allHits += hits;
    console.log(
      `  ${name.padEnd(16)} ${TONES.map((t) => `T${t} ${right[t]}/${n[t]}`).join("  ")}   right ${total}  wall hits ${hits}`,
    );
  }
  console.log(`  ${"all variants".padEnd(16)} right ${allRight}  wall hits ${allHits}`);
}

// ---- The fallback corridors, flown early and late.
console.log("\n== fallback corridors (tuning polylines), flown early (-) or late (+)");
for (const tone of TONES) {
  const shape = shapeForTone(tone);
  const durMs = tuning().gateDurationS[tone] * 1000;
  const cells: string[] = [];
  for (const offMs of [-120, -80, -40, 0, 40, 80, 120]) {
    const pts: { tMs: number; chao: number }[] = [];
    for (let tMs = 0; tMs <= durMs; tMs += 23) {
      pts.push({ tMs, chao: corridorChaoAt(shape, Math.max(0, Math.min(1, (tMs + offMs) / durMs))) });
    }
    const r = classifyTone(contourOf(pts), live);
    const read = r ? (r.tone === "none" ? "none" : `T${r.tone}`) : "–";
    cells.push(`${offMs > 0 ? "+" : ""}${offMs}: ${read}${isDrasticToneMismatch(tone, r) ? "!" : ""}`);
  }
  console.log(`  T${tone}  ${cells.map((c) => c.padEnd(10)).join(" ")}`);
}
console.log("  (! = would cost a correct speaker a heart)");
