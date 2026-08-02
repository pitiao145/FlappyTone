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
 * snap it to the nearest octave of the previous value.
 */
export function correctOctave(
  f0: number,
  prevF0: number | null,
  tolerance = 0.05,
): number {
  if (prevF0 === null) return f0;
  if (Math.abs(f0 / (2 * prevF0) - 1) <= tolerance) return f0 / 2;
  if (Math.abs(f0 / (0.5 * prevF0) - 1) <= tolerance) return f0 * 2;
  return f0;
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
