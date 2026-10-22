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
  keyi33: {
    polyline: [
      [0, 3.148],
      [0.2089, 2.581],
      [0.3697, 4.327],
      [0.4357, 4.327],
      [0.4518, 4.369],
      [0.5143, 2.988],
      [0.7393, 1.355],
      [1, 3.332],
    ],
    onsetS: 0.254,
    durationS: 1.3274,
    clipS: 1.7087,
  },
  xihuan31: {
    polyline: [
      [0, 3.341],
      [0.0779, 3.215],
      [0.2803, 1.72],
      [0.4066, 1.72],
      [0.4221, 1.443],
      [0.4983, 2.881],
      [0.5294, 3.846],
      [1, 3.846],
    ],
    onsetS: 0.232,
    durationS: 1.37,
    clipS: 1.73,
  },
  meiguo32: {
    polyline: [
      [0, 2.447],
      [0.0859, 2.466],
      [0.1431, 2.879],
      [0.3998, 1.559],
      [0.5143, 2.185],
      [0.7871, 2.078],
      [0.873, 2.66],
      [1, 4.084],
    ],
    onsetS: 0.257,
    durationS: 1.6225,
    clipS: 2.0057,
  },
  yixia24: {
    polyline: [
      [0, 2.844],
      [0.1546, 2.36],
      [0.2576, 2.309],
      [0.3969, 3.422],
      [0.5515, 4.865],
      [0.6699, 4.559],
      [0.8073, 2.328],
      [1, 2.328],
    ],
    onsetS: 0.232,
    durationS: 1.242,
    clipS: 1.602,
  },
  yiqi13: {
    polyline: [
      [0, 4.528],
      [0.147, 4.912],
      [0.2123, 4.388],
      [0.3121, 2.384],
      [0.5082, 2.535],
      [0.8331, 1],
      [0.8821, 2.16],
      [1, 3.272],
    ],
    onsetS: 0.232,
    durationS: 1.306,
    clipS: 1.666,
  },
  pengyou23: {
    polyline: [
      [0, 2.761],
      [0.2345, 2.987],
      [0.3518, 4.853],
      [0.4267, 4.853],
      [0.4414, 5],
      [0.7036, 1.189],
      [0.8355, 1.389],
      [1, 3.579],
    ],
    onsetS: 0.318,
    durationS: 1.4554,
    clipS: 1.9007,
  },
  bucuo44: {
    polyline: [
      [0, 2.106],
      [0.2733, 1.924],
      [0.4317, 3.19],
      [0.6855, 4.951],
      [0.82, 4.6],
      [0.9176, 2.832],
      [1, 1.935],
    ],
    onsetS: 0.232,
    durationS: 1.0927,
    clipS: 1.4527,
  },
};
