/**
 * Utterance segmentation for the tone visualiser — pure logic.
 * No Web Audio, no React, no canvas.
 *
 * The game's trail is drawn in world space against a corridor moving
 * underneath it. To *compare shapes* the world has to stand still and x has to
 * be time-since-this-utterance-began, so that two attempts at the same tone lie
 * on top of each other. Same data, stationary axis.
 *
 * The rules match the gate scorer's for the same reasons: runs separated by
 * less than `mergeGapMs` are one utterance (T3 creak drops the signal
 * mid-syllable), and a run shorter than `minMs` is a cough, not an attempt.
 */

import { tuning } from "./tuning.ts";

export interface ContourPoint {
  /** Milliseconds since this utterance began. */
  tMs: number;
  chao: number;
}

export interface Contour {
  points: ContourPoint[];
  /** Host clock at the first voiced frame. */
  startedAtMs: number;
  /** Host clock at the last voiced frame, or null while still open. */
  endedAtMs: number | null;
}

export interface ContourRecorderOptions {
  mergeGapMs?: number;
  minMs?: number;
  /** How many finished contours to keep for comparison. */
  maxKept?: number;
}

const DEFAULT_MAX_KEPT = 3;

export class ContourRecorder {
  private mergeGapMs: number;
  private readonly minMs: number;
  private readonly maxKept: number;

  private open: Contour | null = null;
  private lastVoicedAtMs = -Infinity;
  private kept: Contour[] = [];

  /**
   * Change how long a silence may last inside one utterance. The visualiser
   * widens it for a tone pair (`multiMergeGapMs`), so the pause between the
   * two syllables does not split the attempt in two.
   */
  setMergeGapMs(ms: number): void {
    this.mergeGapMs = ms;
  }

  constructor(opts: ContourRecorderOptions = {}) {
    this.mergeGapMs = opts.mergeGapMs ?? tuning().mergeGapMs;
    this.minMs = opts.minMs ?? tuning().minUtteranceMs;
    this.maxKept = opts.maxKept ?? DEFAULT_MAX_KEPT;
  }

  /** One analysis frame. Unvoiced frames are what close an utterance. */
  push(chao: number, voiced: boolean, nowMs: number): void {
    if (voiced) {
      if (this.open === null || nowMs - this.lastVoicedAtMs > this.mergeGapMs) {
        this.closeOpen();
        this.open = { points: [], startedAtMs: nowMs, endedAtMs: null };
      }
      this.open.points.push({ tMs: nowMs - this.open.startedAtMs, chao });
      this.lastVoicedAtMs = nowMs;
      return;
    }
    // Silence only ends the utterance once it has outlasted the merge gap —
    // otherwise a creak dropout would split one attempt into two.
    if (this.open !== null && nowMs - this.lastVoicedAtMs > this.mergeGapMs) {
      this.closeOpen();
    }
  }

  private closeOpen(): void {
    const open = this.open;
    this.open = null;
    if (open === null) return;
    const last = open.points[open.points.length - 1];
    // A lone frame measures 0 — one frame is not a duration.
    if (last === undefined || last.tMs < this.minMs) return;
    open.endedAtMs = open.startedAtMs + last.tMs;
    this.kept.push(open);
    if (this.kept.length > this.maxKept) this.kept.shift();
  }

  /** The utterance in progress, or null between utterances. */
  live(): Contour | null {
    return this.open;
  }

  /** Completed utterances, oldest first, capped at `maxKept`. */
  finished(): Contour[] {
    return this.kept;
  }

  clear(): void {
    this.open = null;
    this.kept = [];
    this.lastVoicedAtMs = -Infinity;
  }
}

export interface TrailPoint {
  /** The trail's own clock (see `PitchTrail`), not the host clock. */
  atMs: number;
  chao: number;
}

/**
 * How far past `bridgeMs` the trail's clock jumps when speech resumes after a
 * long silence, so the renderer always leaves a clear hole between phrases.
 */
const RESUME_GAP_EXTRA_MS = 200;

/**
 * A rolling record of every voiced frame — the data behind the Free tab's
 * scrolling line. Unlike `ContourRecorder` it never splits speech into
 * attempts, so a word of any length draws as one line where each syllable
 * lands when it was said.
 *
 * It keeps its own clock, which runs only while you speak (and through a
 * bridged gap of up to `bridgeMs`). In silence the clock stops, so the line
 * stops scrolling and stays on screen to be read. When speech resumes the
 * clock jumps just past `bridgeMs`, leaving a hole between the two phrases.
 */
export class PitchTrail {
  private pts: TrailPoint[] = [];
  private readonly maxAgeMs: number;
  private readonly bridgeMs: number;
  private clock = 0;
  private origin: number | null = null;
  private lastFrameAt: number | null = null;
  private lastVoicedAt = -Infinity;
  /** Every voiced frame of the attempt in progress — not trimmed to the window. */
  private attempt: TrailPoint[] = [];
  private done: TrailPoint[][] = [];

  constructor(maxAgeMs: number, bridgeMs: number) {
    this.maxAgeMs = maxAgeMs;
    this.bridgeMs = bridgeMs;
  }

  push(chao: number, voiced: boolean, nowMs: number): void {
    const dt = this.lastFrameAt === null ? 0 : nowMs - this.lastFrameAt;
    this.lastFrameAt = nowMs;
    const inBridge = nowMs - this.lastVoicedAt <= this.bridgeMs;
    if (voiced) {
      this.clock += inBridge || this.pts.length === 0 ? dt : this.bridgeMs + RESUME_GAP_EXTRA_MS;
      this.origin ??= this.clock;
      const p = { atMs: this.clock, chao };
      this.pts.push(p);
      this.attempt.push(p);
      this.lastVoicedAt = nowMs;
    } else if (inBridge) {
      this.clock += dt;
    } else if (this.attempt.length > 0) {
      // Silence outlasted the bridge: the attempt is over.
      this.done.push(this.attempt);
      this.attempt = [];
    }
    let drop = 0;
    while (drop < this.pts.length && this.clock - this.pts[drop].atMs > this.maxAgeMs) drop++;
    if (drop > 0) this.pts.splice(0, drop);
  }

  points(): readonly TrailPoint[] {
    return this.pts;
  }

  /** The trail's clock now — frozen while silent. */
  clockMs(): number {
    return this.clock;
  }

  /** Clock time of the first voiced frame since the last clear, or null. */
  originMs(): number | null {
    return this.origin;
  }

  /**
   * Attempts that ended since the last call, oldest first. An attempt is one
   * stretch of speech with no silence longer than `bridgeMs`.
   */
  takeFinished(): TrailPoint[][] {
    const out = this.done;
    this.done = [];
    return out;
  }

  clear(): void {
    this.pts = [];
    this.attempt = [];
    this.done = [];
    this.origin = null;
    this.lastVoicedAt = -Infinity;
  }
}
