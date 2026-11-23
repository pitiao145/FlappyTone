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
      [0, 5],
      [1, 5],
    ],
    onsetS: 0.232,
    durationS: 1.6043,
    clipS: 1.8367,
  },
  shu1: {
    polyline: [
      [0, 5],
      [1, 5],
    ],
    onsetS: 0.232,
    durationS: 0.9434,
    clipS: 1.3033,
  },
  hua1: {
    polyline: [
      [0, 4.466],
      [1, 4.466],
    ],
    onsetS: 0.232,
    durationS: 1.242,
    clipS: 1.4953,
  },
  ren2: {
    polyline: [
      [0, 2.179],
      [0.3622, 1.823],
      [0.6882, 2.932],
      [0.9055, 4.868],
      [1, 5],
    ],
    onsetS: 0.126,
    durationS: 1.178,
    clipS: 1.41,
  },
  qian2: {
    polyline: [
      [0, 2.935],
      [0.3584, 2.037],
      [0.677, 2.952],
      [0.916, 4.733],
      [1, 5],
    ],
    onsetS: 0.254,
    durationS: 1.0714,
    clipS: 1.4527,
  },
  xue2: {
    polyline: [
      [0, 2.25],
      [0.2753, 1.681],
      [0.6353, 2.561],
      [0.9106, 4.24],
      [1, 4.537],
    ],
    onsetS: 0.232,
    durationS: 1.0074,
    clipS: 1.3887,
  },
  ma3b: {
    polyline: [
      [0, 2.475],
      [0.394, 1],
      [0.7051, 1.219],
      [0.9332, 3.799],
      [1, 3.883],
    ],
    onsetS: 0.232,
    durationS: 1.0287,
    clipS: 1.3673,
  },
  hao3: {
    polyline: [
      [0, 2.801],
      [0.5185, 1.077],
      [0.7673, 2.362],
      [0.954, 4.827],
      [1, 4.827],
    ],
    onsetS: 0.232,
    durationS: 1.0287,
    clipS: 1.346,
  },
  ni3: {
    polyline: [
      [0, 2.461],
      [0.5795, 1.013],
      [0.7968, 2.676],
      [0.9236, 3.943],
      [1, 4.214],
    ],
    onsetS: 0.211,
    durationS: 1.178,
    clipS: 1.4953,
  },
  ma4b: {
    polyline: [
      [0, 3.296],
      [0.2173, 5],
      [0.9001, 1.428],
      [1, 1.208],
    ],
    onsetS: 0.232,
    durationS: 0.6874,
    clipS: 1.0047,
  },
  da4: {
    polyline: [
      [0, 5],
      [0.1102, 5],
      [0.8817, 1.64],
      [1, 1.46],
    ],
    onsetS: 0.232,
    durationS: 0.5807,
    clipS: 0.898,
  },
  kuai4: {
    polyline: [
      [0, 5],
      [0.0806, 5],
      [0.8329, 1.651],
      [1, 1.426],
    ],
    onsetS: 0.211,
    durationS: 0.794,
    clipS: 1.026,
  },
  shenme20: {
    polyline: [
      [0, 2.474],
      [0.1281, 2.365],
      [0.2242, 1.843],
      [0.4519, 2.261],
      [0.484, 2.961],
      [0.5125, 2.961],
      [0.6086, 4.147],
      [0.7367, 4.971],
      [1, 4.664],
    ],
    onsetS: 0.232,
    durationS: 0.666,
    clipS: 1.0687,
  },
  nimen30: {
    polyline: [
      [0, 2.344],
      [0.0996, 2.369],
      [0.1991, 3.037],
      [0.4779, 1.659],
      [0.6195, 1.247],
      [0.6394, 1.256],
      [0.7965, 2.031],
      [0.8562, 2.98],
      [0.916, 4.555],
      [1, 4.555],
    ],
    onsetS: 0.232,
    durationS: 1.0714,
    clipS: 1.41,
  },
  baozi10: {
    polyline: [
      [0, 4.705],
      [0.1213, 5],
      [0.6577, 5],
      [0.9003, 2.869],
      [1, 2.697],
    ],
    onsetS: 0.232,
    durationS: 0.8794,
    clipS: 1.2393,
  },
  keyi33: {
    polyline: [
      [0, 2.905],
      [0.1898, 2.295],
      [0.3954, 4.626],
      [0.4288, 2.779],
      [0.4446, 1.922],
      [0.5062, 2.712],
      [0.6485, 1.305],
      [0.7751, 1.024],
      [0.87, 2.398],
      [1, 3.693],
    ],
    onsetS: 0.254,
    durationS: 1.3487,
    clipS: 1.7087,
  },
  xihuan31: {
    polyline: [
      [0, 3.198],
      [0.0779, 2.912],
      [0.2647, 1.327],
      [0.4066, 1.327],
      [0.4221, 1.016],
      [0.4516, 1.016],
      [0.5139, 3.897],
      [1, 3.897],
    ],
    onsetS: 0.232,
    durationS: 1.37,
    clipS: 1.73,
  },
  meiguo32: {
    polyline: [
      [0, 1.924],
      [0.0716, 1.955],
      [0.1288, 2.389],
      [0.3998, 1],
      [0.5143, 1.654],
      [0.7871, 1.619],
      [0.8873, 2.464],
      [0.9445, 3.796],
      [1, 4.103],
    ],
    onsetS: 0.257,
    durationS: 1.6225,
    clipS: 2.0057,
  },
  yixia24: {
    polyline: [
      [0, 2.784],
      [0.2364, 2.123],
      [0.3377, 2.969],
      [0.3902, 3.876],
      [0.5422, 5],
      [0.6755, 4.908],
      [0.743, 2.933],
      [0.7768, 1],
      [1, 1],
    ],
    onsetS: 0.232,
    durationS: 1.2634,
    clipS: 1.602,
  },
  yiqi13: {
    polyline: [
      [0, 5],
      [0.1797, 5],
      [0.2614, 2.753],
      [0.3285, 1.301],
      [0.5082, 2.217],
      [0.637, 1.009],
      [0.8494, 1],
      [0.8657, 1.683],
      [0.9311, 2.82],
      [1, 3.414],
    ],
    onsetS: 0.232,
    durationS: 1.306,
    clipS: 1.666,
  },
  pengyou23: {
    polyline: [
      [0, 2.732],
      [0.2052, 2.902],
      [0.2639, 3.6],
      [0.3078, 4.924],
      [0.4267, 4.924],
      [0.4414, 5],
      [0.4691, 4.924],
      [0.5277, 2.689],
      [0.689, 1],
      [0.8649, 1.622],
      [1, 4.278],
    ],
    onsetS: 0.318,
    durationS: 1.4554,
    clipS: 1.9007,
  },
  bucuo44: {
    polyline: [
      [0, 2.203],
      [0.2354, 1.993],
      [0.3441, 2.96],
      [0.4004, 3.938],
      [0.6358, 5],
      [0.7787, 4.849],
      [0.8693, 2.006],
      [1, 2.006],
    ],
    onsetS: 0.232,
    durationS: 1.178,
    clipS: 1.4527,
  },
};
