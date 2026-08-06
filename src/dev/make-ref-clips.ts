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

import { readFileSync, writeFileSync } from "node:fs";
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

for (const { tone, file } of SOURCES) {
  const { samples, sampleRate } = decodeWav(
    new Uint8Array(readFileSync(`${root}fixtures/captures/${file}.wav`)),
  );

  const clip = cutClip(samples, sampleRate, f0Center);
  const out = `${root}public/ref/ma${tone}.wav`;
  writeFileSync(out, encodeWav(clip.samples, sampleRate));

  console.log(
    `T${tone}  ${file}  ->  public/ref/ma${tone}.wav  ` +
      `${clip.durationMs.toFixed(0)}ms  ${(clip.samples.length * 2 + 44) / 1024 | 0}KB  ` +
      `(${clip.contour.length} voiced frames)`,
  );
  console.log(`    ${contourLine(clip.contour)}\n`);
}
