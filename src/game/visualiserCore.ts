/**
 * The per-frame core shared by the app's Visualiser and the public tone
 * checker (src/site/checker/engine.ts): it records the voice, decides when an
 * attempt ends, holds the bird through short gaps and eases it. Pure — no
 * Web Audio, no React, no canvas. Each page keeps its own setup, scoring and
 * UI; anything about how the line behaves belongs here, so the two pages
 * cannot drift apart again.
 */
import { ContourRecorder, PitchTrail, type Contour, type TrailPoint } from "./contours.ts";
import { tuning } from "./tuning.ts";

/**
 * A silence up to this long inside speech (a consonant like the q of qiān, a
 * creaky T3 dip, a slow second syllable) keeps the attempt open and is drawn
 * as a faint dashed bridge. Longer silences end the attempt. Used by Free
 * mode and tone pairs.
 */
export const BRIDGE_MS = 700;

/**
 * Single-tone words: how long a silence may last before the attempt ends.
 * Wider than the game's `mergeGapMs` (150ms), which reset the line mid-word.
 */
export const SINGLE_TONE_GAP_MS = 400;

export interface CoreOptions {
  /** Syllables in the target word (1 when there is none). */
  syllables: number;
  /** Free mode: one scrolling line instead of stacked attempts. */
  free: boolean;
}

export interface CoreFrame {
  live: Contour | null;
  finished: readonly Contour[];
  /** The attempt that ended since the last step, or null. Once per attempt. */
  attempt: Contour | null;
  /** Free mode attempts that ended since the last step (always [] otherwise). */
  freeAttempts: TrailPoint[][];
  /** Eased bird height, in chao. */
  chao: number;
  /** Fill the bird as voiced: speaking, holding a gap, or within grace. */
  dotVoiced: boolean;
  /** Free mode's scrolling line, or null. */
  scroll: { points: readonly TrailPoint[]; nowMs: number; originMs: number | null } | null;
}

export class VisualiserCore {
  private readonly recorder = new ContourRecorder();
  private readonly trail: PitchTrail;
  private voiced = false;
  private lastVoicedAt = -Infinity;
  private lastT: number | null = null;
  private displayChao = 3;
  private lastAttemptAt: number | null = null;

  constructor(spanMs: number) {
    this.trail = new PitchTrail(spanMs, BRIDGE_MS);
  }

  /** One pitch-tracker frame, on the host clock. */
  push(chao: number, voiced: boolean, nowMs: number): void {
    this.recorder.push(chao, voiced, nowMs);
    this.trail.push(chao, voiced, nowMs);
    this.voiced = voiced;
    if (voiced) this.lastVoicedAt = nowMs;
  }

  /** One animation frame. */
  step(nowMs: number, opts: CoreOptions): CoreFrame {
    const dt = this.lastT === null ? 0 : Math.min(100, nowMs - this.lastT);
    this.lastT = nowMs;
    const gapMs = opts.syllables > 1 ? BRIDGE_MS : SINGLE_TONE_GAP_MS;
    this.recorder.setMergeGapMs(gapMs);

    const live = this.recorder.live();
    const finished = this.recorder.finished();
    const sinceVoiced = nowMs - this.lastVoicedAt;

    // Free mode reads attempts off the trail; drain it either way so a
    // switch to Free does not replay old speech.
    const ended = this.trail.takeFinished();
    const freeAttempts = opts.free ? ended : [];

    // The bird holds its height across a gap the line bridges, so it never
    // disagrees with the line behind it; past that it returns to rest.
    const headChao = opts.free ? this.trail.points().at(-1)?.chao : live?.points.at(-1)?.chao;
    const holding = headChao !== undefined && sinceVoiced <= (opts.free ? BRIDGE_MS : gapMs);
    const target = headChao !== undefined && (this.voiced || holding) ? headChao : 3;
    this.displayChao += (target - this.displayChao) * (1 - Math.exp(-dt / tuning().easeTauMs));

    // `finished()` is capped and shifts, so identity (startedAtMs) rather
    // than length is what says "this one is new".
    const latest = finished.at(-1) ?? null;
    let attempt: Contour | null = null;
    if (latest && latest.startedAtMs !== this.lastAttemptAt) {
      this.lastAttemptAt = latest.startedAtMs;
      attempt = latest;
    }

    return {
      live,
      finished,
      attempt,
      freeAttempts,
      chao: this.displayChao,
      dotVoiced: this.voiced || holding || sinceVoiced <= tuning().graceMs,
      scroll: opts.free
        ? { points: this.trail.points(), nowMs: this.trail.clockMs(), originMs: this.trail.originMs() }
        : null,
    };
  }

  /** Forget every attempt — on Clear, or when the target word changes. */
  clear(): void {
    this.recorder.clear();
    this.trail.clear();
    this.lastAttemptAt = null;
  }
}
