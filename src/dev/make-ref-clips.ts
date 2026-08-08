/**
 * Cuts the shipped reference clips out of the native capture fixtures.
 *
 *   npm run make-ref-clips
 *
 * Source of truth is `fixtures/captures/jane_ma{1,2,3,4}.wav` — the same
 * recordings the corridor polylines in `src/game/gates.ts` were measured from,
 * so the example the player hears and the shape they are scored against come
 * from one voice and one take.
 *
 * The cutting itself lives in `clipCut.ts`, shared with `make-clips.ts` so the
 * four hand-picked `ma` clips and Jane's recorded inventory are measured
 * identically. That file explains why the cut is made on pitch and not
 * amplitude.
 *
 * Prints the durations and decile contours to paste into gates.ts.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { contourLine, cutClip } from "./clipCut.ts";
import { decodeWav, encodeWav } from "./wav.ts";
import speakers from "../../fixtures/captures/speakers.json" with { type: "json" };

const SOURCES: Array<{ tone: number; file: string }> = [
  { tone: 1, file: "jane_ma1" },
  { tone: 2, file: "jane_ma2" },
  // Textbook, not `jane_ma3_natural`: the natural take is a half-third with no
  // rise at all, which would contradict the ˇ corridor it is demonstrating.
  { tone: 3, file: "jane_ma3" },
  { tone: 4, file: "jane_ma4" },
];

const f0Center = (speakers as Record<string, number>).jane ?? 168;
const root = new URL("../../", import.meta.url).pathname;
/**
 * Not `public/ref/` any more. The word list contains 麻 `má` with id `ma2`, and
 * ids are filenames all the way through, so `make-clips` and this script were
 * both writing `public/ref/ma2.wav` — one of them silently losing. These four
 * are a measurement of the tone-mark contours, not shipped audio; the game's
 * cues now come from the manifest.
 */
const outDir = `${root}fixtures/anchors`;
mkdirSync(outDir, { recursive: true });

for (const { tone, file } of SOURCES) {
  const { samples, sampleRate } = decodeWav(
    new Uint8Array(readFileSync(`${root}fixtures/captures/${file}.wav`)),
  );

  const clip = cutClip(samples, sampleRate, f0Center);
  const out = `${outDir}/ma${tone}.wav`;
  writeFileSync(out, encodeWav(clip.samples, sampleRate));

  console.log(
    `T${tone}  ${file}  ->  fixtures/anchors/ma${tone}.wav  ` +
      `${clip.durationMs.toFixed(0)}ms  ${(clip.samples.length * 2 + 44) / 1024 | 0}KB  ` +
      `(${clip.contour.length} voiced frames)`,
  );
  console.log(`    ${contourLine(clip.contour)}\n`);
}
