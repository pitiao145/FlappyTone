// CLI: npm run make-tones [f0Center]
// Writes fixtures/tone1..4.wav — synthetic hums whose pitch follows the four
// Mandarin tone contours (PRD §6 polylines), centred on f0Center. Play them
// at the mic to test the game with known-correct input, or feed them to
// npm run analyze.
import { mkdirSync, writeFileSync } from "node:fs";
import { encodeWav } from "./wav.ts";

const SAMPLE_RATE = 44100;
const TONE_MS = 600;
const GAP_MS = 400;
const RANGE_SEMITONES = 5;

const f0Center = process.argv[2] ? Number(process.argv[2]) : 120;

// PRD §6 gate polylines, as (t, chao) points
const CONTOURS: Record<string, [number, number][]> = {
  tone1: [[0, 5], [1, 5]],
  tone2: [[0, 3], [1, 5]],
  tone3: [[0, 2], [0.4, 1], [1, 4]],
  tone4: [[0, 5], [1, 1]],
};

function chaoAt(polyline: [number, number][], t: number): number {
  for (let i = 1; i < polyline.length; i++) {
    const [t0, c0] = polyline[i - 1];
    const [t1, c1] = polyline[i];
    if (t <= t1) return c0 + ((t - t0) / (t1 - t0)) * (c1 - c0);
  }
  return polyline[polyline.length - 1][1];
}

function chaoToHz(chao: number): number {
  const semitones = ((chao - 3) / 2) * RANGE_SEMITONES;
  return f0Center * Math.pow(2, semitones / 12);
}

function synthTone(polyline: [number, number][]): Float32Array {
  const toneSamples = Math.round((TONE_MS / 1000) * SAMPLE_RATE);
  const gapSamples = Math.round((GAP_MS / 1000) * SAMPLE_RATE);
  const out = new Float32Array(gapSamples + toneSamples + gapSamples);
  let phase = 0;
  for (let i = 0; i < toneSamples; i++) {
    const t = i / toneSamples;
    const hz = chaoToHz(chaoAt(polyline, t));
    phase += (2 * Math.PI * hz) / SAMPLE_RATE;
    // fundamental + a couple of harmonics so it sounds voice-ish, not beepy
    const s =
      0.6 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase);
    // 30ms fade in/out to avoid clicks
    const fade = Math.min(1, i / (0.03 * SAMPLE_RATE), (toneSamples - i) / (0.03 * SAMPLE_RATE));
    out[gapSamples + i] = 0.5 * s * fade;
  }
  return out;
}

mkdirSync("fixtures", { recursive: true });
for (const [name, polyline] of Object.entries(CONTOURS)) {
  const wav = encodeWav(synthTone(polyline), SAMPLE_RATE);
  const path = `fixtures/${name}.wav`;
  writeFileSync(path, wav);
  console.log(`wrote ${path} (${TONE_MS}ms tone, f0Center ${f0Center} Hz)`);
}

// Also write one file with all four in sequence, for a full run-through
const all = Object.values(CONTOURS).map(synthTone);
const total = new Float32Array(all.reduce((n, a) => n + a.length, 0));
let off = 0;
for (const a of all) {
  total.set(a, off);
  off += a.length;
}
writeFileSync("fixtures/tones-all.wav", encodeWav(total, SAMPLE_RATE));
console.log("wrote fixtures/tones-all.wav (tones 1-4 in sequence)");
