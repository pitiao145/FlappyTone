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

/** Faint Chao 1–5 guide lines, with axis labels. Shared by the prototype scene and the game world. */
export function drawChaoGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.font = `${Math.round(height * 0.02)}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  for (let chao = 1; chao <= 5; chao++) {
    const y = chaoToY(chao, height);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
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

/** The player's dot: filled when voiced, hollow ring when unvoiced/held. */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chao: number,
  dotX: number,
  voiced: boolean,
): void {
  const dotY = chaoToY(chao, height);
  const r = width * 0.03;
  ctx.beginPath();
  ctx.arc(dotX, dotY, r, 0, Math.PI * 2);
  if (voiced) {
    ctx.fillStyle = "#60cdff";
    ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(96, 205, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: SceneSnapshot,
): void {
  const { trail, trailSeconds } = snapshot;
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, width, height);

  drawChaoGrid(ctx, width, height);

  const dotX = width * 0.5;
  drawTrail(ctx, width, height, trail, trailSeconds, dotX, performance.now());
  drawDot(ctx, width, height, snapshot.chao, dotX, snapshot.voiced);
}
