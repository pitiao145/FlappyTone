/**
 * The in-game world renderer: scrolling corridors, dashed ghost centrelines,
 * and the player's trail drawn over them. Pure function of `RunSnapshot` —
 * see src/game/run.ts for the state shape.
 *
 * Canvas draws geometry only. Text (syllable, hanzi, tone number, score) is
 * the HUD React overlay's job, not this module's — see PRD §8.
 */

import { BIRD_X_FRAC } from "../game/run.ts";
import type { RunSnapshot } from "../game/run.ts";
import { corridorChaoAt } from "../game/gates.ts";
import { TRAIL_SECONDS } from "../game/dynamics.ts";
import { chaoToY, drawChaoGrid, drawDot, drawTrail } from "./scene.ts";

/** How long a "couldn't hear that" / rating flash lingers after a gate retires (PRD-adjacent, brief §5). */
const OUTCOME_FLASH_MS = 800;
/** Samples per gate when tracing the dashed ghost centreline. */
const CENTRELINE_STEPS = 24;

const OUTCOME_COLOR: Record<string, string> = {
  perfect: "rgba(120, 230, 170,",
  good: "rgba(150, 210, 255,",
  ok: "rgba(210, 200, 140,",
  collision: "rgba(255, 110, 110,",
  unheard: "rgba(180, 180, 190,",
};

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snap: RunSnapshot,
): void {
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, width, height);

  drawChaoGrid(ctx, width, height);

  const dotX = width * BIRD_X_FRAC;

  for (const gate of snap.gates) {
    // A gate the bird has reached is the player's turn: full brightness.
    // Approaching gates (still in or before their "listen" phase) stay dim.
    drawGate(ctx, width, height, gate, gate.x0 <= dotX);
  }

  if (!snap.cuePaused) drawCueDemo(ctx, height, snap);

  drawTrail(ctx, width, height, snap.trail, TRAIL_SECONDS, dotX, performance.now());
  drawDot(ctx, width, height, snap.birdChao, dotX, snap.voiced);

  drawPinFlash(ctx, width, height, snap.pinned);
  drawOutcomeFlash(ctx, width, height, snap);
  drawCueVeil(ctx, width, height, snap);
}

/**
 * "pause"-style listen phase: dim everything (including the player's own dot
 * and trail), then redraw the cued gate and demo dot above the veil — a
 * spotlight on the example. The veil dropping is the "your turn" handoff.
 */
function drawCueVeil(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snap: RunSnapshot,
): void {
  if (!snap.cuePaused || !snap.cue) return;
  const fadeIn = Math.min(1, (performance.now() - snap.cue.atMs) / 150);
  ctx.fillStyle = `rgba(6, 8, 12, ${0.6 * fadeIn})`;
  ctx.fillRect(0, 0, width, height);

  const gate = snap.gates.find((g) => g.xStart === snap.cue!.xStart);
  if (gate) drawGate(ctx, width, height, gate, true);
  drawCueDemo(ctx, height, snap);
}

function drawGate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gate: RunSnapshot["gates"][number],
  active: boolean,
): void {
  const { x0, x1, tone, tolChao } = gate;
  if (x1 < 0 || x0 > width) return;

  // Corridor walls: everything outside centre ± tol, as filled bands.
  ctx.fillStyle = active
    ? "rgba(255, 255, 255, 0.10)"
    : "rgba(255, 255, 255, 0.04)";
  for (let i = 0; i < CENTRELINE_STEPS; i++) {
    const t0 = i / CENTRELINE_STEPS;
    const t1 = (i + 1) / CENTRELINE_STEPS;
    const sx0 = x0 + t0 * (x1 - x0);
    const sx1 = x0 + t1 * (x1 - x0);
    const centre = corridorChaoAt(tone, t0);
    const topY = chaoToY(centre + tolChao, height);
    const botY = chaoToY(centre - tolChao, height);
    // Above the corridor (higher chao = smaller y)
    ctx.fillRect(sx0, 0, sx1 - sx0 + 1, Math.max(0, topY));
    // Below the corridor
    ctx.fillRect(sx0, botY, sx1 - sx0 + 1, Math.max(0, height - botY));
  }

  // Dashed ghost centreline — the ideal contour (PRD §8).
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = active
    ? "rgba(255, 255, 255, 0.55)"
    : "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= CENTRELINE_STEPS; i++) {
    const t = i / CENTRELINE_STEPS;
    const sx = x0 + t * (x1 - x0);
    const sy = chaoToY(corridorChaoAt(tone, t), height);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The "listen" demo: a dot sweeping the cued gate's centreline in sync with
 * the reference tone, so the player sees the contour being sung before it is
 * their turn (design 2026-08-02).
 */
function drawCueDemo(
  ctx: CanvasRenderingContext2D,
  height: number,
  snap: RunSnapshot,
): void {
  const cue = snap.cue;
  if (!cue) return;
  const raw = (performance.now() - cue.atMs) / cue.durationMs;
  if (raw < 0) return;
  // After the sweep the dot rests at the contour's endpoint, dimmed — in
  // "pause" style this is the still beat before the world resumes.
  const p = Math.min(1, raw);
  const alpha = raw <= 1 ? 0.9 : 0.45;
  const gate = snap.gates.find((g) => g.xStart === cue.xStart);
  if (!gate) return;

  const x = gate.x0 + p * (gate.x1 - gate.x0);
  const y = chaoToY(corridorChaoAt(cue.tone, p), height);
  ctx.save();
  ctx.fillStyle = `rgba(255, 210, 130, ${alpha})`;
  ctx.shadowColor = "rgba(255, 210, 130, 0.8)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPinFlash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pinned: RunSnapshot["pinned"],
): void {
  if (!pinned) return;
  const bandH = height * 0.03;
  const y = pinned === "high" ? 0 : height - bandH;
  const grad = ctx.createLinearGradient(0, y, 0, y + bandH);
  const edgeAlpha = 0.35;
  if (pinned === "high") {
    grad.addColorStop(0, `rgba(255, 220, 120, ${edgeAlpha})`);
    grad.addColorStop(1, "rgba(255, 220, 120, 0)");
  } else {
    grad.addColorStop(0, "rgba(255, 220, 120, 0)");
    grad.addColorStop(1, `rgba(255, 220, 120, ${edgeAlpha})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, width, bandH);
}

function drawOutcomeFlash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snap: RunSnapshot,
): void {
  const last = snap.lastOutcome;
  if (!last) return;
  const age = performance.now() - last.atMs;
  if (age < 0 || age > OUTCOME_FLASH_MS) return;

  const alpha = 0.5 * (1 - age / OUTCOME_FLASH_MS);
  const color = OUTCOME_COLOR[last.outcome] ?? "rgba(255, 255, 255,";
  // Anchor near the bird's fixed x — the retiring gate has just passed it.
  const cx = width * BIRD_X_FRAC;
  const cy = height * 0.5;
  const r = width * 0.12;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, `${color} ${alpha})`);
  grad.addColorStop(1, `${color} 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}
