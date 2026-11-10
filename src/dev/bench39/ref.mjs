// Brief 39 bench — an INDEPENDENT pitch reference, written from scratch.
// Not the production tracker and shares no code with src/pitch/.
//
// Method A (time domain): normalised cross-correlation (the RAPT idea) on a
//   16 kHz copy, 55–600 Hz, 10 ms hop, then a Viterbi search = "pick the one
//   smooth path through all frames at once" (offline, sees the future, so it
//   has no delay and can fix octave slips the live tracker cannot).
// Method B (frequency domain): subharmonic summation on an FFT = "which
//   fundamental explains the most harmonics in the spectrum".
// A frame is "trusted" when A is voiced and B agrees within 1 semitone.
// Two different methods agreeing is evidence, not gold truth (no Praat here).
import { rms } from "./lib.mjs";

export const REF_SR = 16000;
export const REF_HOP_S = 0.01;
const FMIN = 55, FMAX = 600;

function lowpassDecimate(x, sr) {
  // windowed-sinc low-pass at 7 kHz, then linear-interp resample to 16 kHz
  const fc = 7000 / sr, N = 63, h = new Float32Array(N);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const m = i - (N - 1) / 2;
    const s = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
    h[i] = s * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1)));
    sum += h[i];
  }
  for (let i = 0; i < N; i++) h[i] /= sum;
  const y = new Float32Array(x.length);
  const half = (N - 1) / 2;
  for (let i = 0; i < x.length; i++) {
    let a = 0;
    const lo = Math.max(0, i - half), hi = Math.min(x.length - 1, i + half);
    for (let j = lo; j <= hi; j++) a += x[j] * h[j - i + half];
    y[i] = a;
  }
  const n = Math.floor((x.length * REF_SR) / sr), out = new Float32Array(n);
  const step = sr / REF_SR;
  for (let i = 0; i < n; i++) {
    const p = i * step, k = Math.floor(p), f = p - k;
    out[i] = y[k] * (1 - f) + (y[Math.min(k + 1, y.length - 1)] || 0) * f;
  }
  // one-pole high-pass ~40 Hz: removes rumble / DC
  const a = Math.exp((-2 * Math.PI * 40) / REF_SR);
  let px = 0, py = 0;
  for (let i = 0; i < n; i++) { const v = out[i]; py = a * (py + v - px); px = v; out[i] = py; }
  return out;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

function shsFrame(y, c) {
  const W = 640, NF = 4096, re = new Float32Array(NF), im = new Float32Array(NF);
  for (let i = 0; i < W; i++) {
    const k = c - W / 2 + i;
    re[i] = (k >= 0 && k < y.length ? y[k] : 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1)));
  }
  fft(re, im);
  const mag = new Float32Array(NF / 2);
  for (let i = 0; i < NF / 2; i++) mag[i] = Math.sqrt(Math.hypot(re[i], im[i]));
  const binHz = REF_SR / NF;
  let best = 0, bestF = 0;
  const steps = Math.round(Math.log2(FMAX / FMIN) * 96);
  for (let s = 0; s <= steps; s++) {
    const f = FMIN * 2 ** (s / 96);
    let sc = 0, w = 1;
    for (let h = 1; h <= 12 && f * h < 5000; h++, w *= 0.84) {
      const p = (f * h) / binHz, k = Math.floor(p), fr = p - k;
      sc += w * (mag[k] * (1 - fr) + mag[k + 1] * fr);
    }
    if (sc > best) { best = sc; bestF = f; }
  }
  return bestF;
}

/** Returns { t: seconds[], f0: Hz|0 (0 = unvoiced), peak: nccf peak, shs: Hz, trusted: bool[], rms: [] } */
export function referenceTrack(samples, sr) {
  const y = lowpassDecimate(samples, sr);
  const hop = Math.round(REF_HOP_S * REF_SR), n = Math.round(0.015 * REF_SR);
  const minLag = Math.floor(REF_SR / FMAX), maxLag = Math.ceil(REF_SR / FMIN);
  const frames = [];
  const energies = [];
  for (let c = 0; c + n + maxLag < y.length + hop; c += hop) {
    // window starts at c - (n+lag)/2 so each lag's pair is centred on c (approximately)
    const cands = [];
    const nccf = new Float32Array(maxLag + 2);
    let maxv = 0;
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
      const s0 = c - ((n + lag) >> 1);
      if (s0 < 0 || s0 + n + lag > y.length) { nccf[lag] = 0; continue; }
      let ab = 0, aa = 0, bb = 0;
      for (let i = 0; i < n; i++) { const a = y[s0 + i], b = y[s0 + i + lag]; ab += a * b; aa += a * a; bb += b * b; }
      nccf[lag] = ab / Math.sqrt(aa * bb + 1e-12);
    }
    for (let lag = minLag; lag <= maxLag; lag++) {
      const v = nccf[lag];
      if (v > 0.3 && v >= nccf[lag - 1] && v >= nccf[lag + 1]) {
        const a = nccf[lag - 1], b = v, cc = nccf[lag + 1], den = a - 2 * b + cc;
        const sh = den !== 0 ? (0.5 * (a - cc)) / den : 0;
        cands.push({ f: REF_SR / (lag + sh), v, lag });
        if (v > maxv) maxv = v;
      }
    }
    cands.sort((p, q) => q.v - p.v);
    const e = rms(y, Math.max(0, c - 240), Math.min(y.length, c + 240));
    energies.push(e);
    frames.push({ c, cands: cands.slice(0, 8), maxv, e });
  }
  const sorted = [...energies].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] || 1e-6;
  const quiet = sorted[Math.floor(sorted.length * 0.05)] || 1e-7;
  // silence threshold: 35 dB under the loud level; raised to 2x the quiet level
  // in a noisy take, but never above 20 dB under the loud level
  const silence = Math.max(loud * 10 ** (-35 / 20), Math.min(quiet * 2, loud * 0.1));

  // Viterbi. State 0 = unvoiced, 1.. = candidates.
  const T = frames.length;
  let prevCost = [0], prevStates = [null];
  const back = [];
  for (let t = 0; t < T; t++) {
    const fr = frames[t];
    const states = [null, ...fr.cands];
    const cost = new Array(states.length), bp = new Array(states.length);
    for (let s = 0; s < states.length; s++) {
      const st = states[s];
      let local;
      if (!st) local = 0.1 + fr.maxv * 0.9 + (fr.e < silence ? -0.5 : 0);
      else local = 1 - st.v * (1 - 0.2 * (st.lag / maxLag)) + (fr.e < silence ? 1 : 0);
      let best = Infinity, bi = 0;
      for (let p = 0; p < prevStates.length; p++) {
        const ps = prevStates[p];
        let tr;
        if (!ps && !st) tr = 0;
        else if (!ps || !st) tr = 0.25;
        else tr = Math.min(1.2, 0.8 * Math.abs(Math.log2(st.f / ps.f)));
        const cst = prevCost[p] + tr;
        if (cst < best) { best = cst; bi = p; }
      }
      cost[s] = best + local; bp[s] = bi;
    }
    back.push({ states, bp });
    prevCost = cost; prevStates = states;
  }
  let s = prevCost.indexOf(Math.min(...prevCost));
  const f0 = new Float32Array(T), peak = new Float32Array(T);
  for (let t = T - 1; t >= 0; t--) {
    const st = back[t].states[s];
    f0[t] = st ? st.f : 0; peak[t] = st ? st.v : frames[t].maxv;
    s = back[t].bp[s];
  }
  const t = [], shs = [], trusted = [], e = [];
  for (let i = 0; i < T; i++) {
    t.push(frames[i].c / REF_SR);
    const sf = f0[i] > 0 ? shsFrame(y, frames[i].c) : 0;
    shs.push(sf);
    trusted.push(f0[i] > 0 && Math.abs(12 * Math.log2(sf / f0[i])) < 1);
    e.push(frames[i].e);
  }
  return { t, f0: Array.from(f0), peak: Array.from(peak), shs, trusted, rms: e };
}
