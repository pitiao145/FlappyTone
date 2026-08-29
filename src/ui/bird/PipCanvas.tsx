import { useEffect, useRef } from "react";

/**
 * Reusable canvas host for a Pip animation. Owns the square canvas, the
 * device-pixel-ratio transform, the per-frame clear, and the rAF loop — a
 * `render(ctx, { size, t })` function just draws one frame (see
 * `src/render/pipAnimations.ts`).
 *
 * `t` is milliseconds since mount. Under `prefers-reduced-motion: reduce` the
 * loop is not started: `render` is called once with `t = 0`, so a
 * time-driven animation collapses to a still first frame. This is the base to
 * build every bird animation on — pair it with a draw function.
 */
interface Props {
  /** Canvas edge in CSS px. */
  size?: number;
  className?: string;
  /** Draws one frame into an already-cleared, DPR-scaled context. */
  render: (ctx: CanvasRenderingContext2D, info: { size: number; t: number }) => void;
}

export function PipCanvas({ size = 148, className, render }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest render fn without restarting the loop when it changes.
  const renderRef = useRef(render);
  useEffect(() => {
    renderRef.current = render;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = reduce ? 0 : now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      renderRef.current(ctx, { size, t });
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
