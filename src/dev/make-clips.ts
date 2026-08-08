/**
 * Turns pulled recordings into the game's clip inventory.
 *
 *   npm run make-clips
 *
 * Reads `fixtures/recordings/<session>/<id>.wav`, cuts each one with the same
 * `clipCut` the four shipped `ma` clips go through, and writes
 * `public/ref/<id>.wav` plus `public/ref/manifest.json`.
 *
 * The manifest carries each clip's own duration and contour, because the game
 * builds the gate from the clip the player is about to hear. PRD §6 treats
 * "demo length == gate length == polyline timeline" as an invariant, and with
 * more than one syllable in the inventory the only way to hold it is to measure
 * per clip rather than per tone.
 *
 * Later sessions win when the same word appears twice: a re-recording is a
 * correction.
 *
 * Every clip is written even when flagged — the report is for a human to read,
 * not a gate. See `clipReview.ts`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  contourLine,
  cutClip,
  measurePitchReference,
  simplifyContour,
  MEASURE_RANGE_SEMITONES,
  type ContourPoint,
  type PitchReference,
} from "./clipCut.ts";
import {
  applyChaoMap,
  chaoMapFor,
  cohortSpan,
  pinnedFractionOf,
  polylineSpan,
} from "./clipNormalize.ts";
import { median, reviewClip } from "./clipReview.ts";
import { DEFAULT_POLYLINES } from "../game/tuning.ts";
import type { Tone } from "../record/wordlist.ts";
import { decodeWav, encodeWav } from "./wav.ts";
import { WORDS } from "../record/wordlist.ts";
import speakers from "../../fixtures/captures/speakers.json" with { type: "json" };

const SPEAKER = "jane";
const root = new URL("../../", import.meta.url).pathname;
/** Only a seed now — each session measures its own. See `measurePitchReference`. */
const seedF0Center = (speakers as Record<string, number>)[SPEAKER] ?? 168;

const recordingsDir = `${root}fixtures/recordings`;
if (!existsSync(recordingsDir)) {
  console.error(`No ${recordingsDir}. Run \`npm run pull-recordings\` first.`);
  process.exit(1);
}

const byId = new Map(WORDS.map((w) => [w.id, w]));

/** Newest session last, so a re-recording of the same word overwrites the old. */
const sessions = readdirSync(recordingsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

interface Cut {
  id: string;
  tone: number;
  hanzi: string;
  pinyin: string;
  session: string;
  reference: PitchReference;
  durationMs: number;
  contour: ContourPoint[];
  pinnedFraction: number;
  samples: Float32Array;
  sampleRate: number;
}

const cuts = new Map<string, Cut>();
const unknown: string[] = [];
const failed: string[] = [];

for (const session of sessions) {
  // Decode the whole session before cutting any of it: the voice is measured
  // from all of the takes together, and every clip is then cut against that one
  // measurement, so a session's clips share a timeline *and* a tone space.
  const takes: Array<{ id: string; samples: Float32Array; sampleRate: number }> = [];
  for (const filename of readdirSync(`${recordingsDir}/${session}`).sort()) {
    if (!filename.endsWith(".wav")) continue;
    const id = filename.slice(0, -4);
    if (!byId.has(id)) {
      unknown.push(`${session}/${filename}`);
      continue;
    }
    const { samples, sampleRate } = decodeWav(
      new Uint8Array(readFileSync(`${recordingsDir}/${session}/${filename}`)),
    );
    takes.push({ id, samples, sampleRate });
  }
  if (takes.length === 0) continue;

  const measured = measurePitchReference(takes, seedF0Center);
  const reference: PitchReference = measured ?? {
    f0Center: seedF0Center,
    rangeSemitones: 5,
    frames: 0,
  };
  console.log(
    `\n${session}: ${takes.length} takes, f0Center ${reference.f0Center.toFixed(1)}Hz, ` +
      `range ±${reference.rangeSemitones} st` +
      (measured ? ` (${reference.frames} voiced frames)` : `  ⚠ too sparse to measure, using the seed`),
  );

  for (const { id, samples, sampleRate } of takes) {
    const word = byId.get(id)!;
    try {
      const clip = cutClip(samples, sampleRate, reference.f0Center, MEASURE_RANGE_SEMITONES);
      cuts.set(id, {
        id,
        tone: word.tone,
        hanzi: word.hanzi,
        pinyin: word.pinyin,
        session,
        reference,
        durationMs: clip.durationMs,
        contour: clip.contour,
        pinnedFraction: clip.pinnedFraction,
        samples: clip.samples,
        sampleRate,
      });
    } catch (err) {
      failed.push(`${session}/${id}.wav: ${(err as Error).message}`);
    }
  }
}

if (cuts.size === 0) {
  console.error("Nothing to cut. Is fixtures/recordings/ empty?");
  process.exit(1);
}

// ---- Place each tone's cohort at the Chao levels that tone is defined at.
//
// Measured shape, canonical height. See clipNormalize.ts for why the height is
// not measured: hers puts a "high level" T1 at chao 3.3. One map per tone, so
// the differences between the 30 words of a tone survive; only the cohort as a
// whole moves.
for (const tone of [1, 2, 3, 4] as Tone[]) {
  const cohort = [...cuts.values()].filter((c) => c.tone === tone);
  if (cohort.length === 0) continue;
  const span = cohortSpan(cohort.map((c) => c.contour));
  const target = polylineSpan(DEFAULT_POLYLINES[tone]);
  const map = chaoMapFor(span, target);
  for (const cut of cohort) {
    cut.contour = applyChaoMap(cut.contour, map);
    cut.pinnedFraction = pinnedFractionOf(cut.contour);
  }
  console.log(
    `T${tone}: measured ${span.low.toFixed(2)}–${span.high.toFixed(2)} chao -> ` +
      `${target.low.toFixed(2)}–${target.high.toFixed(2)}  (×${map.a.toFixed(2)} ${map.b >= 0 ? "+" : ""}${map.b.toFixed(2)})`,
  );
}

// Cohort medians, for the duration outlier check.
const medianByTone = new Map<number, number>();
for (const tone of [1, 2, 3, 4]) {
  medianByTone.set(
    tone,
    median([...cuts.values()].filter((c) => c.tone === tone).map((c) => c.durationMs)),
  );
}

const outDir = `${root}public/ref`;
mkdirSync(outDir, { recursive: true });

const clips = [];
let flaggedCount = 0;

for (const cut of [...cuts.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  writeFileSync(`${outDir}/${cut.id}.wav`, encodeWav(cut.samples, cut.sampleRate));

  const flags = reviewClip({
    id: cut.id,
    tone: cut.tone,
    durationMs: cut.durationMs,
    contour: cut.contour,
    pinnedFraction: cut.pinnedFraction,
    cohortMedianMs: medianByTone.get(cut.tone) ?? 0,
  });

  clips.push({
    id: cut.id,
    hanzi: cut.hanzi,
    pinyin: cut.pinyin,
    tone: cut.tone,
    file: `${cut.id}.wav`,
    durationS: Number((cut.durationMs / 1000).toFixed(4)),
    // What the game builds the corridor from: a handful of vertices, in the
    // same [t, chao] form as `tuning().polylines`, so a measured word and a
    // hand-tuned tone default are the same kind of object downstream.
    polyline: simplifyContour(cut.contour),
    // Every measured voiced frame, not a resampling: the evidence the polyline
    // was fitted to, kept so the Lab can draw one against the other and so a
    // better fit can be derived later without re-cutting.
    contour: cut.contour.map(([t, chao]) => [Number(t.toFixed(4)), Number(chao.toFixed(3))]),
  });

  const mark = flags.length ? "⚠" : " ";
  console.log(
    `${mark} ${cut.id.padEnd(10)} T${cut.tone}  ${cut.durationMs.toFixed(0).padStart(5)}ms  ` +
      `${String(cut.contour.length).padStart(3)} frames  (${cut.session})`,
  );
  console.log(`    ${contourLine(cut.contour)}`);
  for (const flag of flags) console.log(`    ⚠ ${flag.kind}: ${flag.message}`);
  if (flags.length) flaggedCount++;
}

// One line per clip. Pretty-printing a 46-point contour costs three lines per
// sample and nobody reads it that way; a diff of this file should show which
// clips changed, which is exactly what line-per-clip gives.
const body = clips.map((c) => `  ${JSON.stringify(c)}`).join(",\n");
// The voice each session was measured against. Chao is already relative to it,
// so the game does not need these to draw a corridor — they are here so a
// contour can be traced back to the measurement that produced it.
const sessionRefs = [...new Set([...cuts.values()].map((c) => c.session))].sort().map(
  (s) => {
    const ref = [...cuts.values()].find((c) => c.session === s)!.reference;
    return `  ${JSON.stringify({ session: s, f0Center: Number(ref.f0Center.toFixed(1)), rangeSemitones: ref.rangeSemitones })}`;
  },
);
writeFileSync(
  `${outDir}/manifest.json`,
  `{\n "version": 2,\n "speaker": ${JSON.stringify(SPEAKER)},\n` +
    ` "sessions": [\n${sessionRefs.join(",\n")}\n ],\n "clips": [\n${body}\n ]\n}\n`,
);

console.log(`\n${clips.length} clip(s) -> public/ref/, manifest.json written.`);
if (flaggedCount) console.log(`${flaggedCount} flagged above — listen to those before committing.`);
for (const u of unknown) console.log(`skipped, not in the word list: ${u}`);
for (const f of failed) console.log(`failed to cut: ${f}`);

const missing = WORDS.filter((w) => !cuts.has(w.id));
if (missing.length) {
  console.log(`\nStill unrecorded (${missing.length}): ${missing.map((w) => w.id).join(", ")}`);
}
