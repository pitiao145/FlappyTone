/**
 * Band-limited McLeod pitch detection (NSDF), replacing pitchy's full-range
 * search inside PitchTracker.
 *
 * Why: pitchy searches every lag up to the window length. On real voices the
 * normalized autocorrelation grows a tall subharmonic peak near the window
 * edge (~22 Hz for a 2048 window @ 44.1k; ~45 Hz for 1024) that outscores the
 * true pitch precisely where the vowel is loudest — so tone *bodies* went
 * unvoiced while onsets survived (observed on a learner capture since
 * removed). PRD §5.2 says to band-limit the *search*,
 * not just reject out-of-band results; this does that: lags outside
 * [sr/fMax, sr/fMin] are never candidates.
 */

/** Returns [f0Hz, clarity]; f0 is 0 when no acceptable peak exists. */
export function findPitchInBand(
  frame: Float32Array,
  sampleRate: number,
  fMin: number,
  fMax: number,
): [number, number] {
  const n = frame.length;
  const minLag = Math.max(2, Math.floor(sampleRate / fMax));
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / fMin));
  if (minLag >= maxLag) return [0, 0];

  // NSDF: nsdf(τ) = 2·Σ x[i]x[i+τ] / Σ (x[i]² + x[i+τ]²), over i < n-τ
  // Computed from minLag/4 so the above-band veto below has data to look at.
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = Math.max(2, minLag >> 2); lag <= maxLag; lag++) {
    let acf = 0;
    let norm = 0;
    for (let i = 0; i < n - lag; i++) {
      const a = frame[i];
      const b = frame[i + lag];
      acf += a * b;
      norm += a * a + b * b;
    }
    nsdf[lag] = norm > 0 ? (2 * acf) / norm : 0;
  }

  // Key maxima: the highest point of each positive local hump.
  let best = 0;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] > best && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      best = nsdf[lag];
    }
  }
  if (best <= 0) return [0, 0];

  // Above-band veto: a strong periodicity *above* fMax (a beep, an alarm, a
  // dominant formant) also correlates at 2-3x its period, which lands inside
  // the band and would report a fake in-band pitch. If the short-lag region
  // correlates about as well as the best in-band candidate, the true pitch is
  // above the band — treat the frame as unvoiced.
  const vetoMin = Math.max(2, minLag >> 2);
  for (let lag = vetoMin + 1; lag < minLag; lag++) {
    if (nsdf[lag] >= best * 0.95 && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      return [0, 0];
    }
  }

  // McLeod: take the FIRST (shortest-lag) key maximum within k of the global
  // best — this is what rejects octave-down errors inside the band.
  const threshold = best * 0.9;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] >= threshold && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      // Parabolic interpolation around the peak for sub-sample lag precision.
      // No clamp on `shift` is needed: this branch only runs where nsdf[lag] is
      // a local maximum, so a=b-δ and c=b-ε with δ,ε>=0, giving
      // shift = 0.5(δ-ε)/(δ+ε), which is structurally within [-0.5, 0.5].
      // The one degenerate case (δ=ε=0) is the denom guard below.
      const a = nsdf[lag - 1];
      const b = nsdf[lag];
      const c = nsdf[lag + 1];
      const denom = a - 2 * b + c;
      const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      const clarity = Math.min(1, b - 0.25 * (a - c) * shift);
      return [sampleRate / (lag + shift), clarity];
    }
  }
  return [0, 0];
}
