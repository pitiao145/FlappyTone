// CLI: npm run classifier-check -- [contours.json] [--verbose]
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
// What matters for the live game is not only accuracy: a confident wrong read
// on a correct speaker is a forced wall hit (`isDrasticToneMismatch`), so the
// "confident wrong" count is the number to watch. "boost" counts correct reads
// confident enough for `applyClassifierBoost`.

import { existsSync, readFileSync } from "node:fs";
import { classifyTone, type ClassifiedTone } from "../game/toneClassifier.ts";
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
const contoursPath = args.find((a) => !a.startsWith("--"));

// ---- Fresh averages, the same computation make-tone-averages bakes.
const words = wordsFromCatalog(
  (JSON.parse(readFileSync(`${root}src/data/wordsFallback.json`, "utf8")) as {
    rows: Record<string, unknown>[];
  }).rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })),
);
const fresh = {} as Record<Tone, number[]>;
for (const t of TONES) fresh[t] = averagePolyline(wordsOfTone(words, t));

const sameAverages = TONES.every((t) =>
  fresh[t].every((v, i) => Math.abs(v - AVERAGED_TONE_SHAPE[t][i]) < 5e-5),
);

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
    { id: "hold-then-rise 0.30 (T2)", tone: 2, contour: contourOf(holdThenRise(0.3)) },
    { id: "hold-then-rise 0.40 (T2)", tone: 2, contour: contourOf(holdThenRise(0.4)) },
    { id: "hold-then-rise 0.50 (T2)", tone: 2, contour: contourOf(holdThenRise(0.5)) },
  ];
}

// ---- Reporting.
type Read = { tone: ClassifiedTone | null; confidence: number };

function readAll(cases: Case[], templates: Record<Tone, number[]>): Read[] {
  return cases.map((c) => {
    const r = classifyTone(c.contour, templates);
    return r ? { tone: r.tone, confidence: r.confidence } : { tone: null, confidence: 0 };
  });
}

function matrix(label: string, cases: Case[], reads: Read[]): void {
  const cols: (ClassifiedTone | "null")[] = [1, 2, 3, 4, "none", "null"];
  console.log(`  ${label}`);
  console.log(`    true │ ${cols.map((c) => String(c === "null" ? "–" : c === "none" ? "none" : `T${c}`).padStart(5)).join("")} │ right  conf-wrong  boost`);
  for (const t of TONES) {
    const idx = cases.map((c, i) => (c.tone === t ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const counts = cols.map((col) =>
      idx.filter((i) => (reads[i].tone ?? "null") === col).length,
    );
    const right = idx.filter((i) => reads[i].tone === t).length;
    // Confident wrong = what isDrasticToneMismatch would turn into a wall hit.
    const confWrong = idx.filter(
      (i) =>
        reads[i].tone !== null &&
        reads[i].tone !== "none" &&
        reads[i].tone !== t &&
        reads[i].confidence >= tuning().toneClassifierMinConfidence,
    ).length;
    const boost = idx.filter(
      (i) => reads[i].tone === t && reads[i].confidence >= tuning().toneClassifierBoostMinConfidence,
    ).length;
    console.log(
      `    T${t} ${String(idx.length).padStart(3)} │ ${counts.map((n) => String(n || "·").padStart(5)).join("")} │ ${`${Math.round((right / idx.length) * 100)}%`.padStart(5)}  ${String(confWrong).padStart(10)}  ${String(boost).padStart(5)}`,
    );
  }
}

function fmt(r: Read): string {
  return r.tone === null ? "–" : `${r.tone === "none" ? "none" : `T${r.tone}`} ${r.confidence.toFixed(2)}`;
}

function source(
  name: string,
  casesFor: Case[] | ((templates: Record<Tone, number[]>) => Case[]),
  showAll: boolean,
): void {
  // A synthetic case built FROM a template must be rebuilt per template set,
  // exactly as the test would be after a regeneration.
  const build = typeof casesFor === "function" ? casesFor : () => casesFor;
  const cases = build(AVERAGED_TONE_SHAPE);
  console.log(`\n== ${name} (${cases.length})`);
  if (cases.length === 0) return;
  const baked = readAll(cases, AVERAGED_TONE_SHAPE);
  const fresh_ = readAll(build(fresh), fresh);
  matrix("baked averages (toneAverages.ts, live today)", cases, baked);
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

console.log(
  sameAverages
    ? "Baked averages match wordsFallback.json — one column shown."
    : "Baked averages differ from wordsFallback.json — showing both.",
);
console.log(`Level/start of each average (baked → fresh):`);
for (const t of TONES) {
  const b = AVERAGED_TONE_SHAPE[t];
  const f = fresh[t];
  console.log(
    `  T${t}  start ${b[0].toFixed(2)} → ${f[0].toFixed(2)}   mid ${b[30].toFixed(2)} → ${f[30].toFixed(2)}   end ${b[60].toFixed(2)} → ${f[60].toFixed(2)}`,
  );
}

if (contoursPath) source(`measured clip contours (${contoursPath})`, clipCases(contoursPath), false);
else console.log("\n(no contours.json given — skipping measured clip contours)");
source("jane_ma*.wav through PitchTracker", captureCases(), true);
source("synthetic test shapes (the T2 one is rebuilt from each template set)", syntheticCases, true);
