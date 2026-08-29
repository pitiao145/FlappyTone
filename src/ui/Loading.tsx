import { useEffect, useRef } from "react";
import {
  chaoToY,
  drawPip,
  pipBodyCenterOffset,
} from "../render/scene.ts";

/**
 * A reusable loading state: the Pip (the game's own bird, drawn by `drawPip`,
 * not an image) spinning fast about its own body centre, with an optional line
 * of text under it. Self-contained and prop-light so it can front any short
 * wait — grid seeding today, whatever else later.
 */
interface Props {
  /** One line under the pip, e.g. "We're personalising your grid for you". */
  label?: string;
  /** Canvas edge in CSS px. */
  size?: number;
}

/** One full spin, in ms — "quite fast". */
const SPIN_MS = 850;
/** Body radius as a fraction of the canvas edge; leaves room for the spin arc. */
const PIP_R_FRAC = 0.2;

export function Loading({ label, size = 148 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    // The height drawPip sizes its bird from — chosen so the body radius
    // (height * 0.018) lands at PIP_R_FRAC of the canvas. Position is driven
    // entirely by the transform below, so this only sets scale.
    const pipHeight = (size * PIP_R_FRAC) / 0.018;
    const bodyOffset = pipBodyCenterOffset(pipHeight);
    const centre = size / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const draw = (now: number) => {
      const angle = reduce ? 0 : ((now % SPIN_MS) / SPIN_MS) * Math.PI * 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      // Pivot about the body centre: put it at the canvas centre, rotate, then
      // shift the beak-tip anchor back by the body offset (and cancel drawPip's
      // own chao→y translate) so only the beak tip orbits — the body stays put.
      ctx.translate(centre, centre);
      ctx.rotate(angle);
      ctx.translate(-bodyOffset, -chaoToY(3, pipHeight));
      drawPip(ctx, pipHeight, 3, 0, 0, "flying", true, now, Infinity, false);
      ctx.restore();
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div className="screen loading-screen" role="status" aria-live="polite">
      <canvas
        ref={canvasRef}
        className="loading-pip"
        style={{ width: size, height: size }}
        aria-hidden
      />
      {label && <p className="note loading-label">{label}</p>}
    </div>
  );
}
