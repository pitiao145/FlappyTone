// CLI: npm run make-tones [f0Center]
// Writes fixtures/tone1..4.wav — synthetic hums whose pitch follows the four
// Mandarin tone contours (PRD §6 polylines), centred on f0Center. Play them
// at the mic to test the game with known-correct input, or feed them to
// npm run analyze.
import { mkdirSync, writeFileSync } from "node:fs";
import { CONTOURS, IDEAL, synthTone } from "./tone-synth.ts";
import { encodeWav } from "./wav.ts";

const f0Center = process.argv[2] ? Number(process.argv[2]) : IDEAL.f0Center;
const opts = { ...IDEAL, f0Center };

mkdirSync("fixtures", { recursive: true });
const all: Float32Array[] = [];
for (const [name, polyline] of Object.entries(CONTOURS)) {
  const { samples } = synthTone(polyline, opts);
  all.push(samples);
  const path = `fixtures/${name}.wav`;
  writeFileSync(path, encodeWav(samples, opts.sampleRate));
  console.log(`wrote ${path} (${opts.toneMs}ms tone, f0Center ${f0Center} Hz)`);
}

// One file with all four in sequence, for a full run-through
const total = new Float32Array(all.reduce((n, a) => n + a.length, 0));
let off = 0;
for (const a of all) {
  total.set(a, off);
  off += a.length;
}
writeFileSync("fixtures/tones-all.wav", encodeWav(total, opts.sampleRate));
console.log("wrote fixtures/tones-all.wav (tones 1-4 in sequence)");
