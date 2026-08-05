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
 * Why this is a build step rather than runtime trimming: `reference.ts` used to
 * trim silence at 3% of peak amplitude, which on these captures keeps room tone
 * and breath. The audible windows came out at 1510–3306ms against 575–1340ms of
 * actual voicing, so the cue would have frozen the world for up to three
 * seconds while the demo dot crawled through silence. Voicing is what a tone
 * demo is made of, so the cut is made on the *pitch* track and baked in here.
 *
 * Prints the durations and decile contours to paste into gates.ts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { decodeWav, encodeWav } from "./wav.ts";
import speakers from "../../fixtures/captures/speakers.json" with { type: "json" };

const WIN = 2048;
const HOP = 1024;
/** Silence shorter than this inside an utterance is part of it, not an edge. */
const MERGE_GAP_MS = 120;
/** Kept either side of the voiced span so the onset is not clipped mid-consonant. */
const PAD_MS = 45;
/** Click-free edges. */
const FADE_MS = 15;

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

  // Voiced frames, as sample indices at the centre of each analysis window.
  const tracker = new PitchTracker({ sampleRate, f0Center });
  const voiced: number[] = [];
  for (let s = 0; s + WIN <= samples.length; s += HOP) {
    if (tracker.push(samples.subarray(s, s + WIN)).voiced) voiced.push(s + WIN / 2);
  }
  if (voiced.length === 0) throw new Error(`${file}: no voiced frames`);

  // Longest run, merging short gaps — the same segmentation the scorer uses.
  const gap = (MERGE_GAP_MS / 1000) * sampleRate;
  let bestStart = voiced[0];
  let bestEnd = voiced[0];
  let runStart = voiced[0];
  for (let i = 1; i < voiced.length; i++) {
    if (voiced[i] - voiced[i - 1] > gap) runStart = voiced[i];
    if (voiced[i] - runStart > bestEnd - bestStart) {
      bestStart = runStart;
      bestEnd = voiced[i];
    }
  }

  const pad = (PAD_MS / 1000) * sampleRate;
  const a = Math.max(0, Math.round(bestStart - pad));
  const b = Math.min(samples.length - 1, Math.round(bestEnd + pad));
  const cut = samples.slice(a, b + 1);

  const fade = Math.round((FADE_MS / 1000) * sampleRate);
  for (let i = 0; i < fade && i < cut.length; i++) {
    cut[i] *= i / fade;
    cut[cut.length - 1 - i] *= i / fade;
  }

  const out = `${root}public/ref/ma${tone}.wav`;
  writeFileSync(out, encodeWav(cut, sampleRate));

  // Contour over the clip's own timeline — this is what the demo dot sweeps,
  // so it is the timeline the corridor polyline has to be written in.
  const ct = new PitchTracker({ sampleRate, f0Center });
  const pts: Array<[number, number]> = [];
  for (let s = 0; s + WIN <= cut.length; s += HOP) {
    const st = ct.push(cut.subarray(s, s + WIN));
    if (st.voiced) pts.push([(s + WIN / 2) / cut.length, st.smoothedChao]);
  }
  const durMs = (cut.length / sampleRate) * 1000;
  const deciles = Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const p of pts) {
      const d = Math.abs(p[0] - t);
      if (d < bd) { bd = d; best = p; }
    }
    // Only report where there is voicing near that point, so trailing silence
    // is not reported as a held pitch.
    return `${t.toFixed(1)}:${best && bd < 0.06 ? best[1].toFixed(2) : "—"}`;
  }).join("  ");

  console.log(
    `T${tone}  ${file}  ->  public/ref/ma${tone}.wav  ` +
      `${durMs.toFixed(0)}ms  ${(cut.length * 2 + 44) / 1024 | 0}KB  (${pts.length} voiced frames)`,
  );
  console.log(`    ${deciles}\n`);
}
