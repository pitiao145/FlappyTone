import { useEffect, useRef, useState } from "react";
import { REST_CHAO } from "../game/dynamics.ts";
import { corridorChaoAt, shapeForTone, toleranceChao, type Tone } from "../game/gates.ts";
import type { ThemeId } from "../game/themes.ts";
import { tuning } from "../game/tuning.ts";
import { scaleForDpr } from "../render/canvas.ts";
import { drawChaoGrid, drawPip } from "../render/scene.ts";
import { THEME_RENDERERS } from "../render/themeRenderers.ts";
import { drawGate } from "../render/world.ts";

/** One gate per tone, each in its own theme. Paper is left out on purpose. */
const SEGMENTS: readonly { tone: Tone; theme: ThemeId }[] = [
  { tone: 1, theme: "pixel-flappy" },
  { tone: 2, theme: "taroko" },
  { tone: 3, theme: "alishan" },
  { tone: 4, theme: "tea-terraces" },
];

/** Landscape on desktop; portrait on a phone, like the game's own canvas. */
const DESKTOP = { w: 340, h: 200 };
const MOBILE = { w: 300, h: 400 };
const MOBILE_QUERY = "(max-width: 719px)";
/** Slower than a run: the strip is small, and this is a teaser, not a level. */
const SPEED = 120;
const REST_S = 1.2;

/**
 * The Play home's idle animation: the bird flies a perfect line through one
 * gate per tone, the scene switching theme between gates. Pure drawing — no
 * Run, no mic, no audio. Uses the same renderers and fallback corridors a run
 * does, so it always matches what the player will see.
 */
export function ThemeGateLoop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const { w: W, h: H } = mobile ? MOBILE : DESKTOP;

  useEffect(() => {
    const BIRD_X = W * 0.3;
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = tuning();
    const segs = SEGMENTS.map((s) => {
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
      // Reduced motion: hold mid-way through the Tone 2 gate.
      let s = reduced ? REST_S + segs[0].gateS + REST_S + segs[1].gateS * 0.6 : ((now - start) / 1000) % loopS;
      let i = 0;
      while (s >= segS(i)) s -= segS(i++);
      const seg = segs[i];
      const worldX = ((now - start) / 1000) * SPEED;
      const renderer = THEME_RENDERERS[seg.theme];

      renderer.drawBackdrop(ctx, W, H, reduced ? 0 : worldX);
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
      renderer.drawForeground?.(ctx, W, H, reduced ? 0 : worldX);

      const inGate = s >= REST_S;
      // Late in the rest, line up with the gate's entry, as a player would.
      const target = inGate
        ? corridorChaoAt(seg.shape, (s - REST_S) / seg.gateS)
        : s > REST_S * 0.4
          ? corridorChaoAt(seg.shape, 0)
          : REST_CHAO;
      chao = reduced ? target : chao + (target - chao) * Math.min(1, dt * (inGate ? 25 : 5));
      drawPip(ctx, H, chao, BIRD_X, 0, "flying", true, now, Infinity, true, W);

      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [W, H]);

  return <canvas ref={ref} className="playhome-loop" style={{ aspectRatio: `${W} / ${H}` }} aria-hidden="true" />;
}
