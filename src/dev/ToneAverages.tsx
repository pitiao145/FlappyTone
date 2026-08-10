import { useEffect, useMemo, useRef, useState } from "react";
import { loadInventory } from "../audio/inventory.ts";
import type { Tone } from "../game/gates.ts";
import type { Word } from "../game/words.ts";

/**
 * Visualization only, on a throwaway branch — averages each tone's own
 * measured clip polylines (not the T3 citation substitute `shapeForWord`
 * flies in-game) so it shows what was actually recorded.
 */

const CARD_W = 320;
const CARD_H = 220;
const SAMPLES = 60;
const TOP = 5.5;
const BOTTOM = 0.5;

const TONE_COLOR: Record<Tone, string> = {
  1: "rgba(150, 200, 255,",
  2: "rgba(150, 235, 190,",
  3: "rgba(235, 200, 140,",
  4: "rgba(230, 165, 160,",
};

/** Piecewise-linear read of a raw polyline at t in [0,1]. */
function chaoAt(polyline: Word["polyline"], t: number): number {
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
function averagePolyline(words: Word[]): number[] {
  const sums = new Array<number>(SAMPLES + 1).fill(0);
  for (const w of words) {
    for (let i = 0; i <= SAMPLES; i++) {
      sums[i] += chaoAt(w.polyline, i / SAMPLES);
    }
  }
  return sums.map((s) => s / words.length);
}

function draw(canvas: HTMLCanvasElement, words: Word[], tone: Tone): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CARD_W * dpr;
  canvas.height = CARD_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  const y = (chao: number) => ((TOP - chao) / (TOP - BOTTOM)) * CARD_H;
  const tint = TONE_COLOR[tone];

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let chao = 1; chao <= 5; chao++) {
    ctx.beginPath();
    ctx.moveTo(0, y(chao));
    ctx.lineTo(CARD_W, y(chao));
    ctx.stroke();
  }

  // Every clip's own polyline, faint.
  ctx.strokeStyle = `${tint} 0.18)`;
  ctx.lineWidth = 1;
  for (const w of words) {
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const px = t * CARD_W;
      const py = y(chaoAt(w.polyline, t));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // The average, bold.
  const avg = averagePolyline(words);
  ctx.strokeStyle = `${tint} 0.95)`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  avg.forEach((chao, i) => {
    const px = (i / SAMPLES) * CARD_W;
    const py = y(chao);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function ToneCard({ words, tone }: { words: Word[]; tone: Tone }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) draw(ref.current, words, tone);
  }, [words, tone]);

  return (
    <div className="word-card">
      <canvas ref={ref} style={{ width: CARD_W, height: CARD_H }} />
      <span className="param-name">T{tone} — {words.length} clips averaged</span>
    </div>
  );
}

export function ToneAverages() {
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInventory().then(
      (w) => setWords(w),
      (e: unknown) => setError(e instanceof Error ? e.message : "manifest failed"),
    );
  }, []);

  const byTone = useMemo(() => {
    const map = new Map<Tone, Word[]>();
    for (const t of [1, 2, 3, 4] as Tone[]) {
      map.set(t, (words ?? []).filter((w) => w.tone === t));
    }
    return map;
  }, [words]);

  if (error) return <p className="error">{error}</p>;
  if (!words) return <p className="param-help">loading the manifest…</p>;

  return (
    <div className="word-gates">
      <div className="lab-controls">
        <p className="param-help">
          Each tone's clips, resampled onto a shared t grid and averaged
          point-for-point — the bold line is the mean polyline, the faint
          lines behind it are the individual clips it was built from. Raw
          measured polylines, not `shapeForWord` — T3 here is what she said,
          not the citation stand-in the game flies.
        </p>
      </div>
      <div className="word-grid">
        {([1, 2, 3, 4] as Tone[]).map((t) => (
          <ToneCard key={t} words={byTone.get(t) ?? []} tone={t} />
        ))}
      </div>
    </div>
  );
}
