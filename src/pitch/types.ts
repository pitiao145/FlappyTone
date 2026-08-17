export interface PitchState {
  /** Raw detected f0 in Hz, or null when unvoiced */
  f0: number | null;
  clarity: number;
  rms: number;
  voiced: boolean;
  /** Semitones relative to f0Center, or null when unvoiced */
  semitones: number | null;
  /** Chao 1–5 from the current frame, or null when unvoiced */
  chao: number | null;
  /** Exponentially smoothed Chao value — holds last value when unvoiced */
  smoothedChao: number;
}

export interface PitchTrackerConfig {
  sampleRate: number;
  frameSize: number;
  f0Center: number;
  /** Semitones from centre *up* to Chao 5 (PRD: 3–8, measured bounds 3–10) */
  rangeSemitones: number;
  /**
   * Semitones from centre *down* to Chao 1. Measured separately, because a
   * speaking voice sits near the bottom of its own range — see
   * `semitonesToChao`. Defaults to `rangeSemitones` (the old symmetric board).
   */
  rangeDownSemitones: number;
  alpha: number;
  /** Max semitone change per analysis frame; faster jumps are detector errors */
  maxSlewSemitones: number;
  clarityThreshold: number;
  /** Primary gate requires rms >= noiseFloor * this (vs default 3). */
  rmsMult: number;
  /** Clarity floor for the glide rescue; below this a frame is never voiced */
  rescueClarity: number;
  /** Rescue requires rms >= noiseFloor * this (vs * 3 for the primary gate) */
  rescueRmsMult: number;
  /** Semitones of pitch travel allowed per elapsed hop when rescuing */
  rescueMaxSemitones: number;
  /** Give up rescuing after this many consecutive unvoiced frames */
  rescueMaxFrames: number;
  /** Consecutive unvoiced frames after which median/octave history is discarded */
  staleUnvoicedFrames: number;
  /**
   * Samples of the frame's centre actually searched for pitch. Shorter than
   * frameSize: a fast Tone-4 fall sweeps ~7% in pitch across a full 2048
   * window, smearing the correlation peak below the clarity threshold.
   */
  detectWindow: number;
  /** Calibrated silence RMS; voiced requires rms >= noiseFloor * 3 */
  noiseFloor: number;
  fMin: number;
  fMax: number;
}
