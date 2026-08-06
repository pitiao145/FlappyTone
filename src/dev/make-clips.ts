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
import { contourLine, cutClip, type ContourPoint } from "./clipCut.ts";
import { median, reviewClip } from "./clipReview.ts";
import { decodeWav, encodeWav } from "./wav.ts";
import { WORDS } from "../record/wordlist.ts";
import speakers from "../../fixtures/captures/speakers.json" with { type: "json" };

const SPEAKER = "jane";
const root = new URL("../../", import.meta.url).pathname;
const f0Center = (speakers as Record<string, number>)[SPEAKER] ?? 168;

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
  for (const filename of readdirSync(`${recordingsDir}/${session}`).sort()) {
    if (!filename.endsWith(".wav")) continue;
    const id = filename.slice(0, -4);
    const word = byId.get(id);
    if (!word) {
      unknown.push(`${session}/${filename}`);
      continue;
    }

    const { samples, sampleRate } = decodeWav(
      new Uint8Array(readFileSync(`${recordingsDir}/${session}/${filename}`)),
    );
    try {
      const clip = cutClip(samples, sampleRate, f0Center);
      cuts.set(id, {
        id,
        tone: word.tone,
        hanzi: word.hanzi,
        pinyin: word.pinyin,
        session,
        durationMs: clip.durationMs,
        contour: clip.contour,
        pinnedFraction: clip.pinnedFraction,
        samples: clip.samples,
        sampleRate,
      });
    } catch (err) {
      failed.push(`${session}/${filename}: ${(err as Error).message}`);
    }
  }
}

if (cuts.size === 0) {
  console.error("Nothing to cut. Is fixtures/recordings/ empty?");
  process.exit(1);
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
    // Every measured voiced frame, not a resampling: the game interpolates
    // between real measurements rather than between invented ones, and nothing
    // is reported at a time where she was not making a sound.
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
writeFileSync(
  `${outDir}/manifest.json`,
  `{\n "version": 1,\n "speaker": ${JSON.stringify(SPEAKER)},\n "f0Center": ${f0Center},\n "clips": [\n${body}\n ]\n}\n`,
);

console.log(`\n${clips.length} clip(s) -> public/ref/, manifest.json written.`);
if (flaggedCount) console.log(`${flaggedCount} flagged above — listen to those before committing.`);
for (const u of unknown) console.log(`skipped, not in the word list: ${u}`);
for (const f of failed) console.log(`failed to cut: ${f}`);

const missing = WORDS.filter((w) => !cuts.has(w.id));
if (missing.length) {
  console.log(`\nStill unrecorded (${missing.length}): ${missing.map((w) => w.id).join(", ")}`);
}
