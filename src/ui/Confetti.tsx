import { useEffect, useRef } from "react";

/** One shape per entry. Swap/add here to reskin the burst (birdseed, eggs, feathers). */
type ShapeDraw = (ctx: CanvasRenderingContext2D, size: number) => void;

const drawRoundedRect: ShapeDraw = (ctx, size) => {
  const w = size, h = size * 0.6;
  const r = size * 0.2;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fill();
};

const drawCircle: ShapeDraw = (ctx, size) => {
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();
};

export const PARTICLE_SHAPES: ShapeDraw[] = [drawRoundedRect, drawCircle];

const FALLBACK_COLORS = ["#1c7a63", "#c98a3c", "#a8672a", "#f7f1e3"];

function brandColors(): string[] {
  try {
    const style = getComputedStyle(document.documentElement);
    const named = [
      style.getPropertyValue("--jade").trim(),
      style.getPropertyValue("--gold").trim(),
      style.getPropertyValue("--warn").trim(),
      style.getPropertyValue("--cream").trim(),
    ].filter(Boolean);
    return named.length === FALLBACK_COLORS.length ? named : FALLBACK_COLORS;
  } catch {
    return FALLBACK_COLORS;
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  shape: ShapeDraw;
  bornAt: number;
}

const LIFETIME_MS = 2500;
const PARTICLE_COUNT = 90;

interface Props {
  onDone?: () => void;
}

export function Confetti({ onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    if (!canvas) {
      onDone?.();
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onDone?.();
      return;
    }

    const colors = brandColors();
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    const resize = () => {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const originX = window.innerWidth / 2;
    const makeParticle = (now: number): Particle => ({
      x: originX + (Math.random() - 0.5) * 60,
      y: -10,
      vx: (Math.random() - 0.5) * 260,
      vy: 120 + Math.random() * 180,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 8,
      size: 6 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: PARTICLE_SHAPES[Math.floor(Math.random() * PARTICLE_SHAPES.length)],
      bornAt: now,
    });

    if (reduced) {
      // One static frame, no animation.
      ctx.save();
      ctx.scale(dpr, dpr);
      const now = performance.now();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = makeParticle(now);
        p.y = 40 + Math.random() * 120;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        p.shape(ctx, p.size);
        ctx.restore();
      }
      ctx.restore();
      onDone?.();
      return () => window.removeEventListener("resize", resize);
    }

    const start = performance.now();
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => makeParticle(start));
    let rafId = 0;
    let done = false;

    const tick = (now: number) => {
      const elapsed = now - start;
      const dt = 1 / 60;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of particles) {
        p.vy += 320 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        const age = (now - p.bornAt) / LIFETIME_MS;
        const alpha = age >= 1 ? 0 : 1 - age;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        p.shape(ctx, p.size);
        ctx.restore();
      }
      ctx.restore();

      if (elapsed >= LIFETIME_MS) {
        if (!done) {
          done = true;
          onDone?.();
        }
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
}
