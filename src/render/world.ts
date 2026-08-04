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
import { BACKDROP, chaoToY, drawChaoGrid, drawDot, drawTrail } from "./scene.ts";

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
  const now = performance.now();
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, width, height);

  drawChaoGrid(ctx, width, height);

  const dotX = width * BIRD_X_FRAC;

  for (const gate of snap.gates) {
    // A gate the bird has reached is the player's turn: full brightness.
    // Approaching gates (still in or before their "listen" phase) stay dim.
    drawGate(ctx, width, height, gate, gate.x0 <= dotX);
  }

  if (!snap.cuePaused) drawCueDemo(ctx, height, snap);

  drawTrail(ctx, width, height, snap.trail, TRAIL_SECONDS, dotX, now);
  drawDot(ctx, width, height, snap.birdChao, dotX, snap.voiced, now);

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

/**
 * Each tone's own light. Desaturated to a tint rather than a colour — enough
 * that a clip reads as changing between gates and that the corridor carries
 * *which* tone you are flying, not enough to turn the scene into a rainbow.
 */
const TONE_LIGHT: Record<number, [number, number, number]> = {
  1: [150, 205, 255], // level — cool, steady
  2: [130, 225, 190], // rising — green
  3: [190, 170, 255], // dip then rise — violet
  4: [255, 190, 140], // falling — amber
};

/**
 * One gate: a solid wall with a lit channel cut through it.
 *
 * The emphasis here is inverted from the original, which drew the wall as a
 * translucent white veil (0.10 active / 0.04 approaching) over a dark backdrop
 * — so the *corridor* was the darker region and "passable" was signalled by
 * absence. On a phone in daylight neither region resolved. Now the wall is the
 * densest thing in the frame and the corridor is the only lit one, which is
 * the reading the shape needs: fly through the light.
 */
function drawGate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gate: RunSnapshot["gates"][number],
  active: boolean,
): void {
  const { x0, x1, tone, tolChao } = gate;
  if (x1 < 0 || x0 > width) return;

  // Sample both corridor edges once; walls, glow and rim all reuse them.
  const top: Array<[number, number]> = [];
  const bottom: Array<[number, number]> = [];
  for (let i = 0; i <= CENTRELINE_STEPS; i++) {
    const t = i / CENTRELINE_STEPS;
    const sx = x0 + t * (x1 - x0);
    const centre = corridorChaoAt(tone, t);
    top.push([sx, chaoToY(centre + tolChao, height)]);
    bottom.push([sx, chaoToY(centre - tolChao, height)]);
  }

  const [r, g, b] = TONE_LIGHT[tone] ?? TONE_LIGHT[1];
  const lit = active ? 1 : 0.42;

  ctx.save();

  // 1. The wall — near-black, opaque enough to swallow the grid behind it, so
  //    the guide lines survive only inside the open channel.
  ctx.fillStyle = active ? "rgba(6, 8, 12, 0.97)" : "rgba(8, 10, 15, 0.82)";
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  for (const [sx, sy] of top) ctx.lineTo(sx, sy);
  ctx.lineTo(x1, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x0, height);
  for (const [sx, sy] of bottom) ctx.lineTo(sx, sy);
  ctx.lineTo(x1, height);
  ctx.closePath();
  ctx.fill();

  // 2. The channel, lit from within. Clipped to the corridor so the glow can
  //    be generous without bleeding into the wall.
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < top.length; i++) {
    const [sx, sy] = top[i];
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.13 * lit})`;
  ctx.fillRect(x0, 0, x1 - x0, height);
  ctx.restore();

  // 3. Rims. A hard edge is what actually tells you where the wall starts —
  //    the gradient alone reads as fog.
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.55 * lit})`;
  ctx.lineWidth = active ? 2 : 1.25;
  for (const edge of [top, bottom]) {
    ctx.beginPath();
    for (let i = 0; i < edge.length; i++) {
      const [sx, sy] = edge[i];
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // 4. The ghost centreline — guidance, so it must read as *inside* the
  //    corridor rather than as a third obstacle. Thin, dashed, tinted to the
  //    channel's own light instead of competing white.
  ctx.setLineDash([5, 7]);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.42 * lit})`;
  ctx.lineWidth = 1.5;
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

  // A ghost, deliberately: small, hollow, no halo. It was previously drawn
  // solid and glowing while the player's own dot was a 45%-opacity ring, which
  // made the example the most prominent moving object on screen. The demo
  // shows you the path; it is not the thing you are watching yourself do.
  ctx.save();
  // A short tail so the sweep still reads as tracing a contour rather than
  // hopping — this is the only reason it is on screen at all.
  const tailSteps = 8;
  ctx.beginPath();
  for (let i = 0; i <= tailSteps; i++) {
    const tp = Math.max(0, p - (i / tailSteps) * 0.18);
    const tx = gate.x0 + tp * (gate.x1 - gate.x0);
    const ty = chaoToY(corridorChaoAt(cue.tone, tp), height);
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.strokeStyle = `rgba(235, 208, 170, ${alpha * 0.4})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(235, 208, 170, ${alpha * 0.35})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(245, 222, 190, ${alpha * 0.75})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
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
