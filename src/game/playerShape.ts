/**
 * The player's own average tone shape (spec B,
 * `docs/SPECS/flappytone-SPEC-player-tone-average.md`). Pure logic: no Web
 * Audio, no React, no Supabase.
 *
 * Each heard attempt becomes one line on the same 61-point grid Jane's
 * averages use (`averagePolyline`, `SAMPLES + 1`), so the two are drawn by the
 * same chart code. The line is prepared exactly the way `toneAccuracy` sees
 * it: the utterance `longestUtterance` cut, onset trimmed, time-normalised.
 *
 * Lines are kept as SUMS + a count, per key, per day: the server adds a run's
 * sums into the day's row (`api/shapes.ts`), and any average — up to a day,
 * or over a period — is Σ sum ÷ Σ count over the rows in range.
 *
 * Keys match `tone_accuracy_stats`' targets: "1".."4" for a single tone, a
 * `toneComboKey` ("3-2") for a pair. Neutral combos have no key (no reference
 * to compare against, the same rule as tone accuracy).
 */

import type { ContourPoint } from "./contours.ts";
import type { Tone } from "./gates.ts";
import { resample, trimOnset } from "./toneClassifier.ts";
import { SAMPLES } from "./toneAverage.ts";
import { tuning } from "./tuning.ts";

export const SHAPE_POINTS = SAMPLES + 1;
/** A line with fewer attempts behind it is not drawn (spec B §5). */
export const MIN_ATTEMPTS_TO_SHOW = 5;
/** The same chao bounds api/shapes.ts enforces per value. */
const CHAO_MIN = 0.5;
const CHAO_MAX = 5.5;

/** The stored key for a gate's tones, or null when it is never stored. */
export function shapeKey(tones: Tone[]): string | null {
  if (tones.length === 0 || tones.length > 2) return null;
  if (tones.some((t) => t < 1 || t > 4)) return null;
  return tones.join("-");
}

/** One attempt as a 61-point line, or null when too short to have a shape. */
export function shapeOfUtterance(utterance: ContourPoint[]): number[] | null {
  if (utterance.length < 2) return null;
  const trimmed = trimOnset(utterance, tuning().toneClassifierOnsetTrimFraction);
  return resample(trimmed, SHAPE_POINTS).map((v) => Math.min(CHAO_MAX, Math.max(CHAO_MIN, v)));
}

export interface ShapeBucket {
  key: string;
  sum: number[];
  count: number;
}

/** Sums lines per key between two POSTs — one run, or one visualiser session. */
export class ShapeAccumulator {
  private buckets = new Map<string, ShapeBucket>();

  /** Adds one attempt. Returns false when it was not stored (no key, no shape). */
  add(tones: Tone[], utterance: ContourPoint[]): boolean {
    const key = shapeKey(tones);
    if (!key) return false;
    const line = shapeOfUtterance(utterance);
    if (!line) return false;
    let b = this.buckets.get(key);
    if (!b) {
      b = { key, sum: new Array<number>(SHAPE_POINTS).fill(0), count: 0 };
      this.buckets.set(key, b);
    }
    for (let i = 0; i < SHAPE_POINTS; i++) b.sum[i] += line[i];
    b.count++;
    return true;
  }

  get size(): number {
    return this.buckets.size;
  }

  /** Everything summed so far, and empties the accumulator. */
  drain(): ShapeBucket[] {
    const out = [...this.buckets.values()];
    this.buckets.clear();
    return out;
  }
}

/** A stored row as read back (`player_tone_shapes`). */
export interface ShapeRow {
  key: string;
  day: string; // YYYY-MM-DD
  sum: number[];
  count: number;
}

export interface AverageShape {
  line: number[];
  count: number;
}

/**
 * The average for `key` over rows with `from <= day <= to` (inclusive, either
 * bound optional). Null when no attempt falls in range. ISO dates compare
 * correctly as strings.
 */
export function averageInPeriod(
  rows: ShapeRow[],
  key: string,
  from: string | null,
  to: string | null,
): AverageShape | null {
  const sum = new Array<number>(SHAPE_POINTS).fill(0);
  let count = 0;
  for (const r of rows) {
    if (r.key !== key || r.sum.length !== SHAPE_POINTS) continue;
    if (from !== null && r.day < from) continue;
    if (to !== null && r.day > to) continue;
    for (let i = 0; i < SHAPE_POINTS; i++) sum[i] += r.sum[i];
    count += r.count;
  }
  if (count === 0) return null;
  return { line: sum.map((s) => s / count), count };
}

/** The average up to and including `day`. */
export function averageUpTo(rows: ShapeRow[], key: string, day: string): AverageShape | null {
  return averageInPeriod(rows, key, null, day);
}

/** Every key that has at least one row, tones first, then combos. */
export function keysWithData(rows: ShapeRow[]): string[] {
  return [...new Set(rows.map((r) => r.key))].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/** The player's local date as YYYY-MM-DD — the day api/shapes.ts buckets by. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** `localDay` shifted back by whole months (clamped to the month's end). */
export function monthsAgo(months: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(now.getDate(), lastDay));
  return localDay(d);
}
