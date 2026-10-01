// CLI: npm run noise-bench [--write-wavs dir]
//
// Offline noise-robustness harness (research only — docs/noise-research.md).
// Mixes fixtures/captures/jane_ma*.wav with synthetic noise at several SNRs
// and replays each mix through PitchTracker under candidate front-ends.
//
// Why not `npm run report` directly: report segments utterances from the
// tracker's own voiced frames, so under noise it scores bogus "utterances"
// made of noise. Here the utterance regions come from the CLEAN file (same
// segment() rule as report), and the noisy run is scored on those regions
// with report's own fit / lag / wiggle / voiced% definitions, plus:
//   falseV%  voiced frames OUTSIDE any utterance — the bird twitching on noise
//   stErr    median |semitones(noisy) − semitones(clean)| on frames voiced in both
//
// Noise is synthetic and seeded (no dataset dependency). The candidate
// front-ends are prototypes local to this file — nothing here is shipped.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";
import { CONTOURS, chaoAt } from "./tone-synth.ts";
import { decodeWav, encodeWav } from "./wav.ts";

const FRAME = 2048;
const HOP = 1024;
const F0_CENTER = 168; // jane, fixtures/captures/speakers.json
const MERGE_GAP_MS = 250;
const MIN_UTTERANCE_MS = 120;
const DIR = "fixtures/captures";
const TARGETS = ["jane_ma1.wav", "jane_ma2.wav", "jane_ma3.wav", "jane_ma4.wav", "jane_ma3_natural.wav"];
const BABBLE_SRC = ["jane_ma0_neutral.wav", "jane_ba1.wav", "jane_chang2.wav", ...TARGETS];
const SNRS = [Infinity, 20, 10, 5, 0];

// ------------------------------------------------------------- utilities

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}
function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}
function load(name: string): { x: Float32Array; sr: number } {
  const w = decodeWav(new Uint8Array(readFileSync(join(DIR, name))));
  return { x: w.samples, sr: w.sampleRate };
}

/** RBJ biquad, direct form I, causal (same as a worklet would run it). */
function biquad(type: "hp" | "lp", fc: number, sr: number, q = Math.SQRT1_2) {
  const w0 = (2 * Math.PI * fc) / sr;
  const a = Math.sin(w0) / (2 * q);
  const c = Math.cos(w0);
  const b0 = type === "hp" ? (1 + c) / 2 : (1 - c) / 2;
  const b1 = type === "hp" ? -(1 + c) : 1 - c;
  const a0 = 1 + a;
  const k = [b0 / a0, b1 / a0, b0 / a0, (-2 * c) / a0, (1 - a) / a0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number) => {
    const y = k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
function filterAll(x: Float32Array, fs: Array<(v: number) => number>): Float32Array {
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let v = x[i];
    for (const f of fs) v = f(v);
    y[i] = v;
  }
  return y;
}

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr; im[i + k] += ti;
      }
    }
  }
}

// ----------------------------------------------------------------- noise

type NoiseKind = "fan" | "street" | "hum" | "babble" | "cafe";
const NOISES: NoiseKind[] = ["fan", "street", "hum", "babble", "cafe"];

/** Pink (Voss-McCartney-ish via Paul Kellet filter). Broadband HVAC/fan hiss. */
function pink(n: number, r: () => number): Float32Array {
  const y = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = gauss(r);
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    y[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
  }
  return y;
}
/** Brown noise: traffic rumble, low-frequency heavy, slowly modulated. */
function street(n: number, sr: number, r: () => number): Float32Array {
  const y = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = 0.995 * v + 0.05 * gauss(r);
    y[i] = v * (1 + 0.5 * Math.sin((2 * Math.PI * 0.3 * i) / sr));
  }
  const p = pink(n, r);
  for (let i = 0; i < n; i++) y[i] += 0.15 * p[i];
  return y;
}
/** Motor hum: 100 Hz fundamental + harmonics (in-band, periodic) + hiss. */
function hum(n: number, sr: number, r: () => number): Float32Array {
  const y = pink(n, r);
  const pr = rms(y);
  for (let i = 0; i < n; i++) {
    let h = 0;
    for (let k = 1; k <= 6; k++) h += Math.sin((2 * Math.PI * 100 * k * i) / sr + k) / k;
    y[i] = y[i] * 0.3 / pr + h;
  }
  return y;
}
/** Six overlapping, resampled talkers built from the other captures. */
function babble(n: number, sr: number, exclude: string, r: () => number): Float32Array {
  const y = new Float32Array(n);
  const srcs = BABBLE_SRC.filter((f) => f !== exclude).map((f) => load(f).x);
  for (let t = 0; t < 6; t++) {
    const ratio = 0.8 + 0.45 * r();
    let pos = 0;
    let s = srcs[Math.floor(r() * srcs.length)];
    let gain = 1 / (rms(s) + 1e-9);
    for (let i = 0; i < n; i++) {
      if (pos >= s.length - 1) {
        s = srcs[Math.floor(r() * srcs.length)];
        gain = 1 / (rms(s) + 1e-9);
        pos = Math.floor(r() * s.length * 0.3);
      }
      const j = Math.floor(pos), f = pos - j;
      y[i] += gain * (s[j] * (1 - f) + s[j + 1] * f);
      pos += ratio;
    }
  }
  return y;
}
function makeNoise(kind: NoiseKind, n: number, sr: number, target: string, seed: number): Float32Array {
  const r = rng(seed);
  if (kind === "fan") return pink(n, r);
  if (kind === "street") return street(n, sr, r);
  if (kind === "hum") return hum(n, sr, r);
  const b = babble(n, sr, target, r);
  if (kind === "babble") return b;
  const p = pink(n, r);
  const k = rms(b) / rms(p);
  for (let i = 0; i < n; i++) b[i] += 0.5 * k * p[i];
  return b;
}

// --------------------------------------------------------- candidates

interface Candidate {
  name: string;
  /** Whole-signal causal preprocessing (worklet-side DSP). */
  pre?: (x: Float32Array, sr: number) => Float32Array;
  /** Tracker config overrides. */
  cfg?: Record<string, number>;
  /** Per-frame hook before push: may adjust tracker, or return a replacement frame. */
  frameHook?: () => (tr: PitchTracker, frame: Float32Array, sr: number, last: PitchState | null) => Float32Array;
}

const bandpass = (x: Float32Array, sr: number) =>
  filterAll(x, [biquad("hp", 80, sr), biquad("hp", 80, sr), biquad("lp", 1000, sr), biquad("lp", 1000, sr)]);

/** Rolling noise-floor estimate: the 10th percentile of frame RMS over ~2 s.
 * The tracker's gate is noiseFloor × rmsMult(3), so the floor is set such that
 * the gate lands at `gateOverNoise` × the estimated noise RMS. */
function adaptiveFloor(gateOverNoise = 4.5) {
  const hist: number[] = [];
  return (tr: PitchTracker, frame: Float32Array) => {
    const c = frame.subarray(512, 1536);
    hist.push(rms(c));
    if (hist.length > 86) hist.shift();
    const sorted = [...hist].sort((a, b) => a - b);
    // Only ever raise the calibrated floor, never drop below it.
    tr.setNoiseFloor(Math.max(0.0033, (sorted[Math.floor(sorted.length * 0.1)] * gateOverNoise) / 3));
    return frame;
  };
}

/** Harmonicity gate: zero the frame if too little energy sits on k·f0 for the f0 MPM would pick. */
function harmonicGate(threshold: number) {
  return () => (_tr: PitchTracker, frame: Float32Array, sr: number) => {
    const n = FRAME;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    fft(re, im);
    const mag = (k: number) => re[k] * re[k] + im[k] * im[k];
    const binHz = sr / n;
    const lo = Math.ceil(70 / binHz), hi = Math.floor(2500 / binHz);
    let total = 0;
    for (let k = lo; k <= hi; k++) total += mag(k);
    // Best comb over the tracker band, 1-semitone steps.
    let best = 0;
    for (let f0 = 70; f0 <= 400; f0 *= 1.0595) {
      let h = 0;
      for (let m = 1; m * f0 < 2500; m++) {
        const c = Math.round((m * f0) / binHz);
        h += mag(c - 1) + mag(c) + mag(c + 1);
      }
      best = Math.max(best, h);
    }
    return total > 0 && best / total >= threshold ? frame : new Float32Array(n);
  };
}

/** Spectral subtraction with minimum-statistics noise PSD. Offline STFT, causal noise estimate. */
function spectralSubtract(x: Float32Array): Float32Array {
  const n = 1024, hop = 512;
  const win = new Float64Array(n).map((_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)));
  const y = new Float32Array(x.length);
  const smooth = new Float64Array(n / 2 + 1);
  const mins: Float64Array[] = [];
  for (let s = 0; s + n <= x.length; s += hop) {
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    const p = new Float64Array(n / 2 + 1);
    for (let k = 0; k <= n / 2; k++) {
      p[k] = re[k] * re[k] + im[k] * im[k];
      smooth[k] = 0.8 * smooth[k] + 0.2 * p[k];
    }
    mins.push(Float64Array.from(smooth));
    if (mins.length > 80) mins.shift(); // ~1 s
    for (let k = 0; k <= n / 2; k++) {
      let m = Infinity;
      for (const row of mins) m = Math.min(m, row[k]);
      const noise = 1.5 * m;
      const g = Math.max(0.05, 1 - (2 * noise) / (p[k] + 1e-20));
      const gs = Math.sqrt(g);
      re[k] *= gs; im[k] *= gs;
      if (k > 0 && k < n / 2) { re[n - k] *= gs; im[n - k] *= gs; }
    }
    // inverse via conj-FFT-conj
    for (let i = 0; i < n; i++) im[i] = -im[i];
    fft(re, im);
    for (let i = 0; i < n; i++) y[s + i] += (re[i] / n) * win[i];
  }
  return y;
}

/** Speaker-band gate: search only the player's calibrated range ± 3 st
 * (jane: centre 168, default ±5 st board), instead of the fixed 70–400 Hz. */
const speakerBand = { fMin: F0_CENTER * 2 ** (-8 / 12), fMax: F0_CENTER * 2 ** (8 / 12) };
const chain = (...hs: Array<() => (t: PitchTracker, f: Float32Array, sr: number, l: PitchState | null) => Float32Array>) => () => {
  const fs = hs.map((h) => h());
  return (t: PitchTracker, f: Float32Array, sr: number, l: PitchState | null) => fs.reduce((x, h) => h(t, x, sr, l), f);
};

const CANDIDATES: Candidate[] = [
  { name: "A baseline" },
  { name: "B clarity 0.8", cfg: { clarityThreshold: 0.8 } },
  { name: "C bandpass 80-1k", pre: bandpass },
  { name: "D1 adaptive 4.5x", frameHook: () => adaptiveFloor(4.5) },
  { name: "D2 adaptive 2x", frameHook: () => adaptiveFloor(2) },
  { name: "E1 harmonic .75", frameHook: harmonicGate(0.75) },
  { name: "E2 harmonic .85", frameHook: harmonicGate(0.85) },
  { name: "F spectral subtr", pre: spectralSubtract },
  { name: "G speaker band", cfg: speakerBand },
  { name: "H D2+G", cfg: speakerBand, frameHook: () => adaptiveFloor(2) },
  { name: "I C+D2+G", pre: bandpass, cfg: speakerBand, frameHook: () => adaptiveFloor(2) },
  { name: "K B+D2", cfg: { clarityThreshold: 0.8 }, frameHook: () => adaptiveFloor(2) },
  { name: "J D2+G+E1", cfg: speakerBand, frameHook: chain(() => adaptiveFloor(2), harmonicGate(0.75)) },
];

// --------------------------------------------------------------- replay

function replay(x: Float32Array, sr: number, c: Candidate): PitchState[] {
  const sig = c.pre ? c.pre(x, sr) : x;
  const tr = new PitchTracker({ sampleRate: sr, f0Center: F0_CENTER, ...c.cfg });
  const hook = c.frameHook?.();
  const out: PitchState[] = [];
  let last: PitchState | null = null;
  for (let s = 0; s + FRAME <= sig.length; s += HOP) {
    let f = sig.subarray(s, s + FRAME);
    if (hook) f = hook(tr, f, sr, last);
    last = tr.push(f);
    out.push(last);
  }
  return out;
}

function segment(fr: PitchState[], hopS: number): Array<[number, number]> {
  const regs: Array<[number, number]> = [];
  let start = -1, lastV = -1;
  const mg = MERGE_GAP_MS / 1000 / hopS;
  fr.forEach((st, i) => {
    if (!st.voiced) return;
    if (start === -1) start = i;
    else if (i - lastV > mg) { regs.push([start, lastV]); start = i; }
    lastV = i;
  });
  if (start !== -1) regs.push([start, lastV]);
  return regs.filter(([a, b]) => b - a >= MIN_UTTERANCE_MS / 1000 / hopS);
}

interface M { fit: number; lag: number; wiggle: number; voiced: number; falseV: number; stErr: number }

function score(fr: PitchState[], clean: PitchState[], regs: Array<[number, number]>, tone: number, hopS: number): M {
  const poly = CONTOURS[`tone${tone}`];
  let errS = 0, errN = 0, wS = 0, wN = 0, v = 0, tot = 0, lagSum = 0;
  for (const [a, b] of regs) {
    const span = fr.slice(a, b + 1), n = span.length;
    let prev: { c: number; i: number } | null = null;
    span.forEach((st, i) => {
      tot++;
      if (!st.voiced) { prev = null; return; }
      v++;
      const ideal = chaoAt(poly, n > 1 ? i / (n - 1) : 0);
      errS += (st.smoothedChao - ideal) ** 2; errN++;
      if (prev) { wS += Math.max(0, Math.abs(st.smoothedChao - prev.c) - Math.abs(ideal - prev.i)); wN++; }
      prev = { c: st.smoothedChao, i: ideal };
    });
    let best = 0, bestE = Infinity;
    for (let k = 0; k <= 12; k++) {
      let s = 0, cnt = 0;
      for (let i = k; i < n; i++) {
        const raw = span[i - k].chao;
        if (raw === null || !span[i].voiced) continue;
        s += Math.abs(span[i].smoothedChao - raw); cnt++;
      }
      if (cnt > 5 && s / cnt < bestE) { bestE = s / cnt; best = k; }
    }
    lagSum += best * hopS * 1000;
  }
  // outside: pad each region by 3 frames
  const inside = new Uint8Array(fr.length);
  for (const [a, b] of regs) for (let i = Math.max(0, a - 3); i <= Math.min(fr.length - 1, b + 3); i++) inside[i] = 1;
  let out = 0, outV = 0;
  const diffs: number[] = [];
  fr.forEach((st, i) => {
    if (!inside[i]) { out++; if (st.voiced) outV++; }
    else if (st.voiced && clean[i].voiced) diffs.push(Math.abs((st.semitones ?? 0) - (clean[i].semitones ?? 0)));
  });
  diffs.sort((p, q) => p - q);
  return {
    fit: errN ? Math.sqrt(errS / errN) : NaN,
    lag: lagSum / Math.max(1, regs.length),
    wiggle: wN ? wS / wN : 0,
    voiced: tot ? (100 * v) / tot : 0,
    falseV: out ? (100 * outV) / out : 0,
    stErr: diffs.length ? diffs[diffs.length >> 1] : NaN,
  };
}

// ------------------------------------------------------------------ main

const argv = process.argv.slice(2);
const wavDir = argv.includes("--write-wavs") ? argv[argv.indexOf("--write-wavs") + 1] : null;
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;
const cands = only ? CANDIDATES.filter((c) => only.some((o) => c.name.startsWith(o))) : CANDIDATES;

const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "  - ");
console.log("candidate            noise   snr   fit  lag  wiggle voiced% falseV% stErr");
for (const c of cands) {
  for (const noise of NOISES) {
    for (const snr of SNRS) {
      if (snr === Infinity && noise !== "fan") continue; // clean row once per candidate
      const acc: M[] = [];
      TARGETS.forEach((t, ti) => {
        const { x, sr } = load(t);
        const hopS = HOP / sr;
        const base = replay(x, sr, { name: "ref" });
        const regs = segment(base, hopS);
        // speech level = rms over clean-voiced regions
        const sp: number[] = [];
        for (const [a, b] of regs) for (let i = a * HOP; i < b * HOP + FRAME && i < x.length; i++) sp.push(x[i]);
        const speechRms = rms(Float32Array.from(sp));
        let mix = x;
        if (snr !== Infinity) {
          const nz = makeNoise(noise, x.length, sr, t, 1000 + ti * 7 + NOISES.indexOf(noise));
          const g = speechRms / (rms(nz) * 10 ** (snr / 20));
          mix = new Float32Array(x.length);
          for (let i = 0; i < x.length; i++) mix[i] = x[i] + g * nz[i];
          if (wavDir && c.name.startsWith("A")) {
            mkdirSync(wavDir, { recursive: true });
            writeFileSync(join(wavDir, t.replace("jane_", `jane_${noise}${snr}db_`)), encodeWav(mix, sr));
          }
        }
        const tone = Number(t.match(/ma(\d)/)![1]);
        acc.push(score(replay(mix, sr, c), base, regs, tone, hopS));
      });
      const mean = (k: keyof M) => {
        const v = acc.map((a) => a[k]).filter(Number.isFinite);
        return v.length ? v.reduce((p, q) => p + q, 0) / v.length : NaN;
      };
      console.log(
        `${c.name.padEnd(20)} ${(snr === Infinity ? "clean" : noise).padEnd(7)} ${String(snr === Infinity ? "∞" : snr).padStart(3)}  ${fmt(mean("fit"))} ${fmt(mean("lag"), 0).padStart(4)}  ${fmt(mean("wiggle"), 3)}  ${fmt(mean("voiced"), 0).padStart(5)}  ${fmt(mean("falseV"), 1).padStart(6)}  ${fmt(mean("stErr"), 2)}`,
      );
    }
  }
}
