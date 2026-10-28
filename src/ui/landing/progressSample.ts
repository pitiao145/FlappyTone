import type { Tone } from "../../game/gates.ts";
import { AVERAGED_TONE_SHAPE } from "../../game/toneAverages.ts";

/**
 * The landing page's Progress section: a snapshot of the founder's own account,
 * taken from the live app on 27 Oct 2026. Static on purpose: the page never
 * reads the database, and these numbers do not update.
 */

/** Jane's natural-speech tone 3 average (61 chao values), read from the game's own table. */
export const NATIVE_T3: number[] = AVERAGED_TONE_SHAPE.natural[3];

/**
 * PLACEHOLDER, not real data. The founder's `player_tone_shapes` rows for key
 * "3" have not been exported yet (brief 22). These two curves are Jane's
 * shape, flattened and shifted, so the animation can be built and judged.
 * Replace both arrays with the real 61-point lines and set
 * `T3_IS_PLACEHOLDER` to false; the section then shows its "real data" label.
 */
export const T3_IS_PLACEHOLDER = true;

const mean = NATIVE_T3.reduce((a, b) => a + b, 0) / NATIVE_T3.length;
export const T3_EARLIER: number[] = NATIVE_T3.map(
  (v, i) => mean + (v - mean) * 0.4 + 0.45 * Math.sin((i / 60) * Math.PI * 1.6) - 0.15,
);
export const T3_NOW: number[] = NATIVE_T3.map((v, i) => mean + (v - mean) * 0.82 - 0.12 + 0.1 * Math.sin(i / 5));

/** Accuracy over every run, in percent. */
export const ACCURACY_ALL_TIME: { tone: Tone; pct: number }[] = [
  { tone: 1, pct: 81 },
  { tone: 2, pct: 58 },
  { tone: 3, pct: 63 },
  { tone: 4, pct: 65 },
];

/** Tone pairs over every run: the worst, a middle one and the best. */
export const PAIR_ACCURACY_ALL_TIME: { tones: [Tone, Tone]; pct: number }[] = [
  { tones: [4, 1], pct: 15 },
  { tones: [3, 3], pct: 48 },
  { tones: [2, 1], pct: 75 },
];

/** Tone 1 accuracy by day, October 2026. */
export const T1_PROGRESS: { day: number; label: string; pct: number }[] = [
  { day: 1, label: "1 Oct", pct: 65 },
  { day: 9, label: "9 Oct", pct: 82 },
  { day: 11, label: "11 Oct", pct: 71 },
  { day: 13, label: "13 Oct", pct: 78 },
  { day: 15, label: "15 Oct", pct: 86 },
  { day: 20, label: "20 Oct", pct: 84 },
  { day: 26, label: "26 Oct", pct: 96 },
];
