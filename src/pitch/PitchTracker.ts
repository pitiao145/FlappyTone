import { PitchDetector } from "pitchy";
import {
  MedianFilter,
  correctOctave,
  hzToSemitones,
  rmsOf,
  semitonesToChao,
} from "./math.ts";
import type { PitchState, PitchTrackerConfig } from "./types.ts";

export const DEFAULT_CONFIG: Omit<PitchTrackerConfig, "sampleRate"> = {
  frameSize: 2048,
  f0Center: 120,
  rangeSemitones: 5,
  alpha: 0.6,
  clarityThreshold: 0.85,
  noiseFloor: 0.0033, // effective RMS floor ≈ 0.01 until calibration exists
  fMin: 70,
  fMax: 400,
};

export class PitchTracker {
  private config: PitchTrackerConfig;
  private detector: PitchDetector<Float32Array>;
  private median = new MedianFilter(5);
  private prevVoicedF0: number | null = null;
  private smoothedChao = 3;

  constructor(config: Partial<PitchTrackerConfig> & { sampleRate: number }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.detector = PitchDetector.forFloat32Array(this.config.frameSize);
  }

  setF0Center(hz: number): void {
    this.config.f0Center = hz;
  }

  setRangeSemitones(range: number): void {
    this.config.rangeSemitones = range;
  }

  setAlpha(alpha: number): void {
    this.config.alpha = alpha;
  }

  setClarityThreshold(threshold: number): void {
    this.config.clarityThreshold = threshold;
  }

  push(frame: Float32Array): PitchState {
    const {
      sampleRate,
      f0Center,
      rangeSemitones,
      alpha,
      clarityThreshold,
      noiseFloor,
      fMin,
      fMax,
    } = this.config;

    const [rawF0, clarity] = this.detector.findPitch(frame, sampleRate);
    const rms = rmsOf(frame);

    const inBand = rawF0 >= fMin && rawF0 <= fMax;
    const voiced =
      inBand && clarity >= clarityThreshold && rms >= noiseFloor * 3;

    if (!voiced) {
      return {
        f0: null,
        clarity,
        rms,
        voiced: false,
        semitones: null,
        chao: null,
        smoothedChao: this.smoothedChao,
      };
    }

    const f0 = correctOctave(rawF0, this.prevVoicedF0);
    this.prevVoicedF0 = f0;
    const medianF0 = this.median.push(f0);

    const semitones = hzToSemitones(medianF0, f0Center);
    const chao = semitonesToChao(semitones, rangeSemitones);
    this.smoothedChao += alpha * (chao - this.smoothedChao);

    return {
      f0: medianF0,
      clarity,
      rms,
      voiced: true,
      semitones,
      chao,
      smoothedChao: this.smoothedChao,
    };
  }
}
