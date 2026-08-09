/**
 * The in-game world renderer: scrolling corridors, dashed ghost centrelines,
 * and the player's trail drawn over them. Pure function of `RunSnapshot` —
 * see src/game/run.ts for the state shape.
 *
 * Canvas draws geometry only. Text (syllable, hanzi, tone number, score) is
 * the HUD React overlay's job, not this module's — see PRD §8.
 */

import { birdXFrac } from "../game/run.ts";
import type { RunSnapshot } from "../game/run.ts";
import {
  corridorChaoAt,
  corridorToleranceAt,
  type GateShape,
} from "../game/gates.ts";
import { loadReduceMotion } from "../game/settings.ts";
import { tuning } from "../game/tuning.ts";
import {
  BACKDROP,
  chaoToY,
  drawChaoGrid,
  drawDot,
  drawTrail,
  traceSmoothPath,
} from "./scene.ts";
import { rgb, rgba, rgbTuple } from "./palette.ts";

/** The token mixed `amount` toward white — a highlight of the same hue. */
function lighten(token: Parameters<typeof rgb>[0], amount: number): string {
  return rgbTuple(token)
    .map((c) => Math.round(c + (255 - c) * amount))
    .join(", ");
}

/**
 * Roughly one sample per this many horizontal pixels when tracing a corridor.
 *
 * Was a flat 24 samples per gate regardless of width, which on a T3 corridor
 * (263px at normal pace) put 11px between samples — enough that the polyline's
 * vertices fell between samples and the edges read as faceted. Sampling by
 * width keeps the facet size constant instead of the facet *count*.
 */
const CORRIDOR_SAMPLE_PX = 2;
const MIN_CORRIDOR_STEPS = 24;
const MAX_CORRIDOR_STEPS = 240;

function corridorSteps(widthPx: number): number {
  return Math.min(
    MAX_CORRIDOR_STEPS,
    Math.max(MIN_CORRIDOR_STEPS, Math.round(widthPx / CORRIDOR_SAMPLE_PX)),
  );
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Appends a smoothed run of points to the current path — quadratics through
 * segment midpoints, each sample its own control point.
 *
 * The drawn wall must stay the wall the player hits, and it does: the curve
 * departs from the sampled polyline by at most half a segment, which at
 * CORRIDOR_SAMPLE_PX is about one pixel. What it removes is the faceting and
 * the miter spikes at the polyline's corners, not the shape.
 *
 * Does not call beginPath or moveTo — the caller owns the path, because these
 * runs are stitched into closed wall polygons.
 */
function appendSmooth(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  if (pts.length === 0) return;
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(
      pts[i].x,
      pts[i].y,
      (pts[i].x + pts[i + 1].x) / 2,
      (pts[i].y + pts[i + 1].y) / 2,
    );
  }
  const last = pts[pts.length - 1];
  ctx.quadraticCurveTo(last.x, last.y, last.x, last.y);
}

// Colour prefixes — the caller appends `${alpha})`. Perfect, collision and the
// good/blue tier come from the tokens so they stay in step with the rest of the
// palette; "ok" amber and the neutral "unheard" grey are deliberately outside
// the brand's colour language (see drawUnheardPulse below).
const OUTCOME_COLOR: Record<string, string> = {
  perfect: `rgba(${rgb("good")},`,
  good: `rgba(${rgb("accent")},`,
  ok: "rgba(210, 200, 140,",
  collision: `rgba(${rgb("danger")},`,
  unheard: "rgba(180, 180, 190,",
};

/**
 * How long the flown path burns after a cleared gate, before combo extends it.
 *
 * The effect this replaces was a radial gradient capped at 0.5 alpha over
 * 800ms, and on a real device it was not detectable at all — a heart could be
 * lost with nothing visible happening. Feedback here is deliberately drawn on
 * the player's own contour rather than as an overlay, so it cannot be mistaken
 * for scenery.
 */
const IGNITE_MS = 520;
/** Extra burn time at full combo — the escalation, felt as lingering. */
const IGNITE_COMBO_BONUS_MS = 200;
/** Collision shake duration. Short: this is a jolt, not a wobble. */
const SHAKE_MS = 120;
const SHAKE_PX = 7;
/** Collision vignette lifetime — outlives the shake so the read is unhurried. */
const IMPACT_MS = 420;
/** How far the dot is knocked back on impact, as a fraction of canvas width. */
const RECOIL_FRAC = 0.055;
/** The unheard pulse — neutral, unhurried, never in the failure colour. */
const UNHEARD_PULSE_MS = 900;

const CLEARED = new Set(["perfect", "good", "ok"]);

/**
 * Respect "reduce motion" for the two effects that actually move the frame:
 * the player's explicit choice if they have made one, otherwise the OS.
 *
 * Read once per run rather than per frame — this does not change mid-run, and
 * querying matchMedia in a 60fps loop is needless work. Settings changes take
 * effect on the next run, which is when the player will be looking.
 */
const osReducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

let REDUCED_MOTION = loadReduceMotion() ?? osReducedMotion();

/** Re-reads the preference. Called when a run starts. */
export function refreshMotionPreference(): void {
  REDUCED_MOTION = loadReduceMotion() ?? osReducedMotion();
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snap: RunSnapshot,
): void {
  const now = performance.now();
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, width, height);

  // The shake displaces the world, not the backdrop — a shaking background
  // would show seams at the canvas edges.
  const shake = shakeOffset(snap, now);
  ctx.save();
  if (shake) ctx.translate(shake.x, shake.y);

  drawChaoGrid(ctx, width, height);

  const dotX = width * birdXFrac();

  for (const gate of snap.gates) {
    // A gate the bird has reached is the player's turn: full brightness.
    // Approaching gates (still in or before their "listen" phase) stay dim.
    drawGate(ctx, width, height, gate, gate.x0 <= dotX);
  }

  if (!snap.cuePaused) drawCueDemo(ctx, height, snap);

  drawTrail(ctx, width, height, snap.trail, tuning().trailSeconds, dotX, now);
  drawIgnition(ctx, width, height, snap, now);
  drawDot(
    ctx,
    width,
    height,
    snap.birdChao,
    dotX + recoilOffset(snap, now, width),
    snap.voiced,
    now,
  );

  ctx.restore();

  drawPinFlash(ctx, width, height, snap.pinned);
  drawImpact(ctx, width, height, snap, now);
  drawUnheardPulse(ctx, width, height, snap, now);
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
/**
 * Keeps a drawn corridor edge on the canvas.
 *
 * The timing-slack flare takes tolerance to 2.0 chao at the T4 cliff against a
 * base of 0.80, so `centre ± tol` reaches chao 7.0 and −0.75 — well outside the
 * 1–5 band, and off both ends of the canvas. Unclamped, the wall polygon
 * (`moveTo(x, 0)` → edge → `lineTo(x, 0)`) inverted and simply stopped being
 * drawn there, which is the "the corridor runs off the top and bottom" report.
 *
 * Rendering only: the player's own chao is clamped to 1–5 by the pitch math, so
 * this hides no wall anyone could hit, and scoring never sees it. Clamped, the
 * channel reads as opening out to the screen edge, which is what it does.
 */
function clampY(y: number, height: number): number {
  return Math.min(height, Math.max(0, y));
}

interface EdgeProfile {
  /** The inputs this profile was measured under. A change re-measures it. */
  key: string;
  /** Edge chao at each sample, in gate-local t. Screen x is applied per frame. */
  topChao: number[];
  bottomChao: number[];
}

/**
 * Sampled edge profiles, keyed by the gate's shape object.
 *
 * A gate scrolls, but its geometry in gate-local coordinates does not: only
 * `x0` moves. Re-measuring it every frame was affordable while the tolerance
 * was one max scan per sample; the smoothing pass multiplies that by the tap
 * count, and a wide gate is 240 samples. So it is measured once per gate and
 * the samples are mapped to screen x each frame.
 *
 * A WeakMap because the key is the gate's own shape object — nothing here
 * keeps a finished gate alive. The stored `key` covers everything the Lab can
 * move mid-run, so a slider still takes effect on the next frame.
 */
const edgeProfiles = new WeakMap<GateShape, EdgeProfile>();

function edgeProfile(
  shape: GateShape,
  tolChao: number,
  steps: number,
): EdgeProfile {
  const t = tuning();
  const key = `${tolChao}|${steps}|${t.timingSlackS}|${t.maxTimingWidenFactor}|${t.slackSmoothS}`;
  const cached = edgeProfiles.get(shape);
  if (cached && cached.key === key) return cached;

  const topChao: number[] = [];
  const bottomChao: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const tt = i / steps;
    const centre = corridorChaoAt(shape, tt);
    // Local tolerance, so the corridor visibly flares where it forgives
    // timing. Collision uses the same function — the wall the player sees is
    // exactly the wall they hit.
    const tol = corridorToleranceAt(shape, tt, tolChao);
    topChao.push(centre + tol);
    bottomChao.push(centre - tol);
  }
  const profile: EdgeProfile = { key, topChao, bottomChao };
  edgeProfiles.set(shape, profile);
  return profile;
}

/**
 * Both corridor edges, sampled across the gate. Exported for testing: this is
 * the geometry every part of the gate is built from, and it is the thing that
 * has to stay on the canvas.
 */
export function corridorEdges(
  shape: GateShape,
  tolChao: number,
  x0: number,
  x1: number,
  height: number,
): { top: Pt[]; bottom: Pt[] } {
  const steps = corridorSteps(x1 - x0);
  const { topChao, bottomChao } = edgeProfile(shape, tolChao, steps);
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const sx = x0 + (i / steps) * (x1 - x0);
    top.push({ x: sx, y: clampY(chaoToY(topChao[i], height), height) });
    bottom.push({ x: sx, y: clampY(chaoToY(bottomChao[i], height), height) });
  }
  return { top, bottom };
}

function drawGate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gate: RunSnapshot["gates"][number],
  active: boolean,
): void {
  const { x0, x1, tone, shape, tolChao } = gate;
  if (x1 < 0 || x0 > width) return;

  const { top, bottom } = corridorEdges(shape, tolChao, x0, x1, height);
  const steps = top.length - 1;

  const [r, g, b] = TONE_LIGHT[tone] ?? TONE_LIGHT[1];
  const lit = active ? 1 : 0.42;

  ctx.save();

  // 1. The wall — near-black, opaque enough to swallow the grid behind it, so
  //    the guide lines survive only inside the open channel.
  ctx.fillStyle = active ? "rgba(6, 8, 12, 0.97)" : "rgba(8, 10, 15, 0.82)";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  appendSmooth(ctx, top);
  ctx.lineTo(x1, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x0, height);
  appendSmooth(ctx, bottom);
  ctx.lineTo(x1, height);
  ctx.closePath();
  ctx.fill();

  // 2. The channel, lit from within. Clipped to the corridor so the glow can
  //    be generous without bleeding into the wall.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  appendSmooth(ctx, top);
  appendSmooth(ctx, [...bottom].reverse());
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
    ctx.moveTo(edge[0].x, edge[0].y);
    appendSmooth(ctx, edge);
    ctx.stroke();
  }

  // 4. The ghost centreline — guidance, so it must read as *inside* the
  //    corridor rather than as a third obstacle. Thin, dashed, tinted to the
  //    channel's own light instead of competing white.
  ctx.setLineDash([5, 7]);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.42 * lit})`;
  ctx.lineWidth = 1.5;
  const centreline: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    centreline.push({
      x: x0 + t * (x1 - x0),
      y: chaoToY(corridorChaoAt(shape, t), height),
    });
  }
  ctx.beginPath();
  ctx.moveTo(centreline[0].x, centreline[0].y);
  appendSmooth(ctx, centreline);
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
  const raw = (performance.now() - cue.atMs - cue.sweepDelayMs) / cue.sweepMs;
  // Negative through the consonant: the dot appears when the tone starts, not
  // when the sound does.
  if (raw < 0) return;
  // After the sweep the dot rests at the contour's endpoint, dimmed — in
  // "pause" style this is the still beat before the world resumes.
  const p = Math.min(1, raw);
  const alpha = raw <= 1 ? 0.9 : 0.45;
  const gate = snap.gates.find((g) => g.xStart === cue.xStart);
  if (!gate) return;

  const x = gate.x0 + p * (gate.x1 - gate.x0);
  const y = chaoToY(corridorChaoAt(cue.shape, p), height);

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
    const ty = chaoToY(corridorChaoAt(cue.shape, tp), height);
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.strokeStyle = rgba("demo", alpha * 0.4);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = rgba("demo", alpha * 0.35);
  ctx.fill();
  ctx.strokeStyle = `rgba(${lighten("demo", 0.35)}, ${alpha * 0.75})`;
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

/** Age of the last outcome in ms, or null if there isn't one / it's in the future. */
function outcomeAge(snap: RunSnapshot, now: number): number | null {
  const last = snap.lastOutcome;
  if (!last) return null;
  const age = now - last.atMs;
  return age < 0 ? null : age;
}

/** How long a cleared gate's ignition burns, given its combo. */
function igniteDuration(comboMult: number): number {
  // Combo runs ×1 → ×3; normalise so ×1 gets none of the bonus and ×3 all.
  const t = Math.max(0, Math.min(1, (comboMult - 1) / 2));
  return IGNITE_MS + IGNITE_COMBO_BONUS_MS * t;
}

/**
 * The reward: the path the player actually flew, burning along the corridor
 * they flew it through.
 *
 * PRD §8 is blunt that the trail "is the whole product" and everything else is
 * packaging — so the payoff for a good gate is their own contour lit up,
 * rather than a generic burst that would look the same in any game. Nothing
 * here is idealised or snapped: these are the same samples the live trail
 * drew, re-drawn hotter.
 */
function drawIgnition(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snap: RunSnapshot,
  now: number,
): void {
  const last = snap.lastOutcome;
  const age = outcomeAge(snap, now);
  if (!last || age === null || !CLEARED.has(last.outcome)) return;
  if (last.path.length < 2) return;

  const duration = igniteDuration(last.comboMult);
  if (age > duration) return;

  // Fast attack, slow decay — the flare should arrive on the beat the gate
  // resolved and then bleed off, not fade symmetrically.
  const p = age / duration;
  const envelope = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
  if (envelope <= 0) return;

  // "ok" is a cleared gate the player did not fly well; it gets an ember, not
  // a flare, so the three ratings stay distinguishable at a glance.
  const heat =
    last.outcome === "perfect" ? 1 : last.outcome === "good" ? 0.72 : 0.4;
  const combo = 1 + 0.5 * Math.max(0, Math.min(1, (last.comboMult - 1) / 2));
  const intensity = envelope * heat * combo;

  const color = OUTCOME_COLOR[last.outcome] ?? OUTCOME_COLOR.ok;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Three passes: a wide soft bloom, the ribbon, then a white-hot core. The
  // bloom is what makes it read as light rather than as a drawn line.
  const passes: [number, number][] = [
    [width * 0.05, 0.1 * intensity],
    [width * 0.018, 0.55 * intensity],
  ];
  for (const [lineWidth, alpha] of passes) {
    ctx.strokeStyle = `${color} ${alpha})`;
    ctx.lineWidth = lineWidth;
    strokePath(ctx, height, last.path);
  }
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * intensity})`;
  ctx.lineWidth = width * 0.006;
  strokePath(ctx, height, last.path);

  ctx.restore();
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  height: number,
  path: RunSnapshot["trail"],
): void {
  // Same curve the live trail draws — the celebration must be the same shape
  // as the thing being celebrated.
  traceSmoothPath(
    ctx,
    path.map((p) => ({ x: p.x ?? 0, y: chaoToY(p.chao, height) })),
  );
  ctx.stroke();
}

/**
 * Collision shake. Decaying sinusoids on both axes at incommensurate rates,
 * so it reads as a knock rather than a slide in one direction.
 */
function shakeOffset(
  snap: RunSnapshot,
  now: number,
): { x: number; y: number } | null {
  if (REDUCED_MOTION) return null;
  const last = snap.lastOutcome;
  const age = outcomeAge(snap, now);
  if (!last || age === null || last.outcome !== "collision") return null;
  if (age > SHAKE_MS) return null;

  const decay = 1 - age / SHAKE_MS;
  return {
    x: Math.sin(age * 0.09) * SHAKE_PX * decay,
    y: Math.sin(age * 0.13) * SHAKE_PX * 0.6 * decay,
  };
}

/** The dot is knocked backwards on impact and swims back to station. */
function recoilOffset(snap: RunSnapshot, now: number, width: number): number {
  if (REDUCED_MOTION) return 0;
  const last = snap.lastOutcome;
  const age = outcomeAge(snap, now);
  if (!last || age === null || last.outcome !== "collision") return 0;
  if (age > IMPACT_MS) return 0;
  // Knocked back instantly, eased home — the reverse of the shake's envelope.
  return -width * RECOIL_FRAC * Math.pow(1 - age / IMPACT_MS, 2);
}

/** Red vignette from the screen edges. Unmissable, and gone in under half a second. */
function drawImpact(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snap: RunSnapshot,
  now: number,
): void {
  const last = snap.lastOutcome;
  const age = outcomeAge(snap, now);
  if (!last || age === null || last.outcome !== "collision") return;
  if (age > IMPACT_MS) return;

  const alpha = 0.55 * Math.pow(1 - age / IMPACT_MS, 1.6);
  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.28,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  grad.addColorStop(0, rgba("danger", 0));
  grad.addColorStop(1, rgba("danger", alpha));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

/**
 * "Couldn't hear that": a single soft ring leaving the dot, in neutral grey.
 *
 * Deliberately outside both the success and failure colour languages. This is
 * the path where the game admits it is unsure, and PRD §6 is explicit that it
 * must never feel like a punishment — so it gets the quietest effect here, and
 * the only one with no flash at all. The wording of the accompanying hint is
 * the HUD's job; canvas draws geometry (see this module's header).
 */
function drawUnheardPulse(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snap: RunSnapshot,
  now: number,
): void {
  const last = snap.lastOutcome;
  const age = outcomeAge(snap, now);
  if (!last || age === null || last.outcome !== "unheard") return;
  if (age > UNHEARD_PULSE_MS) return;

  const p = age / UNHEARD_PULSE_MS;
  const cx = width * birdXFrac();
  const cy = chaoToY(snap.birdChao, height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, width * (0.04 + 0.09 * p), 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(190, 200, 215, ${0.5 * (1 - p)})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
