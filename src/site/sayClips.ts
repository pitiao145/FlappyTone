/**
 * The measured clip data for the /say/* word pages: the same polyline, onset,
 * tone window and file length the game flies (default speaker, textbook).
 * Copied from src/data/wordsFallback.json so a page does not ship the whole
 * catalog; sayWords.test.ts fails if they drift.
 */

import type { ExampleClip } from "./exampleClips.ts";

export const SAY_CLIPS: Record<string, ExampleClip> = {
  xiexie40: {
    polyline: [
      [0, 4.862],
      [0.2839, 4.58],
      [0.5679, 1.816],
      [0.6278, 1.816],
      [0.8549, 1.874],
      [1, 1.445],
    ],
    onsetS: 0.232,
    durationS: 0.7514,
    clipS: 1.09,
  },
  zaijian44: {
    polyline: [
      [0, 4.576],
      [0.1291, 4.48],
      [0.3135, 1.835],
      [0.3893, 1.128],
      [0.5738, 3.864],
      [0.6824, 3.865],
      [0.83, 1.842],
      [1, 1.842],
    ],
    onsetS: 0.232,
    durationS: 1.1567,
    clipS: 1.5167,
  },
  qing3: {
    polyline: [
      [0, 4.269],
      [0.5086, 1.72],
      [0.7519, 3.522],
      [1, 5],
    ],
    onsetS: 0.232,
    durationS: 0.9647,
    clipS: 1.3247,
  },
  duibuqi403: {
    polyline: [
      [0, 5],
      [0.0819, 4.864],
      [0.1366, 4.105],
      [0.1927, 2.978],
      [0.2883, 4.662],
      [0.3414, 4.602],
      [0.4097, 3.706],
      [0.4249, 3.309],
      [0.5751, 2.76],
      [0.6965, 1.405],
      [0.8058, 1.184],
      [1, 3.256],
    ],
    onsetS: 0.232,
    durationS: 1.562,
    clipS: 1.922,
  },
  bukeqi444: {
    polyline: [
      [0, 3.028],
      [0.1554, 2.838],
      [0.2475, 3.936],
      [0.4158, 3.212],
      [0.4662, 4.939],
      [0.4792, 5],
      [0.623, 2.979],
      [0.8043, 4.81],
      [0.8936, 4.454],
      [0.9583, 3.015],
      [1, 3.015],
    ],
    onsetS: 0.232,
    durationS: 1.6474,
    clipS: 2.0073,
  },
  meiguanxi210: {
    polyline: [
      [0, 2.14],
      [0.26, 1.841],
      [0.3178, 2.366],
      [0.4061, 4.019],
      [0.4928, 4.893],
      [0.5923, 4.677],
      [0.7384, 5],
      [0.9262, 3.121],
      [1, 2.576],
    ],
    onsetS: 0.232,
    durationS: 1.4767,
    clipS: 1.8367,
  },
  yuan2: {
    polyline: [
      [0, 2.219],
      [0.4355, 1.823],
      [1, 5],
    ],
    onsetS: 0.254,
    durationS: 1.0287,
    clipS: 1.41,
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
};
