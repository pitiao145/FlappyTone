export const RANGE_SEMITONES = 5;

export function hzToSemitones(f0: number, f0Center: number): number {
  return 12 * Math.log2(f0 / f0Center);
}

export function semitonesToChao(
  semitones: number,
  rangeSemitones = RANGE_SEMITONES,
): number {
  const chao = 3 + (semitones / rangeSemitones) * 2;
  return Math.min(5, Math.max(1, chao));
}

/**
 * If f0 is within `tolerance` (relative) of 2x or 0.5x the previous voiced f0,
 * the detector may have flipped octave layers — but *either* frame could be
 * the wrong one. Snapping blindly toward the previous frame lets one bad
 * onset frame drag every correct frame after it into the wrong octave
 * (observed on fixtures/captures/pierre_ma1.wav: a 77 Hz first frame pinned a
 * 154 Hz syllable to the floor). So on ambiguity, keep whichever octave lies
 * closer to the speaker's calibrated f0Center — tones live within ±8
 * semitones of it, well under the 12 an octave flip introduces.
 */
export function correctOctave(
  f0: number,
  prevF0: number | null,
  f0Center: number,
  tolerance = 0.05,
): number {
  if (prevF0 === null) return f0;
  const nearerCenter = (a: number, b: number) =>
    Math.abs(Math.log2(a / f0Center)) <= Math.abs(Math.log2(b / f0Center)) ? a : b;
  if (Math.abs(f0 / (2 * prevF0) - 1) <= tolerance) return nearerCenter(f0 / 2, f0);
  if (Math.abs(f0 / (0.5 * prevF0) - 1) <= tolerance) return nearerCenter(f0 * 2, f0);
  return f0;
}

/**
 * Limit the per-frame semitone change to maxSlew. A voice glides; a detector
 * glitch teleports — anything faster than a plausible glide is an error.
 */
export function clampSlew(
  semitones: number,
  prevSemitones: number | null,
  maxSlew: number,
): number {
  if (prevSemitones === null) return semitones;
  const delta = semitones - prevSemitones;
  if (Math.abs(delta) <= maxSlew) return semitones;
  return prevSemitones + Math.sign(delta) * maxSlew;
}

export function rmsOf(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

/** Running median filter over the last `windowSize` pushed values. */
export class MedianFilter {
  private buffer: number[] = [];
  private windowSize: number;

  constructor(windowSize = 5) {
    this.windowSize = windowSize;
  }

  push(value: number): number {
    this.buffer.push(value);
    if (this.buffer.length > this.windowSize) this.buffer.shift();
    const sorted = [...this.buffer].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  reset(): void {
    this.buffer = [];
  }
}
