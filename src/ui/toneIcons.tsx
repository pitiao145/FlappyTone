/**
 * Small presentational icons for the visualiser's tone picker — pure
 * components, no game/audio dependencies. `ToneMarkIcon`'s path data is
 * traced from the reference tone-contour glyphs (not the pinyin diacritic
 * font), so it reads as a tiny corridor shape rather than a typographic mark.
 */
import type { Tone } from "../game/gates.ts";

const TONE_PATHS: Record<Tone, string> = {
  1: "M 14.06,48.99 L 18.03,49.16 L 22.00,49.33 L 25.97,49.47 L 29.95,49.60 L 33.93,49.70 L 37.90,49.77 L 41.89,49.81 L 45.87,49.82 L 49.86,49.78 L 53.85,49.71 L 57.85,49.59 L 61.84,49.43 L 65.85,49.23 L 69.85,48.99 L 73.86,48.70 L 77.88,48.38 L 81.90,48.02 L 85.93,47.62 L 89.96,47.19 L 94.00,46.74 L 98.04,46.26 L 102.10,45.77 L 106.16,45.27 L 105.84,39.77 L 101.75,39.75 L 97.68,39.72 L 93.61,39.69 L 89.56,39.68 L 85.52,39.67 L 81.48,39.68 L 77.46,39.72 L 73.45,39.77 L 69.44,39.85 L 65.45,39.96 L 61.46,40.10 L 57.48,40.26 L 53.50,40.45 L 49.53,40.67 L 45.57,40.92 L 41.60,41.19 L 37.65,41.48 L 33.69,41.79 L 29.74,42.12 L 25.79,42.46 L 21.84,42.80 L 17.89,43.15 L 13.94,43.49 Z",
  2: "M 13.52,42.57 L 15.08,44.06 L 16.62,45.50 L 18.15,46.87 L 19.67,48.19 L 21.17,49.45 L 22.65,50.65 L 24.13,51.78 L 25.59,52.84 L 27.05,53.83 L 28.50,54.76 L 29.95,55.61 L 31.39,56.38 L 32.84,57.08 L 34.28,57.70 L 35.73,58.24 L 37.19,58.69 L 38.65,59.05 L 40.12,59.30 L 41.44,59.45 L 43.80,58.88 L 46.92,57.45 L 50.14,55.84 L 53.39,54.08 L 56.67,52.20 L 59.97,50.19 L 63.28,48.07 L 66.59,45.86 L 69.90,43.56 L 73.21,41.18 L 76.51,38.76 L 79.81,36.28 L 83.10,33.79 L 86.39,31.29 L 89.68,28.80 L 92.98,26.34 L 96.28,23.93 L 99.61,21.60 L 102.95,19.36 L 106.34,17.23 L 105.66,15.73 L 101.79,16.87 L 97.88,18.16 L 93.96,19.59 L 90.06,21.13 L 86.17,22.80 L 82.32,24.57 L 78.52,26.43 L 74.77,28.38 L 71.10,30.39 L 67.50,32.47 L 63.99,34.58 L 60.57,36.72 L 57.25,38.87 L 54.03,41.01 L 50.91,43.13 L 47.89,45.20 L 44.98,47.20 L 42.16,49.11 L 39.40,50.96 L 41.76,50.39 L 40.72,50.45 L 39.78,50.47 L 38.77,50.42 L 37.68,50.31 L 36.53,50.14 L 35.32,49.90 L 34.04,49.60 L 32.70,49.23 L 31.30,48.80 L 29.85,48.31 L 28.34,47.75 L 26.78,47.13 L 25.16,46.45 L 23.50,45.72 L 21.79,44.93 L 20.03,44.08 L 18.23,43.18 L 16.38,42.23 L 14.48,41.23 Z",
  3: "M 13.49,34.49 L 16.11,37.09 L 18.69,39.70 L 21.24,42.32 L 23.76,44.93 L 26.24,47.51 L 28.69,50.05 L 31.12,52.54 L 33.52,54.96 L 35.88,57.30 L 38.22,59.55 L 40.54,61.70 L 42.82,63.72 L 45.08,65.62 L 47.31,67.38 L 49.51,69.00 L 51.70,70.45 L 53.88,71.73 L 56.06,72.83 L 58.03,73.64 L 61.22,73.87 L 63.87,73.27 L 66.84,72.08 L 69.64,70.48 L 72.32,68.55 L 74.89,66.31 L 77.39,63.81 L 79.83,61.06 L 82.21,58.09 L 84.55,54.93 L 86.85,51.59 L 89.12,48.11 L 91.35,44.51 L 93.56,40.81 L 95.74,37.05 L 97.92,33.24 L 100.08,29.43 L 102.26,25.64 L 104.44,21.90 L 106.65,18.22 L 105.35,17.22 L 102.35,20.30 L 99.35,23.49 L 96.37,26.74 L 93.43,30.02 L 90.53,33.31 L 87.68,36.58 L 84.89,39.80 L 82.16,42.93 L 79.52,45.95 L 76.95,48.83 L 74.47,51.53 L 72.08,54.03 L 69.80,56.28 L 67.63,58.25 L 65.58,59.91 L 63.70,61.24 L 62.00,62.21 L 60.52,62.83 L 58.78,63.25 L 61.97,63.48 L 60.37,62.90 L 58.79,62.21 L 57.05,61.32 L 55.14,60.25 L 53.10,59.02 L 50.94,57.63 L 48.65,56.12 L 46.25,54.49 L 43.75,52.76 L 41.15,50.95 L 38.46,49.07 L 35.69,47.13 L 32.84,45.15 L 29.91,43.15 L 26.93,41.14 L 23.89,39.12 L 20.80,37.11 L 17.67,35.13 L 14.51,33.19 Z",
  4: "M 14.62,38.10 L 15.96,36.93 L 17.27,35.83 L 18.57,34.80 L 19.85,33.84 L 21.11,32.96 L 22.34,32.15 L 23.56,31.42 L 24.75,30.77 L 25.91,30.19 L 27.05,29.69 L 28.15,29.27 L 29.22,28.93 L 30.25,28.67 L 31.25,28.48 L 32.21,28.37 L 33.14,28.32 L 34.03,28.35 L 34.90,28.44 L 35.90,28.60 L 33.86,27.94 L 37.42,30.75 L 41.03,33.55 L 44.69,36.32 L 48.41,39.05 L 52.18,41.74 L 56.00,44.35 L 59.87,46.89 L 63.77,49.35 L 67.69,51.71 L 71.63,53.98 L 75.58,56.14 L 79.51,58.20 L 83.43,60.14 L 87.30,61.97 L 91.13,63.68 L 94.89,65.27 L 98.57,66.74 L 102.16,68.09 L 105.63,69.30 L 106.37,67.82 L 103.36,65.76 L 100.30,63.56 L 97.17,61.24 L 93.98,58.82 L 90.72,56.31 L 87.39,53.73 L 83.99,51.11 L 80.52,48.44 L 76.98,45.77 L 73.36,43.09 L 69.68,40.43 L 65.93,37.80 L 62.12,35.21 L 58.24,32.68 L 54.32,30.21 L 50.35,27.81 L 46.35,25.50 L 42.32,23.27 L 38.30,21.14 L 36.26,20.48 L 34.94,20.54 L 33.48,20.71 L 32.05,20.99 L 30.65,21.38 L 29.29,21.87 L 27.96,22.46 L 26.67,23.14 L 25.42,23.90 L 24.19,24.74 L 23.00,25.67 L 21.84,26.66 L 20.71,27.73 L 19.60,28.86 L 18.51,30.07 L 17.45,31.34 L 16.41,32.67 L 15.38,34.06 L 14.37,35.51 L 13.38,37.02 Z",
};

/** Short, plain-English name for each tone's shape — matches the icon set's own filenames. */
export const TONE_SHORT_LABEL: Record<Tone, string> = {
  1: "flat",
  2: "rising",
  3: "dip",
  4: "falling",
};

export function ToneMarkIcon({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden="true">
      <path d={TONE_PATHS[tone]} fill="currentColor" />
    </svg>
  );
}

/** All four tone marks in a 2x2 grid — "browsing every tone", as a glyph. */
export function TonesGridIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 288 228" className={className} aria-hidden="true">
      <g transform="translate(16,16)">
        <path d={TONE_PATHS[1]} fill="currentColor" />
      </g>
      <g transform="translate(152,16)">
        <path d={TONE_PATHS[2]} fill="currentColor" />
      </g>
      <g transform="translate(16,122)">
        <path d={TONE_PATHS[3]} fill="currentColor" />
      </g>
      <g transform="translate(152,122)">
        <path d={TONE_PATHS[4]} fill="currentColor" />
      </g>
    </svg>
  );
}

export function FilterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : undefined }}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
