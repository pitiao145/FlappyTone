export interface TrailSample {
  chao: number;
  voiced: boolean;
  t: number;
}

export interface SceneSnapshot {
  /** Eased display position of the dot, in chao units */
  chao: number;
  /** Voiced, or within the unvoiced grace period — controls dot fill */
  voiced: boolean;
  trail: readonly TrailSample[];
  trailSeconds: number;
}

// PRD §5.1: y(chao) = 0.80H - ((chao - 1) / 4) * 0.60H
export function chaoToY(chao: number, height: number): number {
  return 0.8 * height - ((chao - 1) / 4) * 0.6 * height;
}

/** The scene's darkest value. Walls are cut from this — see world.ts. */
export const BACKDROP = "#141821";

/**
 * Faint Chao 1–5 guide lines, with axis labels.
 *
 * These sit *behind* everything and must stay there. They were previously
 * drawn at 0.12 white, brighter than an approaching corridor wall (0.04) and
 * near-equal to an active one (0.10) — so the reference grid and the obstacle
 * read at the same value and neither one resolved. Guides recede; walls do not.
 */
export function drawChaoGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.font = `${Math.round(height * 0.02)}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  for (let chao = 1; chao <= 5; chao++) {
    const y = chaoToY(chao, height);
    // Chao 3 is the rest line the dot returns to — the one guide worth reading.
    const isRest = chao === 3;
    ctx.strokeStyle = isRest
      ? "rgba(150, 180, 215, 0.13)"
      : "rgba(150, 180, 215, 0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = `rgba(150, 180, 215, ${isRest ? 0.3 : 0.18})`;
    ctx.fillText(String(chao), 8, y);
  }
}

/**
 * The player's trail: newest sample at `dotX`, older samples drift left and
 * fade over `trailSeconds`. Shared by the prototype scene and the game world.
 */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  trail: readonly TrailSample[],
  trailSeconds: number,
  dotX: number,
  nowMs: number,
): void {
  const pxPerMs = (width * 0.45) / (trailSeconds * 1000);
  for (const sample of trail) {
    const age = nowMs - sample.t;
    const alpha = Math.max(0, 1 - age / (trailSeconds * 1000));
    if (alpha <= 0) continue;
    const x = dotX - age * pxPerMs;
    const y = chaoToY(sample.chao, height);
    ctx.fillStyle = sample.voiced
      ? `rgba(96, 205, 255, ${0.7 * alpha})`
      : `rgba(120, 130, 145, ${0.3 * alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, width * 0.008, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Idle pulse period when unvoiced — a slow breath, not a blink. */
const PULSE_MS = 1600;

/**
 * The player's dot — the brightest, largest, most alive thing on screen, in
 * every state.
 *
 * It used to drop to a 45%-opacity hollow ring the moment the player stopped
 * phonating, which in real play is most of the time, while the *demo* dot was
 * drawn solid and glowing. For a game whose whole hook is "your voice is the
 * controller", the computer was the most prominent moving object on screen.
 *
 * The voiced/unvoiced distinction carries real information and is kept — but
 * expressed as intensity, not presence versus near-absence. Unvoiced, the dot
 * keeps its size and a solid core, loses its halo, and breathes: it reads as
 * waiting for you, not as gone.
 */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chao: number,
  dotX: number,
  voiced: boolean,
  nowMs = 0,
): void {
  const dotY = chaoToY(chao, height);
  const r = width * 0.032;
  // 0 when unvoiced at the bottom of the breath, 1 when singing.
  const pulse = voiced
    ? 1
    : 0.55 + 0.45 * (0.5 - 0.5 * Math.cos((nowMs / PULSE_MS) * Math.PI * 2));

  ctx.save();

  // Outer halo — the thing that makes it read as a light source rather than a
  // sticker. Present even when silent, just quieter.
  const haloR = r * (voiced ? 3.4 : 2.4);
  const halo = ctx.createRadialGradient(dotX, dotY, r * 0.4, dotX, dotY, haloR);
  halo.addColorStop(0, `rgba(96, 205, 255, ${0.42 * pulse})`);
  halo.addColorStop(0.55, `rgba(96, 205, 255, ${0.14 * pulse})`);
  halo.addColorStop(1, "rgba(96, 205, 255, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(dotX - haloR, dotY - haloR, haloR * 2, haloR * 2);

  // Body: a filled disc in both states. Never a hollow ring.
  ctx.beginPath();
  ctx.arc(dotX, dotY, r, 0, Math.PI * 2);
  ctx.fillStyle = voiced
    ? "rgba(126, 216, 255, 0.95)"
    : `rgba(96, 180, 225, ${0.5 + 0.18 * pulse})`;
  ctx.fill();

  // A white-hot core only while actually producing pitch — this is the single
  // cue that separates "singing" from "waiting", and it is enough.
  if (voiced) {
    ctx.beginPath();
    ctx.arc(dotX, dotY, r * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(242, 252, 255, 0.98)";
    ctx.fill();
  }

  // Crisp rim keeps the dot legible against a lit corridor as well as a dark wall.
  ctx.beginPath();
  ctx.arc(dotX, dotY, r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(200, 240, 255, ${voiced ? 0.9 : 0.4 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: SceneSnapshot,
): void {
  const { trail, trailSeconds } = snapshot;
  const now = performance.now();
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, width, height);

  drawChaoGrid(ctx, width, height);

  const dotX = width * 0.5;
  drawTrail(ctx, width, height, trail, trailSeconds, dotX, now);
  drawDot(ctx, width, height, snapshot.chao, dotX, snapshot.voiced, now);
}
