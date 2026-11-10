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
  /**
   * Frames in the running median that removes single-frame jumps (odd). Kept
   * in frames, not ms: it removes a lone wrong *frame*, whatever the hop. Each
   * extra pair adds one hop of delay to the line (5 → 2 hops ≈ 43 ms at
   * 48 kHz; 3 → 1 hop ≈ 21 ms). 3 since brief 42 (Pierre's decision).
   */
  medianFrames: number;
  /**
   * Samples between two pushed frames (the mic worklet's HOP_SIZE). With
   * `sampleRate` it gives the real time step, from which every time-based
   * setting below is turned into a frame count, so 44.1 kHz and 48 kHz
   * devices behave the same.
   */
  hopSize: number;
  /** Max pitch speed, semitones per second; faster jumps are detector errors */
  maxSlewSemitonesPerSec: number;
  clarityThreshold: number;
  /** Primary gate requires rms >= noiseFloor * this (vs default 3). */
  rmsMult: number;
  /** Clarity floor for the glide rescue; below this a frame is never voiced */
  rescueClarity: number;
  /** Rescue requires rms >= noiseFloor * this (vs * 3 for the primary gate) */
  rescueRmsMult: number;
  /** Semitones of pitch travel allowed per elapsed hop when rescuing */
  rescueMaxSemitones: number;
  /** Give up rescuing after this long unvoiced (ms; rounded to whole hops) */
  rescueMaxMs: number;
  /** Unvoiced time after which median/octave history is discarded (ms; rounded to whole hops) */
  staleUnvoicedMs: number;
  /**
   * Samples of the frame's centre actually searched for pitch. Shorter than
   * frameSize: a fast Tone-4 fall sweeps ~7% in pitch across a full 2048
   * window, smearing the correlation peak below the clarity threshold.
   */
  detectWindow: number;
  /** Calibrated silence RMS; voiced requires rms >= noiseFloor * 3 */
  noiseFloor: number;
  /**
   * Voiced time required before any frame of the run is reported voiced (ms;
   * rounded to whole hops, at least 1 frame). 0 (the default) reports every
   * voiced frame — what every offline measurement (clipCut, report, analyze)
   * uses, so corridors never move. Live play passes `tuning().minVoicedRunMs`
   * (64 ms = 3 hops at 48 kHz): a fan or a breath on the mic throws up lone,
   * unrelated "voiced" frames that jerk the dot; real speech is dozens in a
   * row. Costs (n-1) hops of onset latency.
   */
  minVoicedRunMs: number;
  fMin: number;
  fMax: number;
}
