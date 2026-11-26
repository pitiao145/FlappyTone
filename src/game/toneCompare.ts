/**
 * The weekly compare view's maths (brief 55). Pure: no React, no canvas.
 *
 * Distance to Jane = the mean absolute gap, in Chao units, between the
 * player's average line and Jane's on the shared 61-point grid
 * (`playerShape.ts`). "18% closer" = (last − this) ÷ last.
 */
import { SAMPLE_TONE_SHAPES } from "../ui/sampleToneShapes.ts";

/** A change smaller than this (in %) reads as "about as close". */
export const COMPARE_MIN_CHANGE = 5;

export function shapeDistance(line: number[] | null, jane: number[] | null): number | null {
  if (!line || !jane || line.length !== jane.length || line.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < line.length; i++) sum += Math.abs(line[i] - jane[i]);
  return sum / line.length;
}

/** Percent closer to Jane than the earlier week (negative = further); null without both. */
export function closerPct(thisDist: number | null, lastDist: number | null): number | null {
  if (thisDist === null || lastDist === null || lastDist <= 0) return null;
  return Math.round(((lastDist - thisDist) / lastDist) * 100);
}

/** The caption over the chart. `than` = "last week" or "the week before". */
export function compareCaption(than: string, thisDist: number | null, lastDist: number | null): string {
  if (thisDist === null) return "No attempts this week yet: play a run to fill it in";
  const pct = closerPct(thisDist, lastDist);
  if (pct === null) return "Your shape this week, over Jane's";
  if (pct >= COMPARE_MIN_CHANGE) return `${pct}% closer to Jane than ${than}`;
  if (pct <= -COMPARE_MIN_CHANGE) return `A little further from Jane than ${than}: keep going`;
  return `About as close to Jane as ${than}`;
}

/**
 * The mock-up for a free player: a real player's snapshot as "this week"
 * (`SAMPLE_TONE_SHAPES`; tone 1 and pairs have none, so a gentle offset from Jane), and
 * a "last week" 22% further from Jane, so the caption reads like a real one.
 */
export function mockWeekLines(
  jane: number[] | null,
  key: string,
): { thisWeek: number[] | null; lastWeek: number[] | null; thisCount: number } {
  if (!jane) return { thisWeek: null, lastWeek: null, thisCount: 0 };
  const sample = SAMPLE_TONE_SHAPES[key]?.line;
  const thisWeek =
    sample && sample.length === jane.length
      ? sample
      : jane.map((v, i) => v - 0.35 + 0.25 * Math.sin((i / jane.length) * Math.PI * 2));
  const lastWeek = thisWeek.map((v, i) => jane[i] + (v - jane[i]) * 1.28);
  return { thisWeek, lastWeek, thisCount: 0 };
}
