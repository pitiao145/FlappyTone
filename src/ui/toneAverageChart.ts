import type { Tone } from "../game/gates.ts";
import type { Word } from "../game/words.ts";
import { rgba } from "../render/palette.ts";
import { chaoToY } from "../render/scene.ts";

/**
 * Draws a tone's measured clips (faint) and their averaged polyline (bold)
 * to a canvas. Shared by the dev Lab (`src/dev/ToneAverages.tsx`) and the
 * landing page's "how it works" cards — one measurement, one draw routine,
 * so the two never drift into showing different curves for the same tone.
 */

const SAMPLES = 60;
const TOP = 5.5;
const BOTTOM = 0.5;

// Saturated enough to hold ~4.5:1 contrast against the paper card background
// (`--canvas-backdrop`) at the bold-line alpha below. The old pastel set was
// tuned for the near-black card this sat on before the reskin — unreadable
// once the card went light.
export const TONE_AVERAGE_COLOR: Record<Tone, string> = {
  1: "rgba(55, 100, 180,",
  2: "rgba(35, 130, 90,",
  3: "rgba(150, 100, 25,",
  4: "rgba(165, 65, 55,",
};

/** Piecewise-linear read of a raw polyline at t in [0,1]. */
export function chaoAt(polyline: Word["polyline"], t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < polyline.length - 1; i++) {
    const [t0, c0] = polyline[i];
    const [t1, c1] = polyline[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const frac = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      return c0 + frac * (c1 - c0);
    }
  }
  return polyline[polyline.length - 1][1];
}

/** Resamples every word's polyline onto a common t grid, then means per-t. */
export function averagePolyline(words: Word[]): number[] {
  const sums = new Array<number>(SAMPLES + 1).fill(0);
  for (const w of words) {
    for (let i = 0; i <= SAMPLES; i++) {
      sums[i] += chaoAt(w.polyline, i / SAMPLES);
    }
  }
  return sums.map((s) => s / words.length);
}

export function drawToneAverageChart(
  canvas: HTMLCanvasElement,
  words: Word[],
  tone: Tone,
  width: number,
  height: number,
  /**
   * Card default (false): chao 5.5–0.5 filling the whole canvas — deliberately
   * more zoomed-in than the game so a small "how it works" card still reads.
   * `true` (the Lab's averages tab) uses the game's own `chaoToY` — chao 1–5
   * mapped to 0.80H–0.20H, PRD §5.1 — so a tone's vertical excursion here is
   * the same fraction of card height it would be of the actual play canvas,
   * not an independently-chosen crop.
   */
  gameScale = false,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const y = gameScale
    ? (chao: number) => chaoToY(chao, height)
    : (chao: number) => ((TOP - chao) / (TOP - BOTTOM)) * height;
  const tint = TONE_AVERAGE_COLOR[tone];

  ctx.strokeStyle = rgba("grid", 0.35);
  ctx.lineWidth = 1;
  for (let chao = 1; chao <= 5; chao++) {
    ctx.beginPath();
    ctx.moveTo(0, y(chao));
    ctx.lineTo(width, y(chao));
    ctx.stroke();
  }

  // Every clip's own polyline, faint.
  ctx.strokeStyle = `${tint} 0.18)`;
  ctx.lineWidth = 1;
  for (const w of words) {
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const px = t * width;
      const py = y(chaoAt(w.polyline, t));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // The average, bold.
  if (words.length === 0) return;
  const avg = averagePolyline(words);
  ctx.strokeStyle = `${tint} 0.95)`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  avg.forEach((chao, i) => {
    const px = (i / SAMPLES) * width;
    const py = y(chao);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}
