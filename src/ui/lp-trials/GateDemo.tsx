import { useEffect, useRef } from "react";
import { REST_CHAO } from "../../game/dynamics.ts";
import { applyCorridorWidth, corridorChaoAt, toleranceChao } from "../../game/gates.ts";
import { birdXFrac } from "../../game/run.ts";
import { tuning } from "../../game/tuning.ts";
import type { Word } from "../../game/words.ts";
import { scaleForDpr } from "../../render/canvas.ts";
import { drawChaoGrid, drawPip } from "../../render/scene.ts";
import { THEME_RENDERERS } from "../../render/themeRenderers.ts";
import { drawGate } from "../../render/world.ts";

/**
 * One word's real gate, flown on a loop in the pixel theme: the same
 * renderer, `drawGate` and corridor maths a run uses (as the Lab's
 * ThemePreview does), with the bird following the corridor's centre line.
 * No microphone, no Run: a canvas and a rAF loop, nothing in React state.
 * Lazy-loaded by the landing trial so the render code stays off first paint.
 */

const WIDTH = 960;
const HEIGHT = 540;
const THEME = "pixel-flappy" as const;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function GateDemo({ word, label }: { word: Word; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = THEME_RENDERERS[THEME];
    const still = prefersReducedMotion();
    const start = performance.now();
    let raf = 0;
    let visible = true;
    let chao = REST_CHAO;

    const draw = (now: number) => {
      const ctx = scaleForDpr(canvas, WIDTH, HEIGHT);
      if (ctx) {
        const t = tuning();
        const d = applyCorridorWidth(
          { scrollSpeed: t.baseScrollSpeed, toleranceH: toleranceChao(word.tones, t.baseToleranceH), restMs: 0 },
          "normal",
        );
        const shape = { polyline: word.polyline, durationS: word.durationS };
        const widthPx = d.scrollSpeed * shape.durationS;
        const dotX = WIDTH * birdXFrac();
        const period = WIDTH + widthPx + 240;
        const worldX = still ? 0 : ((now - start) / 1000) * t.baseScrollSpeed;
        // Still: the gate sits with the bird halfway through it.
        const x0 = still ? dotX - widthPx / 2 : WIDTH + 60 - (worldX % period);

        renderer.drawBackdrop(ctx, WIDTH, HEIGHT, worldX);
        drawChaoGrid(ctx, WIDTH, HEIGHT, renderer.gridStyle);
        drawGate(
          ctx,
          WIDTH,
          HEIGHT,
          { tone: word.tone, tones: word.tones, word, shape, x0, x1: x0 + widthPx, tolChao: d.toleranceH, xStart: x0 + worldX },
          true,
          THEME,
        );
        renderer.drawForeground?.(ctx, WIDTH, HEIGHT, worldX);

        const inside = dotX >= x0 && dotX <= x0 + widthPx;
        const target = inside ? corridorChaoAt(shape, (dotX - x0) / widthPx) : REST_CHAO;
        chao = still ? target : chao + (target - chao) * 0.25;
        drawPip(ctx, HEIGHT, chao, dotX, 0, "flying", inside, now, Infinity, true, WIDTH);
      }
      if (!still && visible) raf = requestAnimationFrame(draw);
    };

    // Pause while scrolled away; resume on return.
    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was && !still) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [word]);

  return <canvas ref={canvasRef} className="sky-gate-canvas" role="img" aria-label={label} />;
}
