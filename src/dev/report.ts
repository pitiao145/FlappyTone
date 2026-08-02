// CLI: npm run report [files...] [--set k=v,...] [--json out.json] [--f0 hz]
//
// The offline half of the dot-tuning loop. Replays recorded WAVs (real
// voices, captured via the Capture dev screen) through PitchTracker with one
// or more parameter sets and reports, per utterance:
//   fit     rmse of smoothedChao vs the tone's ideal contour (chao units)
//   lag     smoothing delay, raw-chao vs smoothed-chao cross-correlation (ms)
//   wiggle  mean excess frame-to-frame movement vs ideal (visual shake)
//   voiced% / maxDrop  how much of the utterance was heard, longest gap (ms)
//
// The target tone comes from the trailing digit in the filename
// (chen_ma3.wav → tone 3). Files named *all* are assumed to contain
// utterances of tones 1,2,3,4 in order. f0Center per speaker comes from
// fixtures/captures/speakers.json ({"pierre": 118, ...}), else --f0, else 120.
//
// --json dumps full frame series + metrics — the machine-readable artifact
// for parameter tuning.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { PitchTracker, DEFAULT_CONFIG } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";
import { CONTOURS, chaoAt } from "./tone-synth.ts";
import { decodeWav } from "./wav.ts";

const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;
const CAPTURES_DIR = "fixtures/captures";
/** Voiced regions closer than this are one utterance (covers T3 creak gaps). */
const MERGE_GAP_MS = 250;
/** Voiced regions shorter than this are noise blips, not utterances. */
const MIN_UTTERANCE_MS = 120;
const MAX_LAG_FRAMES = 12;

// ------------------------------------------------------------------- argv

interface ParamSet {
  label: string;
  overrides: Partial<{ alpha: number; clarityThreshold: number; maxSlewSemitones: number; noiseFloor: number; rangeSemitones: number }>;
}

const SET_KEYS: Record<string, keyof ParamSet["overrides"]> = {
  alpha: "alpha",
  clarity: "clarityThreshold",
  clarityThreshold: "clarityThreshold",
  slew: "maxSlewSemitones",
  maxSlewSemitones: "maxSlewSemitones",
  noiseFloor: "noiseFloor",
  range: "rangeSemitones",
  rangeSemitones: "rangeSemitones",
};

const files: string[] = [];
const paramSets: ParamSet[] = [];
let jsonOut: string | null = null;
let f0Flag: number | null = null;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--set") {
    const spec = argv[++i];
    const overrides: ParamSet["overrides"] = {};
    for (const pair of spec.split(",")) {
      const [k, v] = pair.split("=");
      const key = SET_KEYS[k];
      if (!key) {
        console.error(`unknown param "${k}" (know: ${Object.keys(SET_KEYS).join(", ")})`);
        process.exit(1);
      }
      overrides[key] = Number(v);
    }
    paramSets.push({ label: spec, overrides });
  } else if (arg === "--json") {
    jsonOut = argv[++i];
  } else if (arg === "--f0") {
    f0Flag = Number(argv[++i]);
  } else {
    files.push(arg);
  }
}

if (files.length === 0 && existsSync(CAPTURES_DIR)) {
  for (const f of readdirSync(CAPTURES_DIR).sort()) {
    if (f.endsWith(".wav")) files.push(join(CAPTURES_DIR, f));
  }
}
if (files.length === 0) {
  console.error(`usage: npm run report [file.wav ...] [--set alpha=0.6,clarity=0.8] [--json out.json] [--f0 120]
No files given and no ${CAPTURES_DIR}/*.wav found.`);
  process.exit(1);
}
if (paramSets.length === 0) paramSets.push({ label: "default", overrides: {} });

const speakerCenters: Record<string, number> = (() => {
  const p = join(CAPTURES_DIR, "speakers.json");
  try {
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  } catch {
    return {};
  }
})();

// ------------------------------------------------------------------ replay

interface Frame {
  /** Seconds at the centre of the analysis window. */
  t: number;
  state: PitchState;
}

interface Utterance {
  startS: number;
  endS: number;
  tone: number | null;
  fit: number | null;
  lagMs: number;
  wiggle: number;
  voicedPct: number;
  maxDropMs: number;
}

function toneFromName(name: string): { tone: number | null; sequence: boolean } {
  const base = basename(name).replace(/\.wav$/i, "");
  if (/all|seq/i.test(base)) return { tone: null, sequence: true };
  const m = base.match(/([1-4])(?:_[a-z0-9]+)?$/i);
  return { tone: m ? Number(m[1]) : null, sequence: false };
}

function f0CenterFor(name: string): number {
  const speaker = basename(name).split("_")[0].replace(/\.wav$/i, "");
  return speakerCenters[speaker] ?? f0Flag ?? 120;
}

function replay(samples: Float32Array, sampleRate: number, f0Center: number, set: ParamSet): Frame[] {
  const tracker = new PitchTracker({ sampleRate, f0Center, ...set.overrides });
  const frames: Frame[] = [];
  for (let s = 0; s + FRAME_SIZE <= samples.length; s += HOP_SIZE) {
    frames.push({
      t: (s + FRAME_SIZE / 2) / sampleRate,
      state: tracker.push(samples.subarray(s, s + FRAME_SIZE)),
    });
  }
  return frames;
}

/** Groups voiced frames into utterances, merging short unvoiced gaps. */
function segment(frames: Frame[], hopS: number): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  let start = -1;
  let lastVoiced = -1;
  const mergeFrames = MERGE_GAP_MS / 1000 / hopS;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].state.voiced) {
      if (start === -1) start = i;
      else if (i - lastVoiced > mergeFrames) {
        regions.push({ start, end: lastVoiced });
        start = i;
      }
      lastVoiced = i;
    }
  }
  if (start !== -1) regions.push({ start, end: lastVoiced });
  const minFrames = MIN_UTTERANCE_MS / 1000 / hopS;
  return regions.filter((r) => r.end - r.start >= minFrames);
}

function analyzeUtterance(
  frames: Frame[],
  region: { start: number; end: number },
  tone: number | null,
  hopS: number,
): Utterance {
  const span = frames.slice(region.start, region.end + 1);
  const n = span.length;
  const polyline = tone ? CONTOURS[`tone${tone}`] : null;

  // fit + wiggle over voiced frames, against the time-normalised ideal
  let errSum = 0;
  let errN = 0;
  let wiggleSum = 0;
  let wiggleN = 0;
  let voiced = 0;
  let maxDrop = 0;
  let drop = 0;
  let prev: { chao: number; ideal: number } | null = null;
  for (let i = 0; i < n; i++) {
    const st = span[i].state;
    if (!st.voiced) {
      drop++;
      maxDrop = Math.max(maxDrop, drop);
      prev = null;
      continue;
    }
    drop = 0;
    voiced++;
    if (polyline) {
      const ideal = chaoAt(polyline, n > 1 ? i / (n - 1) : 0);
      errSum += (st.smoothedChao - ideal) ** 2;
      errN++;
      if (prev) {
        wiggleSum += Math.max(0, Math.abs(st.smoothedChao - prev.chao) - Math.abs(ideal - prev.ideal));
        wiggleN++;
      }
      prev = { chao: st.smoothedChao, ideal };
    }
  }

  // lag: shift smoothedChao back by k frames, find best match to raw chao
  let bestLag = 0;
  let bestErr = Infinity;
  for (let k = 0; k <= MAX_LAG_FRAMES; k++) {
    let sum = 0;
    let cnt = 0;
    for (let i = k; i < n; i++) {
      const raw = span[i - k].state.chao;
      const sm = span[i].state;
      if (raw === null || !sm.voiced) continue;
      sum += Math.abs(sm.smoothedChao - raw);
      cnt++;
    }
    if (cnt > 5 && sum / cnt < bestErr) {
      bestErr = sum / cnt;
      bestLag = k;
    }
  }

  return {
    startS: frames[region.start].t,
    endS: frames[region.end].t,
    tone,
    fit: errN ? Math.sqrt(errSum / errN) : null,
    lagMs: bestLag * hopS * 1000,
    wiggle: wiggleN ? wiggleSum / wiggleN : 0,
    voicedPct: (100 * voiced) / n,
    maxDropMs: maxDrop * hopS * 1000,
  };
}

// -------------------------------------------------------------- rendering

const ROWS = 21;

/** ASCII contour of one utterance: raw chao (·) with smoothed chao (o) on top. */
function renderUtterance(frames: Frame[], region: { start: number; end: number }, tone: number | null): void {
  const span = frames.slice(region.start, region.end + 1);
  const cols = Math.min(span.length, 100);
  const perCol = span.length / cols;
  const grid: string[][] = Array.from({ length: ROWS }, () => Array(cols).fill(" "));
  const put = (chao: number, col: number, ch: string) => {
    const row = Math.min(ROWS - 1, Math.max(0, Math.round((5 - chao) * ((ROWS - 1) / 4))));
    grid[row][col] = ch;
  };
  const polyline = tone ? CONTOURS[`tone${tone}`] : null;
  for (let col = 0; col < cols; col++) {
    const i = Math.min(span.length - 1, Math.round(col * perCol));
    if (polyline) put(chaoAt(polyline, cols > 1 ? col / (cols - 1) : 0), col, "-");
    const st = span[i].state;
    if (st.chao !== null) put(st.chao, col, "·");
    if (st.voiced) put(st.smoothedChao, col, "o");
  }
  for (let r = 0; r < ROWS; r++) {
    const chaoAtRow = 5 - (r * 4) / (ROWS - 1);
    const label = Number.isInteger(chaoAtRow) ? `${chaoAtRow} ` : "  ";
    console.log(label + grid[r].join(""));
  }
  console.log("  o=smoothed (the dot)  ·=raw  -=ideal");
}

// ------------------------------------------------------------------- main

interface FileReport {
  file: string;
  f0Center: number;
  set: string;
  utterances: Utterance[];
  frames?: Array<{ t: number; f0: number | null; clarity: number; rms: number; voiced: boolean; chao: number | null; smoothedChao: number }>;
}

const reports: FileReport[] = [];

for (const set of paramSets) {
  console.log(`\n=== param set: ${set.label} ===`);
  for (const file of files) {
    const decoded = decodeWav(readFileSync(file));
    const hopS = HOP_SIZE / decoded.sampleRate;
    const f0Center = f0CenterFor(file);
    const frames = replay(decoded.samples, decoded.sampleRate, f0Center, set);
    const { tone: fileTone, sequence } = toneFromName(file);
    const regions = segment(frames, hopS);

    console.log(`\n--- ${file}  (f0Center ${f0Center} Hz, ${regions.length} utterance${regions.length === 1 ? "" : "s"})`);
    const utterances: Utterance[] = [];
    regions.forEach((region, idx) => {
      const tone = sequence ? (idx < 4 ? idx + 1 : null) : fileTone;
      const u = analyzeUtterance(frames, region, tone, hopS);
      utterances.push(u);
      console.log(
        `  [${idx}] ${u.startS.toFixed(2)}–${u.endS.toFixed(2)}s tone=${tone ?? "?"}` +
          `  fit=${u.fit?.toFixed(2) ?? "n/a"}  lag=${u.lagMs.toFixed(0)}ms` +
          `  wiggle=${u.wiggle.toFixed(3)}  voiced=${u.voicedPct.toFixed(0)}%  maxDrop=${u.maxDropMs.toFixed(0)}ms`,
      );
      renderUtterance(frames, region, tone);
    });
    reports.push({
      file,
      f0Center,
      set: set.label,
      utterances,
      ...(jsonOut
        ? {
            frames: frames.map((f) => ({
              t: Number(f.t.toFixed(4)),
              f0: f.state.f0,
              clarity: Number(f.state.clarity.toFixed(3)),
              rms: Number(f.state.rms.toFixed(5)),
              voiced: f.state.voiced,
              chao: f.state.chao,
              smoothedChao: Number(f.state.smoothedChao.toFixed(3)),
            })),
          }
        : {}),
    });
  }
}

// summary: mean metrics per param set across all scored utterances
console.log("\n=== summary (means over scored utterances) ===");
console.log("set".padEnd(40) + "fit".padStart(7) + "lag ms".padStart(8) + "wiggle".padStart(8) + "voiced%".padStart(9));
for (const set of paramSets) {
  const us = reports.filter((r) => r.set === set.label).flatMap((r) => r.utterances);
  const scored = us.filter((u) => u.fit !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  console.log(
    set.label.padEnd(40) +
      mean(scored.map((u) => u.fit!)).toFixed(2).padStart(7) +
      mean(us.map((u) => u.lagMs)).toFixed(0).padStart(8) +
      mean(scored.map((u) => u.wiggle)).toFixed(3).padStart(8) +
      mean(us.map((u) => u.voicedPct)).toFixed(0).padStart(9),
  );
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ defaults: DEFAULT_CONFIG, reports }, null, 1));
  console.log(`\nwrote ${jsonOut}`);
}
