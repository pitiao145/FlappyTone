import {
  DEFAULT_VOICING,
  MedianFilter,
  clampSlew,
  correctOctave,
  hzToSemitones,
  isFrameVoiced,
  rmsOf,
  semitonesToChao,
} from "./math.ts";
import { findPitchInBand } from "./mpm.ts";
import type { PitchState, PitchTrackerConfig } from "./types.ts";

export const DEFAULT_CONFIG: Omit<PitchTrackerConfig, "sampleRate"> = {
  frameSize: 2048,
  // The mic worklet's HOP_SIZE (src/audio/mic.ts). One hop is 21.3 ms at
  // 48 kHz, 23.2 ms at 44.1 kHz; time settings below are turned into frame
  // counts from it (see `framesFor`).
  hopSize: 1024,
  f0Center: 120,
  rangeSemitones: 5,
  rangeDownSemitones: 5,
  // Tuned via `npm run tune` (with median-5; median-3 since brief 42) — the median does the de-jitter work, so the
  // exponential smoother can be fast; 0.85 clarity missed too many frames.
  alpha: 0.85,
  medianFrames: 3,
  // 140.625 st/s = exactly 3.0 st per 21.3 ms hop at 48 kHz (the value tuned
  // as "3.0 st/hop"; brief 42 made it per second so 44.1 kHz gets the same
  // speed, 3.27 st/hop). The old 1.5 st/hop was set against an assumed
  // "Tone 4 is ~25 st/s", which real speech falsifies: Jane-4 (native, citation
  // T4) falls 377→127Hz in ~200ms ≈ 95 st/s, touching 140 st/s frame to frame.
  // At 1.5 the clamp itself flattened the fall it was meant to protect. An
  // octave error still jumps ~12 st and is still caught.
  maxSlewSemitonesPerSec: 140.625,
  // 0.8 went deaf mid-syllable on real Tone 2 (native captures hover ~0.7);
  // 0.65 admits noisy onsets. Chosen on fixtures/captures via `npm run report`.
  // Frames that miss here can still be recovered by the glide rescue — see
  // isFrameVoiced() in math.ts, which is what keeps fast Tone 4 falls alive.
  clarityThreshold: 0.7,
  rmsMult: DEFAULT_VOICING.rmsMult,
  rescueClarity: DEFAULT_VOICING.rescueClarity,
  rescueRmsMult: DEFAULT_VOICING.rescueRmsMult,
  rescueMaxSemitones: DEFAULT_VOICING.rescueMaxSemitones,
  // 3 hops at 48 kHz (DEFAULT_VOICING.rescueMaxFrames).
  rescueMaxMs: 64,
  // 5 hops at 48 kHz (107 ms) — just past the PRD §5.3 grace period, so the
  // reset lands only once the dot has already stopped being held for the old sound.
  staleUnvoicedMs: 107,
  noiseFloor: 0.0033, // effective RMS floor ≈ 0.01 until calibration exists
  fMin: 70,
  fMax: 400,
  // 1024 of the frame's centre: tone bodies (fast T2 rises / T4 falls) keep
  // clarity that a full-2048 search smears away. Chosen on fixtures/captures
  // via `npm run report --set window=...`.
  detectWindow: 1024,
  minVoicedRunMs: 0,
};

/**
 * A time setting (ms) as a whole number of hops at this device's rate. At
 * 48 kHz with a 1024 hop the shipped values give exactly the old frame counts
 * (64 ms → 3, 107 ms → 5, 171 ms → 8).
 */
export function framesFor(ms: number, sampleRate: number, hopSize: number): number {
  return Math.round(ms / ((1000 * hopSize) / sampleRate));
}

/** Frame counts and per-hop slew derived from the ms settings. */
export function derivedFrames(c: Pick<PitchTrackerConfig, "sampleRate" | "hopSize" | "maxSlewSemitonesPerSec" | "rescueMaxMs" | "staleUnvoicedMs" | "minVoicedRunMs">) {
  const hopSec = c.hopSize / c.sampleRate;
  return {
    maxSlewSemitones: c.maxSlewSemitonesPerSec * hopSec,
    rescueMaxFrames: framesFor(c.rescueMaxMs, c.sampleRate, c.hopSize),
    staleUnvoicedFrames: Math.max(1, framesFor(c.staleUnvoicedMs, c.sampleRate, c.hopSize)),
    minVoicedRun: Math.max(1, framesFor(c.minVoicedRunMs, c.sampleRate, c.hopSize)),
  };
}

export class PitchTracker {
  private config: PitchTrackerConfig;
  private frames: ReturnType<typeof derivedFrames>;
  private median: MedianFilter;
  private prevVoicedF0: number | null = null;
  private prevSemitones: number | null = null;
  /** Consecutive unvoiced frames; bounds how long the glide rescue trusts prevVoicedF0. */
  private framesSinceVoiced = Number.MAX_SAFE_INTEGER;
  private smoothedChao = 3;
  /** Consecutive frames that passed the voicing gate (see `minVoicedRunMs`). */
  private voicedRun = 0;

  constructor(config: Partial<PitchTrackerConfig> & { sampleRate: number }) {
    // A caller that sets only `rangeSemitones` means a symmetric board, and
    // several do — clipCut measures corridors against ±15 st and must not
    // silently get 15 up / 5 down from the default. Mirroring here is what
    // keeps every offline measurement on the mapping it was written for.
    const mirrored =
      config.rangeSemitones !== undefined && config.rangeDownSemitones === undefined
        ? { rangeDownSemitones: config.rangeSemitones }
        : {};
    this.config = { ...DEFAULT_CONFIG, ...config, ...mirrored };
    this.frames = derivedFrames(this.config);
    this.median = new MedianFilter(this.config.medianFrames);
  }

  /** The ms settings as frame counts at this tracker's rate (read-only). */
  getDerivedFrames(): Readonly<ReturnType<typeof derivedFrames>> {
    return this.frames;
  }

  /**
   * The config in force. Read-only snapshot: dev tooling needs to show a
   * slider at the value the running tracker actually has, not at the default.
   */
  getConfig(): Readonly<PitchTrackerConfig> {
    return this.config;
  }

  setF0Center(hz: number): void {
    this.config.f0Center = hz;
  }

  /** `down` defaults to `up`, keeping the symmetric board for callers that
   * have only ever had one number (offline measurement, the dev report). */
  setRangeSemitones(range: number, down: number = range): void {
    this.config.rangeSemitones = range;
    this.config.rangeDownSemitones = down;
  }

  setNoiseFloor(rms: number): void {
    this.config.noiseFloor = rms;
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
      rangeDownSemitones,
      alpha,
      clarityThreshold,
      noiseFloor,
      fMin,
      fMax,
    } = this.config;

    const w = Math.min(this.config.detectWindow, frame.length);
    const off = (frame.length - w) >> 1;
    const [rawF0, clarity] = findPitchInBand(
      frame.subarray(off, off + w),
      sampleRate,
      fMin,
      fMax,
    );
    // Voicing is judged on the same audio the pitch came from. Measuring the
    // whole 2048 lets silence in the outer samples veto a centre that is
    // cleanly voiced — a spurious "couldn't hear that" at syllable onset.
    const rms = rmsOf(frame.subarray(off, off + w));

    const voiced = isFrameVoiced(
      {
        f0: rawF0,
        clarity,
        rms,
        prevVoicedF0: this.prevVoicedF0,
        framesSinceVoiced: this.framesSinceVoiced,
      },
      {
        clarityThreshold,
        noiseFloor,
        rmsMult: this.config.rmsMult,
        rescueClarity: this.config.rescueClarity,
        rescueRmsMult: this.config.rescueRmsMult,
        rescueMaxSemitones: this.config.rescueMaxSemitones,
        rescueMaxFrames: this.frames.rescueMaxFrames,
      },
    );

    if (!voiced) {
      this.voicedRun = 0;
      this.framesSinceVoiced++;
      // Past this gap the previous syllable stops being evidence about the
      // next one — the player has breathed and may restart anywhere. Holding
      // the median buffer would drag the first frames of the new syllable
      // toward the old pitch, blunting exactly the onsets that matter.
      if (this.framesSinceVoiced === this.frames.staleUnvoicedFrames) {
        this.median.reset();
        this.prevVoicedF0 = null;
      }
      this.prevSemitones = null;
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

    const f0 = correctOctave(rawF0, this.prevVoicedF0, f0Center);
    this.prevVoicedF0 = f0;
    this.framesSinceVoiced = 0;
    const medianF0 = this.median.push(f0);

    const semitones = clampSlew(
      hzToSemitones(medianF0, f0Center),
      this.prevSemitones,
      this.frames.maxSlewSemitones,
    );
    this.prevSemitones = semitones;
    const chao = semitonesToChao(semitones, rangeSemitones, rangeDownSemitones);

    // Not yet a run long enough to trust (`minVoicedRunMs`): pitch history above
    // still advances, so a confirmed run starts from settled filters, but the
    // frame is reported unvoiced and the smoothed value does not move — a
    // lone blip never reaches the dot.
    this.voicedRun++;
    if (this.voicedRun < this.frames.minVoicedRun) {
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
