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

export interface VoicingFrame {
  f0: number;
  clarity: number;
  rms: number;
  /** Last accepted f0 in Hz, or null if nothing has been voiced yet */
  prevVoicedF0: number | null;
  /** Consecutive unvoiced frames immediately before this one (0 = last frame was voiced) */
  framesSinceVoiced: number;
}

export interface VoicingConfig {
  clarityThreshold: number;
  noiseFloor: number;
  /** Clarity floor for the glide rescue; below this a frame is never voiced */
  rescueClarity: number;
  /** Rescue requires rms >= noiseFloor * this (vs * 3 for the primary gate) */
  rescueRmsMult: number;
  /** Semitones of pitch travel allowed per elapsed hop when rescuing */
  rescueMaxSemitones: number;
  /** Give up rescuing after this many consecutive unvoiced frames */
  rescueMaxFrames: number;
}

/**
 * Tuned on fixtures/captures/Jane-*.wav (native Taiwanese speaker, iPhone mic).
 * The rescue window is deliberately narrow: loud AND pitch-continuous AND
 * recent. Any one of those alone admits wind or octave errors.
 */
export const DEFAULT_VOICING: VoicingConfig = {
  clarityThreshold: 0.7,
  noiseFloor: 0.0033,
  rescueClarity: 0.4,
  rescueRmsMult: 10,
  rescueMaxSemitones: 3,
  rescueMaxFrames: 3,
};

/**
 * Voicing decision for one frame.
 *
 * The primary gate is PRD §5.2 (clarity + RMS). The *glide rescue* is the
 * second path, and it exists because NSDF clarity collapses precisely when a
 * tone moves fastest: across a steep Tone 4 fall the waveform is no longer
 * periodic within the analysis window, so correlation degrades even though the
 * signal is loud and the detected pitch is correct. Jane-4 loses its entire
 * lower fall that way — frames at clarity 0.44–0.59 carrying full vowel
 * loudness and a perfectly smooth 330→193Hz descent.
 *
 * So a frame that misses on clarity alone is still voiced if it is
 * unmistakably loud and continues the previous pitch. Continuity is what makes
 * this safe: an octave error jumps ~12 semitones and is rejected, while a real
 * glide moves a few. The allowance scales with the gap so a single dropped
 * frame doesn't break the chain.
 */
export function isFrameVoiced(frame: VoicingFrame, config: VoicingConfig): boolean {
  const { f0, clarity, rms, prevVoicedF0, framesSinceVoiced } = frame;
  if (f0 <= 0) return false;
  if (rms < config.noiseFloor * 3) return false;

  if (clarity >= config.clarityThreshold) return true;

  // --- glide rescue ---
  if (clarity < config.rescueClarity) return false;
  if (prevVoicedF0 === null) return false;
  if (framesSinceVoiced > config.rescueMaxFrames) return false;
  if (rms < config.noiseFloor * config.rescueRmsMult) return false;

  const travel = Math.abs(hzToSemitones(f0, prevVoicedF0));
  const allowed = config.rescueMaxSemitones * (framesSinceVoiced + 1);
  return travel <= allowed;
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
