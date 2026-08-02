// Synthetic Mandarin tone hums for testing — ideal or deliberately imperfect.
// PRD §6 gate polylines, as (t, chao) points.
export const CONTOURS: Record<string, [number, number][]> = {
  tone1: [[0, 5], [1, 5]],
  tone2: [[0, 3], [1, 5]],
  tone3: [[0, 2], [0.4, 1], [1, 4]],
  tone4: [[0, 5], [1, 1]],
};

export interface SynthOptions {
  sampleRate: number;
  f0Center: number;
  rangeSemitones: number;
  toneMs: number;
  gapMs: number;
  /** Random per-10ms pitch wobble in semitones (0 = perfect) */
  jitterSemitones: number;
  /** White noise added to the signal, 0–1 amplitude */
  noiseAmplitude: number;
  /** Probability per 10ms of a ~60ms unvoiced dropout (simulates creak) */
  dropoutRate: number;
  seed: number;
}

export const IDEAL: SynthOptions = {
  sampleRate: 44100,
  f0Center: 120,
  rangeSemitones: 5,
  toneMs: 600,
  gapMs: 400,
  jitterSemitones: 0,
  noiseAmplitude: 0,
  dropoutRate: 0,
  seed: 1,
};

// Small deterministic PRNG so fixtures and sweeps are reproducible
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chaoAt(polyline: [number, number][], t: number): number {
  for (let i = 1; i < polyline.length; i++) {
    const [t0, c0] = polyline[i - 1];
    const [t1, c1] = polyline[i];
    if (t <= t1) return c0 + ((t - t0) / (t1 - t0)) * (c1 - c0);
  }
  return polyline[polyline.length - 1][1];
}

export function chaoToHz(chao: number, opts: SynthOptions): number {
  const semitones = ((chao - 3) / 2) * opts.rangeSemitones;
  return opts.f0Center * Math.pow(2, semitones / 12);
}

/** Returns the samples plus the ideal chao value per sample (NaN in gaps). */
export function synthTone(
  polyline: [number, number][],
  opts: SynthOptions,
): { samples: Float32Array; idealChao: Float32Array } {
  const rand = mulberry32(opts.seed);
  const toneSamples = Math.round((opts.toneMs / 1000) * opts.sampleRate);
  const gapSamples = Math.round((opts.gapMs / 1000) * opts.sampleRate);
  const total = gapSamples + toneSamples + gapSamples;
  const samples = new Float32Array(total);
  const idealChao = new Float32Array(total).fill(NaN);

  const stepSamples = Math.round(0.01 * opts.sampleRate); // 10ms control rate
  let phase = 0;
  let jitter = 0;
  let dropoutLeft = 0;
  for (let i = 0; i < toneSamples; i++) {
    if (i % stepSamples === 0) {
      jitter = (rand() * 2 - 1) * opts.jitterSemitones;
      if (dropoutLeft <= 0 && rand() < opts.dropoutRate) {
        dropoutLeft = Math.round(0.06 * opts.sampleRate);
      }
    }
    const t = i / toneSamples;
    const chao = chaoAt(polyline, t);
    idealChao[gapSamples + i] = chao;
    const hz = chaoToHz(chao, opts) * Math.pow(2, jitter / 12);
    phase += (2 * Math.PI * hz) / opts.sampleRate;
    const voicedAmp = dropoutLeft > 0 ? 0.03 : 1;
    if (dropoutLeft > 0) dropoutLeft--;
    const s =
      0.6 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase);
    const fade = Math.min(1, i / (0.03 * opts.sampleRate), (toneSamples - i) / (0.03 * opts.sampleRate));
    samples[gapSamples + i] = 0.5 * s * fade * voicedAmp;
  }
  if (opts.noiseAmplitude > 0) {
    for (let i = 0; i < total; i++) {
      samples[i] += (rand() * 2 - 1) * opts.noiseAmplitude;
    }
  }
  return { samples, idealChao };
}
