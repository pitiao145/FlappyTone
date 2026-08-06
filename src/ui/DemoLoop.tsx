import { useEffect, useRef } from "react";
import { corridorChaoAt, gateDurationS, TONE_INFO } from "../game/gates.ts";
import type { Tone } from "../game/gates.ts";
import { loadReduceMotion } from "../game/settings.ts";
import { rgba } from "../render/palette.ts";
import { BACKDROP, chaoToY, drawChaoGrid, drawDot } from "../render/scene.ts";
import { ContourSpark } from "./ContourSpark.tsx";

const TONES: Tone[] = [1, 2, 3, 4];

/** Beat between one tone finishing and the next starting, in ms. */
const REST_MS = 700;
/** Half-height of the demo corridor, as a fraction of canvas height. */
const TOLERANCE_FRAC = 0.11;
/** How long the dot's trail lingers, in ms. */
const TRAIL_MS = 1500;

/**
 * The landing page's "see it" panel: a silent, hands-off loop of a dot flying
 * each of the four tone corridors in turn.
 *
 * Deliberately **mute and mic-free** — it must not import from `src/audio/` and
 * must never construct an `AudioContext`. Someone deciding whether this is for
 * them should be able to watch the mechanic before granting anything.
 *
 * The corridor comes from `corridorChaoAt()` and its length from
 * `gateDurationS()`, the same two functions the real game uses, so the thing
 * being advertised is the thing that ships.
 */
export function DemoLoop({
  width = 420,
  height = 280,
}: {
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Read once per mount: this decides between an animation and a static figure,
  // and flipping between them mid-view would be its own motion.
  const reduced = prefersReduced();

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let toneIdx = 0;
    let phaseStart = performance.now();
    const trail: { x: number; chao: number; t: number }[] = [];

    const frame = (now: number) => {
      if (!running) return;
      const tone = TONES[toneIdx];
      const flightMs = gateDurationS(tone) * 1000;
      const elapsed = now - phaseStart;
      // Progress along the corridor; clamped so the dot rests at the end
      // through the beat before the next tone.
      const t = Math.min(1, elapsed / flightMs);
      const chao = corridorChaoAt(tone, t);
      const x = width * (0.08 + t * 0.84);

      trail.push({ x, chao, t: now });
      while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();

      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, width, height);
      drawChaoGrid(ctx, width, height);
      drawCorridor(ctx, width, height, tone);
      drawTrace(ctx, trail, height, now);
      drawDot(ctx, width, height, chao, x, true, now);
      drawLabel(ctx, width, height, tone);

      if (elapsed > flightMs + REST_MS) {
        toneIdx = (toneIdx + 1) % TONES.length;
        phaseStart = now;
        trail.length = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // A backgrounded tab should not be burning frames on decoration.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        phaseStart = performance.now();
        trail.length = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [width, height, reduced]);

  // Reduced motion: the same information, standing still.
  if (reduced) {
    return (
      <div className="demo-static">
        {TONES.map((tone) => (
          <figure key={tone}>
            <ContourSpark tone={tone} width={80} height={44} />
            <figcaption>
              {TONE_INFO[tone].pinyin} {TONE_INFO[tone].hanzi}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  return (
    <canvas
      className="demo-canvas"
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label="A dot tracing the pitch shape of each of the four Mandarin tones through a matching corridor."
    />
  );
}

/** The player's explicit choice if they have one, else the OS setting. */
function prefersReduced(): boolean {
  const saved = loadReduceMotion();
  if (saved !== null) return saved;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The corridor: a lit channel between two walls, as in the game. */
function drawCorridor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tone: Tone,
): void {
  const steps = 48;
  const x0 = width * 0.04;
  const x1 = width * 0.96;
  const tol = height * TOLERANCE_FRAC;
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return {
      x: x0 + t * (x1 - x0),
      y: chaoToY(corridorChaoAt(tone, t), height),
    };
  });

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y - tol);
  for (const p of pts) ctx.lineTo(p.x, p.y - tol);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y + tol);
  ctx.closePath();
  ctx.fillStyle = rgba("accent", 0.09);
  ctx.fill();
  ctx.strokeStyle = rgba("accent", 0.4);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // The ideal contour, dashed — the ghost line the game draws inside a gate.
  ctx.setLineDash([5, 7]);
  ctx.strokeStyle = rgba("accent", 0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

/** The flown path, fading with age. */
function drawTrace(
  ctx: CanvasRenderingContext2D,
  trail: readonly { x: number; chao: number; t: number }[],
  height: number,
  now: number,
): void {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < trail.length; i++) {
    const age = now - trail[i].t;
    const freshness = Math.max(0, 1 - age / TRAIL_MS);
    ctx.strokeStyle = rgba("accent", 0.7 * freshness);
    ctx.lineWidth = 2 + 2 * freshness;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, chaoToY(trail[i - 1].chao, height));
    ctx.lineTo(trail[i].x, chaoToY(trail[i].chao, height));
    ctx.stroke();
  }
  ctx.restore();
}

/** Pinyin, hanzi and tone number, as the HUD shows them. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tone: Tone,
): void {
  const info = TONE_INFO[tone];
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = rgba("accent", 0.95);
  ctx.font = `${Math.round(height * 0.11)}px system-ui, sans-serif`;
  ctx.fillText(`${info.pinyin} ${info.hanzi}`, width / 2, height * 0.04);
  ctx.restore();
}
