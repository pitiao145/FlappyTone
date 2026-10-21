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
  nihao33: {
    polyline: [
      [0, 2.613],
      [0.2823, 2.496],
      [0.3321, 2.789],
      [0.4336, 4.3],
      [0.5498, 2.49],
      [0.7141, 1.034],
      [1, 1.034],
    ],
    onsetS: 0.232,
    durationS: 1.2847,
    clipS: 1.6447,
  },
};


/**
 * The same words' SPOKEN (natural-style) recordings, for the Standard vs
 * Spoken comparison. Copied from `word_clips` (style 'natural', default
 * speaker) on 20 Oct 2026; the bundled fallback is textbook-only, so this is
 * not checked against it. 對不起 has no spoken take yet.
 */
export const SAY_CLIPS_SPOKEN: Record<string, ExampleClip> = {
  bukeqi444: {
    polyline: [
      [0, 3.438],
      [0.1538, 3.419],
      [0.1839, 3.439],
      [0.2709, 3.464],
      [0.3311, 4.165],
      [0.4247, 4.045],
      [0.6053, 4.322],
      [0.8128, 4.024],
      [1, 3.069],
    ],
    onsetS: 0.232,
    durationS: 0.7087,
    clipS: 1.0687,
  },
  meiguanxi210: {
    polyline: [
      [0, 2.58],
      [0.162, 2.747],
      [0.3496, 4.061],
      [0.4884, 4.153],
      [0.8586, 4.067],
      [0.8818, 4.182],
      [1, 4.205],
    ],
    onsetS: 0.232,
    durationS: 0.922,
    clipS: 1.282,
  },
  qing3: {
    polyline: [
      [0, 3.821],
      [0.5418, 1.913],
      [0.7827, 2.675],
      [1, 3.885],
    ],
    onsetS: 0.232,
    durationS: 0.7087,
    clipS: 1.0687,
  },
  xiexie40: {
    polyline: [
      [0, 3.709],
      [0.22, 3.671],
      [0.5215, 2.822],
      [0.7752, 1.809],
      [1, 1.809],
    ],
    onsetS: 0.232,
    durationS: 0.4954,
    clipS: 0.8553,
  },
  yuan2: {
    polyline: [
      [0, 3.374],
      [0.4816, 2.247],
      [1, 4.262],
    ],
    onsetS: 0.211,
    durationS: 0.7087,
    clipS: 1.0473,
  },
  zaijian44: {
    polyline: [
      [0, 3.618],
      [0.2775, 3.558],
      [0.3118, 3.554],
      [0.5134, 3.736],
      [0.7871, 1.771],
      [1, 1.771],
    ],
    onsetS: 0.232,
    durationS: 0.6234,
    clipS: 0.8767,
  },
};
