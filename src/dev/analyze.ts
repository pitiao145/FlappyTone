// CLI: npm run analyze <file.wav> [f0Center]
// Runs the WAV through the same PitchTracker the game uses and prints an
// ASCII Chao contour — the offline way to "see" what the pitch pipeline saw.
import { readFileSync } from "node:fs";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { decodeWav } from "./wav.ts";

const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;
const COLS = 100;
const ROWS = 21; // chao 1..5 at 0.2 resolution

const path = process.argv[2];
if (!path) {
  console.error("usage: npm run analyze <file.wav> [f0Center]");
  process.exit(1);
}
const f0Center = process.argv[3] ? Number(process.argv[3]) : 120;

const { sampleRate, samples } = decodeWav(readFileSync(path));
const tracker = new PitchTracker({ sampleRate, f0Center, alpha: 0.6 });

interface Point {
  t: number;
  chao: number | null;
  f0: number | null;
}
const points: Point[] = [];
for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
  const state = tracker.push(samples.subarray(start, start + FRAME_SIZE));
  points.push({
    t: start / sampleRate,
    chao: state.voiced ? state.smoothedChao : null,
    f0: state.f0,
  });
}

const duration = samples.length / sampleRate;
const voicedF0s = points.filter((p) => p.f0 !== null).map((p) => p.f0!);
const median = voicedF0s.length
  ? [...voicedF0s].sort((a, b) => a - b)[Math.floor(voicedF0s.length / 2)]
  : null;

console.log(`file: ${path}`);
console.log(`duration: ${duration.toFixed(2)}s  sampleRate: ${sampleRate}  f0Center: ${f0Center} Hz`);
console.log(
  `voiced: ${voicedF0s.length}/${points.length} frames` +
    (median !== null ? `  median voiced f0: ${median.toFixed(1)} Hz` : ""),
);
console.log();

// Render in COLS-wide chunks so long files stay readable
const perCol = Math.max(1, Math.ceil(points.length / COLS));
const chunks: (number | null)[] = [];
for (let i = 0; i < points.length; i += perCol) {
  const slice = points.slice(i, i + perCol).map((p) => p.chao).filter((c): c is number => c !== null);
  chunks.push(slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null);
}

const grid: string[][] = Array.from({ length: ROWS }, () => Array(chunks.length).fill(" "));
chunks.forEach((chao, col) => {
  if (chao === null) return;
  const row = Math.round((5 - chao) * ((ROWS - 1) / 4));
  grid[Math.min(ROWS - 1, Math.max(0, row))][col] = "o";
});

for (let r = 0; r < ROWS; r++) {
  const chaoAtRow = 5 - (r * 4) / (ROWS - 1);
  const label = Number.isInteger(chaoAtRow) ? `${chaoAtRow} ` : "  ";
  const rule = Number.isInteger(chaoAtRow) ? "-" : " ";
  console.log(label + grid[r].map((c) => (c === " " ? rule : c)).join(""));
}
console.log("  " + `0s${" ".repeat(Math.max(0, chunks.length - 10))}${duration.toFixed(1)}s`);
