import { useEffect, useMemo, useRef, useState } from "react";
import { REST_CHAO } from "../game/dynamics.ts";
import { applyCorridorWidth, toleranceChao, type CorridorWidth } from "../game/gates.ts";
import { birdXFrac } from "../game/run.ts";
import { THEMES, type ThemeId } from "../game/themes.ts";
import { tuning } from "../game/tuning.ts";
import type { Word } from "../game/words.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawChaoGrid, drawPip } from "../render/scene.ts";
import { THEME_RENDERERS } from "../render/themeRenderers.ts";
import { drawGate } from "../render/world.ts";
import { Choice } from "../ui/Choice.tsx";

type Frame = "phone" | "desktop";
const FRAMES: Record<Frame, { w: number; h: number }> = {
  phone: { w: 420, h: 747 },
  desktop: { w: 1280, h: 720 },
};

/**
 * The Lab's theme preview: any theme (hidden ones too), any word's gate,
 * paused or scrolling, at phone or desktop size. Draws through the same
 * renderer records and `drawGate` a run uses, with the theme passed in
 * explicitly — the rest of the Lab stays on paper.
 */
export function ThemePreview({
  words,
  corridorWidth,
}: {
  words: Word[];
  corridorWidth: CorridorWidth;
}) {
  const [theme, setTheme] = useState<ThemeId>("pixel-flappy");
  const [wordId, setWordId] = useState<string>(() => words[0]?.id ?? "");
  const [scroll, setScroll] = useState(true);
  const [frame, setFrame] = useState<Frame>("phone");
  const word = useMemo(() => words.find((w) => w.id === wordId) ?? words[0] ?? null, [words, wordId]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w: width, h: height } = FRAMES[frame];
    const renderer = THEME_RENDERERS[theme];
    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const ctx = scaleForDpr(canvas, width, height);
      if (ctx) {
        const t = tuning();
        const worldX = scroll ? ((now - start) / 1000) * t.baseScrollSpeed : 0;
        renderer.drawBackdrop(ctx, width, height, worldX);
        drawChaoGrid(ctx, width, height, renderer.gridStyle);
        const dotX = width * birdXFrac();
        if (word) {
          const d = applyCorridorWidth(
            { scrollSpeed: t.baseScrollSpeed, toleranceH: toleranceChao(word.tones, t.baseToleranceH), restMs: 0 },
            corridorWidth,
          );
          const shape = { polyline: word.polyline, durationS: word.durationS };
          const widthPx = d.scrollSpeed * shape.durationS;
          // Scrolling: the gate enters at the right edge and loops, so the
          // walls are seen moving 1:1 against the parallax.
          const period = width + widthPx + 160;
          const xStart = scroll ? width + 80 + Math.floor(worldX / period) * period : worldX + dotX;
          const x0 = xStart - worldX;
          drawGate(
            ctx,
            width,
            height,
            { tone: word.tone, tones: word.tones, word, shape, x0, x1: x0 + widthPx, tolChao: d.toleranceH, xStart },
            true,
            theme,
          );
        }
        renderer.drawForeground?.(ctx, width, height, worldX);
        drawPip(ctx, height, REST_CHAO, dotX, 0, "flying", true, now, Infinity, true, width);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [theme, word, scroll, frame, corridorWidth]);

  const { w, h } = FRAMES[frame];
  return (
    <div className="lab-theme-preview">
      <div className="lab-controls">
        <h4>Theme</h4>
        <Choice
          options={THEMES.map((t) => t.id)}
          value={theme}
          label={(id) => {
            const info = THEMES.find((t) => t.id === id)!;
            return info.hidden ? `${info.label} (hidden)` : info.label;
          }}
          onChange={setTheme}
        />
        <h4>Gate</h4>
        <select value={word?.id ?? ""} onChange={(e) => setWordId(e.target.value)}>
          {words.map((wd) => (
            <option key={wd.id} value={wd.id}>
              {wd.hanzi} {wd.pinyin} · T{wd.tones.join("-")}
            </option>
          ))}
        </select>
        <h4>Size</h4>
        <Choice options={["phone", "desktop"] as const} value={frame} onChange={setFrame} />
        <label>
          <input type="checkbox" checked={scroll} onChange={(e) => setScroll(e.target.checked)} /> Scroll
        </label>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} style={{ width: "100%", maxWidth: w, aspectRatio: `${w} / ${h}` }} />
      </div>
    </div>
  );
}
