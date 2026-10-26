import { useEffect, useRef } from "react";
import { applyCorridorWidth, corridorChaoAt, toleranceChao } from "../../game/gates.ts";
import { birdXFrac } from "../../game/run.ts";
import { tuning } from "../../game/tuning.ts";
import type { Word } from "../../game/words.ts";
import { scaleForDpr } from "../../render/canvas.ts";
import { drawChaoGrid, drawPip } from "../../render/scene.ts";
import { THEME_RENDERERS } from "../../render/themeRenderers.ts";
import { drawGate } from "../../render/world.ts";

/**
 * One word's real gate, still, on a phone-sized canvas in the pixel theme:
 * the same renderer, `drawGate` and corridor maths a run uses (as the Lab's
 * ThemePreview does), with the bird at the gate's mouth. Drawn once per word,
 * no loop. Lazy-loaded so the render code stays off the first paint.
 */

/** The Lab's phone frame (ThemePreview's FRAMES.phone). */
const WIDTH = 420;
const HEIGHT = 747;
const THEME = "pixel-flappy" as const;

export default function GateDemo({ word, label }: { word: Word; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = scaleForDpr(canvas, WIDTH, HEIGHT);
      if (!ctx) return;
      const renderer = THEME_RENDERERS[THEME];
      const t = tuning();
      const d = applyCorridorWidth(
        { scrollSpeed: t.baseScrollSpeed, toleranceH: toleranceChao(word.tones, t.baseToleranceH), restMs: 0 },
        "normal",
      );
      const shape = { polyline: word.polyline, durationS: word.durationS };
      const widthPx = d.scrollSpeed * shape.durationS;
      const dotX = WIDTH * birdXFrac();
      // The gate starts just ahead of the bird, as the player first sees it.
      const x0 = dotX + 24;

      renderer.drawBackdrop(ctx, WIDTH, HEIGHT, 0);
      drawChaoGrid(ctx, WIDTH, HEIGHT, renderer.gridStyle);
      drawGate(
        ctx,
        WIDTH,
        HEIGHT,
        { tone: word.tone, tones: word.tones, word, shape, x0, x1: x0 + widthPx, tolChao: d.toleranceH, xStart: x0 },
        true,
        THEME,
      );
      renderer.drawForeground?.(ctx, WIDTH, HEIGHT, 0);
      drawPip(ctx, HEIGHT, corridorChaoAt(shape, 0), dotX, 0, "flying", true, 0, Infinity, true, WIDTH);
    };
    draw();
    // Backdrop art can finish building a frame later; one redraw catches it.
    const id = window.setTimeout(draw, 300);
    return () => window.clearTimeout(id);
  }, [word]);

  return <canvas ref={canvasRef} className="sky-gate-canvas" role="img" aria-label={label} />;
}
