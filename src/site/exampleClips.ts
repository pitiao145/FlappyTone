/**
 * The measured clip data for /chinese-tones example words: the same polyline,
 * onset, tone window and file length the game flies (default speaker,
 * textbook). Copied from src/data/wordsFallback.json so the page does not
 * ship the whole catalog; exampleClips.test.ts fails if they drift.
 */

import type { Polyline } from "../game/tuning.ts";

export interface ExampleClip {
  /** chao over normalised tone time, [t, chao]. */
  polyline: Polyline;
  /** File start → tone start, seconds. */
  onsetS: number;
  /** The tone window, seconds. */
  durationS: number;
  /** Whole file, seconds. */
  clipS: number;
}

export const EXAMPLE_CLIPS: Record<string, ExampleClip> = {
  ma1b: {
    polyline: [
      [0, 4.681],
      [1, 4.681],
    ],
    onsetS: 0.232,
    durationS: 1.4767,
    clipS: 1.8367,
  },
  shu1: {
    polyline: [
      [0, 4.856],
      [1, 4.856],
    ],
    onsetS: 0.232,
    durationS: 0.9434,
    clipS: 1.3033,
  },
  hua1: {
    polyline: [
      [0, 4.458],
      [1, 4.458],
    ],
    onsetS: 0.232,
    durationS: 1.1354,
    clipS: 1.4953,
  },
  ren2: {
    polyline: [
      [0, 2.571],
      [0.3251, 2.178],
      [1, 5],
    ],
    onsetS: 0.232,
    durationS: 1.05,
    clipS: 1.41,
  },
  qian2: {
    polyline: [
      [0, 3.415],
      [0.3982, 2.402],
      [1, 5],
    ],
    onsetS: 0.254,
    durationS: 1.0714,
    clipS: 1.4527,
  },
  xue2: {
    polyline: [
      [0, 2.656],
      [0.2696, 2.009],
      [1, 4.773],
    ],
    onsetS: 0.232,
    durationS: 1.0287,
    clipS: 1.3887,
  },
  ma3b: {
    polyline: [
      [0, 3.008],
      [0.7412, 1.705],
      [0.8683, 2.617],
      [1, 4.181],
    ],
    onsetS: 0.232,
    durationS: 1.0074,
    clipS: 1.3673,
  },
  hao3: {
    polyline: [
      [0, 3.445],
      [0.6274, 1.496],
      [0.8222, 2.834],
      [1, 4.541],
    ],
    onsetS: 0.232,
    durationS: 0.986,
    clipS: 1.346,
  },
  ni3: {
    polyline: [
      [0, 2.988],
      [0.6389, 1.659],
      [0.8268, 3.256],
      [1, 4.694],
    ],
    onsetS: 0.232,
    durationS: 1.1354,
    clipS: 1.4953,
  },
  ma4b: {
    polyline: [
      [0, 3.087],
      [0.3971, 4.994],
      [1, 1.724],
    ],
    onsetS: 0.232,
    durationS: 0.6447,
    clipS: 1.0047,
  },
  da4: {
    polyline: [
      [0, 4.188],
      [0.1983, 4.536],
      [1, 1.82],
    ],
    onsetS: 0.232,
    durationS: 0.538,
    clipS: 0.898,
  },
  kuai4: {
    polyline: [
      [0, 4.246],
      [0.1505, 4.714],
      [1, 1.218],
    ],
    onsetS: 0.211,
    durationS: 0.7087,
    clipS: 1.026,
  },
  shenme20: {
    polyline: [
      [0, 2.682],
      [0.1281, 2.581],
      [0.2242, 2.132],
      [0.4519, 2.313],
      [0.484, 2.85],
      [0.6406, 4.003],
      [0.7687, 4.604],
      [1, 4.604],
    ],
    onsetS: 0.232,
    durationS: 0.666,
    clipS: 1.0687,
  },
  nimen30: {
    polyline: [
      [0, 3.357],
      [0.1219, 3.475],
      [0.2235, 4.321],
      [0.6321, 1.803],
      [0.6524, 1.76],
      [0.833, 2.895],
      [0.9143, 5],
      [1, 5],
    ],
    onsetS: 0.232,
    durationS: 1.05,
    clipS: 1.41,
  },
  baozi10: {
    polyline: [
      [0, 4.924],
      [0.6577, 5],
      [0.9003, 4.209],
      [1, 4.122],
    ],
    onsetS: 0.232,
    durationS: 0.8794,
    clipS: 1.2393,
  },
};
