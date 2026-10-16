import { useEffect, useRef, useState } from "react";
import { REST_CHAO } from "../game/dynamics.ts";
import { corridorChaoAt, shapeForTone, toleranceChao, type Tone } from "../game/gates.ts";
import type { ThemeId } from "../game/themes.ts";
import { tuning } from "../game/tuning.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawChaoGrid, drawPip } from "../render/scene.ts";
import { THEME_RENDERERS } from "../render/themeRenderers.ts";
import { drawGate } from "../render/world.ts";

export interface LoopSegment {
  tone: Tone;
  theme: ThemeId;
}

/** Play home: one gate per tone, each in its own theme. Paper is left out on purpose. */
const SHOWCASE: readonly LoopSegment[] = [
  { tone: 1, theme: "pixel-flappy" },
  { tone: 2, theme: "taroko" },
  { tone: 3, theme: "alishan" },
  { tone: 4, theme: "tea-terraces" },
];

/** All four tones in one theme (a Settings preview). */
export function themeSegments(theme: ThemeId): LoopSegment[] {
  return ([1, 2, 3, 4] as const).map((tone) => ({ tone, theme }));
}

/** Landscape on desktop; portrait on a phone, like the game's own canvas. */
const DESKTOP = { w: 340, h: 200 };
const MOBILE = { w: 300, h: 400 };
const MOBILE_QUERY = "(max-width: 719px)";

/** Slower than a run: the canvas is small, and this is a teaser, not a level. */
const SPEED = 120;
const REST_S = 1.2;

interface Props {
  segments?: readonly LoopSegment[];
  /** Fixed logical size. Omit for the responsive Play-home size. */
  size?: { w: number; h: number };
  /** One frame, mid-way through the first gate. Also used for reduced motion. */
  still?: boolean;
  className?: string;
}

/**
 * The bird flying a perfect line through a few gates, the scene switching
 * theme between gates. Pure drawing — no Run, no mic, no audio. Uses the same
 * renderers and fallback corridors a run does, so it always matches what the
 * player will see.
 */
export function ThemeGateLoop({ segments = SHOWCASE, size, still = false, className = "playhome-loop" }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    if (size) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [size]);

  const { w: W, h: H } = size ?? (mobile ? MOBILE : DESKTOP);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const BIRD_X = W * 0.3;
    const frozen = still || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = tuning();
    const segs = segments.map((s) => {
      const shape = shapeForTone(s.tone);
      return { ...s, shape, gateS: shape.durationS, tolChao: toleranceChao(s.tone, t.baseToleranceH) };
    });
    const segS = (i: number) => REST_S + segs[i].gateS;
    const loopS = segs.reduce((sum, _, i) => sum + segS(i), 0);
    const start = performance.now();
    let raf = 0;
    // The bird's chao is eased, so it glides into and out of each gate.
    let chao = REST_CHAO;
    let last = start;

    const draw = (now: number) => {
      const ctx = scaleForDpr(canvas, W, H);
      if (!ctx) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let s = frozen ? REST_S + segs[0].gateS * 0.6 : ((now - start) / 1000) % loopS;
      let i = 0;
      while (s >= segS(i)) s -= segS(i++);
      const seg = segs[i];
      const worldX = frozen ? 0 : ((now - start) / 1000) * SPEED;
      const renderer = THEME_RENDERERS[seg.theme];

      renderer.drawBackdrop(ctx, W, H, worldX);
      drawChaoGrid(ctx, W, H, renderer.gridStyle);
      // The gate's left edge reaches the bird after the rest interval.
      const x0 = BIRD_X + (REST_S - s) * SPEED;
      const x1 = x0 + seg.gateS * SPEED;
      drawGate(
        ctx,
        W,
        H,
        { tone: seg.tone, tones: [seg.tone], word: null, shape: seg.shape, x0, x1, tolChao: seg.tolChao, xStart: x0 + worldX },
        true,
        seg.theme,
      );
      renderer.drawForeground?.(ctx, W, H, worldX);

      const inGate = s >= REST_S;
      // Late in the rest, line up with the gate's entry, as a player would.
      const target = inGate
        ? corridorChaoAt(seg.shape, (s - REST_S) / seg.gateS)
        : s > REST_S * 0.4
          ? corridorChaoAt(seg.shape, 0)
          : REST_CHAO;
      chao = frozen ? target : chao + (target - chao) * Math.min(1, dt * (inGate ? 25 : 5));
      drawPip(ctx, H, chao, BIRD_X, 0, "flying", true, now, Infinity, true, W);

      if (!frozen) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [W, H, segments, still]);

  return <canvas ref={ref} className={className} style={{ aspectRatio: `${W} / ${H}` }} aria-hidden="true" />;
}
