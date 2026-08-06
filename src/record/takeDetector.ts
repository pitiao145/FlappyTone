/**
 * Decides where one spoken take begins and ends, from voicing alone.
 *
 * This is the recording booth's whole quality gate. Jane records unsupervised,
 * so a take that is silently accepted and turns out to be unusable costs a trip
 * back to her; a take that is wrongly rejected costs her four seconds. The
 * thresholds below are deliberately set so the second failure is the likely one.
 *
 * Pure by construction (CLAUDE.md rule 5): it never sees audio, only per-frame
 * voicing plus the frame's peak magnitude, and it reports *times*. The caller
 * owns the sample buffer and slices it with the returned bounds. That is what
 * lets the fixture tests drive it offline from a WAV.
 */

export interface TakeConfig {
  /**
   * Kept before the first voiced frame. An unvoiced initial consonant — the
   * h- of hǎo, the aspirated t- of tāng — carries no pitch, so voicing onset is
   * already late; cutting at it would clip the syllable's attack.
   */
  preRollMs: number;
  /** Kept after the last voiced frame, for the same reason at the other end. */
  tailMs: number;
  /** Continuous unvoiced time after onset that ends the take. */
  silenceMs: number;
  /**
   * Silence shorter than this inside a take is part of it, not an edge — the
   * same figure the scorer and `make-ref-clips` use, and for the same reason:
   * Tone 3 creak drops voicing mid-syllable.
   */
  mergeGapMs: number;
  /** Shortest voiced run that counts as a syllable. Matches MIN_UTTERANCE_MS. */
  minTakeMs: number;
  /** Peak magnitude at or above which the take is treated as clipped. */
  maxPeak: number;
  /** Hard stop, so a stuck-open mic or a hum cannot record forever. */
  maxTakeMs: number;
}

export const DEFAULT_TAKE_CONFIG: TakeConfig = {
  preRollMs: 300,
  tailMs: 150,
  // Long enough that a stop consonant or a breath mid-word does not end the
  // take, short enough that she is not left staring at a word she has finished.
  silenceMs: 500,
  mergeGapMs: 120,
  minTakeMs: 180,
  // Not 1.0: 16-bit capture rounds to full scale slightly below it, and a
  // syllable that touches the rail is already distorted where it matters most.
  maxPeak: 0.98,
  maxTakeMs: 4000,
};

export type RejectReason = "short" | "clipped";

export type TakeEvent =
  | { type: "onset"; atMs: number }
  | {
      type: "accepted";
      /** Slice bounds for the caller's buffer, already padded. */
      startMs: number;
      endMs: number;
      utteranceMs: number;
      peak: number;
    }
  | { type: "rejected"; reason: RejectReason; utteranceMs: number; peak: number };

type Phase = "idle" | "armed" | "recording";

/**
 * One take at a time. `arm()` before each word; `push()` every analysis frame;
 * act on the returned event.
 */
export class TakeDetector {
  private readonly config: TakeConfig;
  private phase: Phase = "idle";

  private onsetMs = 0;
  private lastVoicedMs = 0;
  private runStartMs = 0;
  private bestRunMs = 0;
  private peak = 0;

  constructor(config: Partial<TakeConfig> = {}) {
    this.config = { ...DEFAULT_TAKE_CONFIG, ...config };
  }

  getConfig(): Readonly<TakeConfig> {
    return this.config;
  }

  /** Listen for the next take. Discards any take in progress. */
  arm(): void {
    this.phase = "armed";
    this.bestRunMs = 0;
    this.peak = 0;
  }

  disarm(): void {
    this.phase = "idle";
  }

  get isRecording(): boolean {
    return this.phase === "recording";
  }

  get isArmed(): boolean {
    return this.phase !== "idle";
  }

  /**
   * @param atMs   time of this frame, on the same clock the caller's buffer uses
   * @param voiced the tracker's voicing verdict for this frame
   * @param peak   max |sample| in this frame
   */
  push(atMs: number, voiced: boolean, peak: number): TakeEvent | null {
    if (this.phase === "idle") return null;

    if (this.phase === "armed") {
      if (!voiced) return null;
      this.phase = "recording";
      this.onsetMs = atMs;
      this.runStartMs = atMs;
      this.lastVoicedMs = atMs;
      this.bestRunMs = 0;
      this.peak = peak;
      return { type: "onset", atMs };
    }

    this.peak = Math.max(this.peak, peak);

    if (voiced) {
      // A gap longer than mergeGapMs starts a new run rather than extending
      // the old one, so two brief coughs never add up to a syllable.
      if (atMs - this.lastVoicedMs > this.config.mergeGapMs) {
        this.runStartMs = atMs;
      }
      this.lastVoicedMs = atMs;
      this.bestRunMs = Math.max(this.bestRunMs, this.lastVoicedMs - this.runStartMs);
    }

    const silent = atMs - this.lastVoicedMs >= this.config.silenceMs;
    const tooLong = atMs - this.onsetMs >= this.config.maxTakeMs;
    if (!silent && !tooLong) return null;

    return this.finish();
  }

  private finish(): TakeEvent {
    this.phase = "idle";
    const utteranceMs = this.bestRunMs;
    const peak = this.peak;

    // Clipping is checked first: a clipped take is usually also long enough,
    // and "too loud" is the more actionable thing to tell her.
    if (peak >= this.config.maxPeak) {
      return { type: "rejected", reason: "clipped", utteranceMs, peak };
    }
    if (utteranceMs < this.config.minTakeMs) {
      return { type: "rejected", reason: "short", utteranceMs, peak };
    }

    return {
      type: "accepted",
      startMs: Math.max(0, this.onsetMs - this.config.preRollMs),
      endMs: this.lastVoicedMs + this.config.tailMs,
      utteranceMs,
      peak,
    };
  }
}
