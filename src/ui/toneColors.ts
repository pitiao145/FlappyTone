import type { Tone } from "../game/gates.ts";

/**
 * Per-tone stroke/fill colours for the Progress charts (handoff values; also
 * `dev` WordGates `TONE_COLOR`). Kept in its own tiny module — free of the
 * Chart.js import — so the bar chart and tone pills can use them without
 * pulling Chart.js into the main bundle. Only `AccuracyProgressChart.tsx`
 * (lazy-loaded) imports Chart.js.
 *
 * `0` (neutral) shows up only in a two-syllable pairs gate's per-syllable HUD
 * label (`Game.tsx`) — a neutral grey, distinct from every real tone's colour.
 */
export const TONE_LINE_COLOR: Record<Tone | 0, string> = {
  0: "#8a8a8a",
  1: "#3b6fa0",
  2: "#1c7a63", // --accent
  3: "#c98a3c", // --beak
  4: "#a3341f", // --danger
};
