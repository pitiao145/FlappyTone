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
      [0, 5],
      [0.3407, 5],
      [0.4827, 2.887],
      [0.6278, 1.94],
      [0.8549, 2.395],
      [1, 1.727],
    ],
    onsetS: 0.232,
    durationS: 0.7514,
    clipS: 1.09,
  },
  zaijian44: {
    polyline: [
      [0, 5],
      [0.1351, 4.903],
      [0.2702, 1.889],
      [0.3546, 1.019],
      [0.3733, 1.889],
      [0.5253, 4.563],
      [0.6079, 4.576],
      [0.8105, 1.051],
      [1, 1.548],
    ],
    onsetS: 0.232,
    durationS: 1.2634,
    clipS: 1.5167,
  },
  qing3: {
    polyline: [
      [0, 3.523],
      [0.4871, 1.527],
      [0.7412, 3.407],
      [0.8471, 4.795],
      [1, 5],
    ],
    onsetS: 0.232,
    durationS: 1.0074,
    clipS: 1.3247,
  },
  duibuqi403: {
    polyline: [
      [0, 5],
      [0.0674, 4.851],
      [0.1752, 2.473],
      [0.2036, 2.473],
      [0.2844, 2.097],
      [0.3368, 4.134],
      [0.3907, 3.302],
      [0.4192, 2.378],
      [0.5674, 2.234],
      [0.6602, 1],
      [0.8354, 1],
      [0.9162, 2.426],
      [1, 3.235],
    ],
    onsetS: 0.232,
    durationS: 1.5834,
    clipS: 1.922,
  },
  bukeqi444: {
    polyline: [
      [0, 2.466],
      [0.101, 2.149],
      [0.1515, 2.248],
      [0.2412, 4.3],
      [0.4053, 2.751],
      [0.4166, 2.751],
      [0.4418, 5],
      [0.5049, 5],
      [0.5428, 3.757],
      [0.6073, 2.272],
      [0.784, 5],
      [0.8584, 5],
      [0.9089, 3.284],
      [0.9341, 1.888],
      [1, 1.888],
    ],
    onsetS: 0.232,
    durationS: 1.69,
    clipS: 2.0073,
  },
  meiguanxi210: {
    polyline: [
      [0, 2.355],
      [0.26, 2.148],
      [0.3034, 2.562],
      [0.4061, 4.474],
      [0.4928, 5],
      [0.7384, 5],
      [0.9262, 3.313],
      [1, 2.527],
    ],
    onsetS: 0.232,
    durationS: 1.4767,
    clipS: 1.8367,
  },
  yuan2: {
    polyline: [
      [0, 2.142],
      [0.4182, 1.429],
      [0.7168, 2.602],
      [0.8961, 4.879],
      [1, 5],
    ],
    onsetS: 0.232,
    durationS: 1.0714,
    clipS: 1.41,
  },
  nihao33: {
    polyline: [
      [0, 2.368],
      [0.2325, 2.177],
      [0.2989, 2.4],
      [0.4336, 4.749],
      [0.5498, 2.23],
      [0.6642, 1],
      [1, 1],
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
  nihao33: {
    polyline: [
      [0, 3.223],
      [0.2396, 3.226],
      [0.5476, 3.963],
      [0.7224, 1.993],
    ],
    onsetS: 0.232,
    durationS: 0.6234,
    clipS: 0.9833,
  },
  duibuqi403: {
    polyline: [
      [0, 3.784],
      [0.1586, 3.77],
      [0.2819, 3.454],
      [0.3215, 3.131],
      [0.3965, 3.125],
      [0.4405, 3.48],
      [0.7577, 2.766],
      [0.8723, 2.307],
      [1, 2.307],
    ],
    onsetS: 0.232,
    durationS: 0.538,
    clipS: 0.898,
  },
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
