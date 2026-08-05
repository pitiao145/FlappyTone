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
  private readonly mergeGapMs: number;
  private readonly minMs: number;
  private readonly maxKept: number;

  private open: Contour | null = null;
  private lastVoicedAtMs = -Infinity;
  private kept: Contour[] = [];

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
