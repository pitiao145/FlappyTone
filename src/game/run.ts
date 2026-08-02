/**
 * The game-run state machine: scrolling world, gate lifecycle, collision,
 * scoring, hearts and difficulty ramp.
 *
 * Pure logic — no Web Audio, no React, no canvas. The host drives it by
 * calling `tickAudio` from the analysis callback and `tickFrame` from
 * requestAnimationFrame, then reads `snapshot()` to draw.
 *
 * See docs/PRD.md §5–§7.
 */

import {
  applyCorridorWidth,
  applyPace,
  corridorChaoAt,
  makeGate,
  newDifficulty,
  nextTone,
  rampDifficulty,
  type CorridorWidth,
  type Difficulty,
  type Gate,
  type Pace,
  type Tone,
} from "./gates.ts";
import {
  applyGate,
  newRunStats,
  multiplierFor,
  scoreGate,
  UNHEARD_VOICED_FLOOR,
  type GateOutcome,
  type GateSample,
  type RunStats,
} from "./scoring.ts";
import {
  DRIFT_CHAO_PER_SEC,
  EASE_TAU_MS,
  GRACE_MS,
  REST_CHAO,
  T3_GRACE_MS,
  TRAIL_SECONDS,
} from "./dynamics.ts";
import type { PitchState } from "../pitch/types.ts";

export type RunMode = "game" | "tutorial";

export interface RunConfig {
  mode: RunMode;
  /**
   * Canvas width in px. Positions are otherwise in chao units, which are
   * height-independent, so the run needs no height.
   */
  width: number;
  /** Injected for deterministic tests. Defaults to Math.random. */
  rand?: () => number;
  /**
   * Pacing selected by the player (see gates.ts). Defaults to "fast", the
   * PRD baseline, so existing callers and tests are unaffected; the UI passes
   * the persisted choice (default "normal").
   */
  pace?: Pace;
  /**
   * Corridor width chosen by the player (see gates.ts). Defaults to "normal"
   * (the PRD tolerance); the UI passes the persisted choice.
   */
  corridor?: CorridorWidth;
  /**
   * How the reference demo relates to play. "flow": the cue plays while the
   * world keeps scrolling (PRD §9 baseline). "pause": the world freezes while
   * the demo is traced, then resumes — a clear call-and-response beat. The UI
   * default is "pause"; playtesting found "flow" blurs example into attempt.
   */
  cueStyle?: CueStyle;
}

export type CueStyle = "flow" | "pause";

export const CUE_STYLES: CueStyle[] = ["flow", "pause"];

export interface TrailSample {
  chao: number;
  voiced: boolean;
  t: number;
}

export interface GateView {
  tone: Tone;
  /** Left edge in screen px (may be off-screen). */
  x0: number;
  /** Right edge in screen px. */
  x1: number;
  tolChao: number;
  /**
   * Stable world-space identity for this gate (its left edge in world px).
   * Unlike x0/x1 (screen space, changes every frame as the world scrolls),
   * this is constant for the gate's lifetime — used by the host to key
   * per-gate bookkeeping such as "has the reference cue fired yet".
   */
  xStart: number;
}

export interface ActiveGateView {
  tone: Tone;
  /** Normalized progress through the gate, 0→1. */
  t: number;
  tolChao: number;
  /** Corridor centreline chao at `t` — the ghost line the player is chasing. */
  corridorChao: number;
}

/**
 * The reference-cue announcement for the next gate. Present from the moment
 * the cue fires until the bird enters that gate — the "listen" phase. The
 * host plays audio when `xStart` changes; the renderer animates the demo dot
 * from `atMs` over `durationMs`.
 */
export interface CueView {
  tone: Tone;
  /** World-space identity of the cued gate — matches GateView.xStart. */
  xStart: number;
  /** When the cue fired (host clock, same nowMs fed to tick*). */
  atMs: number;
  /** How long the audible cue (and demo-dot trace) lasts. */
  durationMs: number;
}

/**
 * "listen": the example is being announced for an approaching gate.
 * "active": the bird is inside a gate — the player's turn.
 * null: between gates, nothing demanded.
 */
export type RunPhase = "listen" | "active" | null;

export interface LastOutcome {
  outcome: GateOutcome;
  tone: Tone;
  atMs: number;
}

export interface RunSnapshot {
  birdChao: number;
  voiced: boolean;
  pinned: "high" | "low" | null;
  trail: TrailSample[];
  gates: GateView[];
  activeGate: ActiveGateView | null;
  upcoming: { tone: Tone; msUntil: number } | null;
  cue: CueView | null;
  phase: RunPhase;
  score: number;
  hearts: number;
  comboMult: number;
  over: boolean;
  stats: RunStats;
  lastOutcome: LastOutcome | null;
  noisy: boolean;
  difficulty: Difficulty;
}

const TUTORIAL_TONES: Tone[] = [1, 1, 4, 4, 2, 2, 3, 3];
const TUTORIAL_TOLERANCE_FACTOR = 2;
const TUTORIAL_GATE_COUNT = TUTORIAL_TONES.length;

/** Bird's fixed horizontal position, as a fraction of canvas width. */
export const BIRD_X_FRAC = 0.28;
/** Keep this many gates queued ahead so `upcoming` is always populated. */
const QUEUE_AHEAD = 2;

/** A voiced frame whose chao jumped more than this is treated as erratic (noise hint, PRD §10). */
const ERRATIC_CHAO_DELTA = 1.5;
const NOISE_WINDOW_MS = 3000;
const NOISE_FRACTION = 0.6;
/** Don't shout "it's noisy" off two frames. */
const NOISE_MIN_FRAMES = 30;

const PIN_EPSILON = 1e-3;

/** Upper bound on a single frame's dt, so a backgrounded tab can't skip a gate. */
const MAX_FRAME_DT_MS = 100;

/** PRD §9: the reference cue fires this long before the gate enters the screen. */
export const CUE_LEAD_MS = 300;
/** Length of the audible cue and its demo-dot trace. Mirrors CUE_MS in audio/reference.ts. */
export const CUE_DURATION_MS = 500;
/** "pause" style: still beat after the demo trace before the world resumes. */
export const CUE_PAUSE_HOLD_MS = 500;

/** Outcomes that count as "cleared" for the difficulty ramp (PRD §6). */
const CLEARED_OUTCOMES = new Set<GateOutcome>(["perfect", "good", "ok"]);

interface ActiveGateState {
  gate: Gate;
  samples: GateSample[];
  collided: boolean;
}

interface NoiseFrame {
  t: number;
  erratic: boolean;
}

export class Run {
  private readonly mode: RunMode;
  private readonly width: number;
  private readonly rand: () => number;
  private readonly pace: Pace;
  private readonly corridor: CorridorWidth;
  private readonly cueStyle: CueStyle;

  /** Distance the world has scrolled, in px. The bird's world position. */
  private worldX = 0;
  private difficulty: Difficulty;
  /** Gates spawned and not yet retired, in ascending xStart order. */
  private gates: Gate[] = [];
  /** Tones already spawned — feeds nextTone's repeat guard, and the tutorial cursor. */
  private spawnedTones: Tone[] = [];
  private active: ActiveGateState | null = null;

  /** Gates resolved, whatever the outcome. Ends the tutorial. */
  private gatesFinished = 0;
  /** Gates flown through without collision and with enough signal to score. Drives the ramp. */
  private gatesCleared = 0;
  private stats: RunStats;
  private lastOutcome: LastOutcome | null = null;

  /** Where the bird actually is, in chao — the value scoring uses. */
  private targetChao = REST_CHAO;
  /** Eased render position. Visual only. */
  private displayChao = REST_CHAO;
  private lastVoicedAt = -Infinity;
  private voiced = false;
  private pinned: "high" | "low" | null = null;
  private lastChao: number | null = null;

  /** The current "listen" announcement, cleared when the bird enters its gate. */
  private cue: CueView | null = null;
  /** xStart of the most recently cued gate — gates are cued once, in order. */
  private lastCuedXStart = -Infinity;

  private trail: TrailSample[] = [];
  private noiseFrames: NoiseFrame[] = [];
  private nowMs = 0;

  constructor(cfg: RunConfig) {
    this.mode = cfg.mode;
    this.width = cfg.width;
    this.rand = cfg.rand ?? Math.random;
    this.pace = cfg.pace ?? "fast";
    this.corridor = cfg.corridor ?? "normal";
    this.cueStyle = cfg.cueStyle ?? "flow";
    this.difficulty = this.difficultyFor(0);
    this.stats = newRunStats(3);
    this.fillQueue();
  }

  // ---------------------------------------------------------------- ticking

  /**
   * Feeds one analysis frame. Updates the bird's position from voiced pitch,
   * records the gate sample, and checks collision.
   *
   * Unvoiced frames never collide, in grace or out: signal loss is not a wall
   * (PRD §6).
   */
  tickAudio(p: PitchState, nowMs: number): void {
    this.nowMs = nowMs;
    if (this.isOver()) return;
    this.syncActive();

    this.voiced = p.voiced;
    if (p.voiced) {
      this.targetChao = p.smoothedChao;
      this.lastVoicedAt = nowMs;
      this.pinned =
        p.chao !== null && p.chao >= 5 - PIN_EPSILON
          ? "high"
          : p.chao !== null && p.chao <= 1 + PIN_EPSILON
            ? "low"
            : null;
      this.trail.push({ chao: p.smoothedChao, voiced: true, t: nowMs });
      this.pruneTrail(nowMs);
    } else {
      this.pinned = null;
    }

    this.recordNoise(p, nowMs);

    const active = this.active;
    if (!active) return;

    const t = this.progressIn(active.gate);
    const corridor = corridorChaoAt(active.gate.tone, t);
    const errChao = Math.abs(this.targetChao - corridor);
    active.samples.push({
      errChao,
      tolChao: active.gate.tolChao,
      voiced: p.voiced,
    });

    // Only a *voiced* off-corridor frame can start a collision. During grace
    // the dot is held at the player's last real pitch while the corridor keeps
    // moving underneath it — that divergence is the app's interpolation, not a
    // wrong note, and must never cost a heart. An already-voiced collision
    // stays set (the flag is sticky), so grace can sustain but never create.
    if (p.voiced && errChao > active.gate.tolChao) {
      active.collided = true;
    }
  }

  /** Advances the world by `dtMs` and resolves gate activation/retirement. */
  tickFrame(dtMs: number, nowMs: number): void {
    this.nowMs = nowMs;
    if (this.isOver()) return;

    // A backgrounded tab hands back a multi-second dt on resume. Unclamped,
    // the world would jump far enough to skip a whole gate — the player would
    // be scored (or not scored) on a gate they never saw. Same clamp as loop.ts.
    const dt = Math.min(MAX_FRAME_DT_MS, dtMs);

    this.applyUnvoicedDynamics(dt, nowMs);
    this.displayChao +=
      (this.targetChao - this.displayChao) * (1 - Math.exp(-dt / EASE_TAU_MS));

    // "pause" cue style: the world stands still while the demo is traced
    // (plus a beat), so the example and the attempt cannot blur together.
    if (!this.inCuePause(nowMs)) {
      this.worldX += (this.difficulty.scrollSpeed * dt) / 1000;
    }
    this.syncActive();
    this.updateCue(nowMs);
    this.retireOffscreen();
    this.pruneTrail(nowMs);
  }

  private inCuePause(nowMs: number): boolean {
    return (
      this.cueStyle === "pause" &&
      this.cue !== null &&
      nowMs - this.cue.atMs < this.cue.durationMs + CUE_PAUSE_HOLD_MS
    );
  }

  /**
   * "flow" (PRD §9): the cue fires CUE_LEAD_MS before the gate's *leading
   * (right) edge* enters the screen — not before it reaches the bird.
   * "pause": it fires once the gate is fully on screen instead, so the frozen
   * demo trace is visible end to end. Gates are cued once each, in spawn
   * order. The cue is kept (the "listen" phase) until the bird enters the
   * cued gate, then dropped — it is the player's turn.
   */
  private updateCue(nowMs: number): void {
    if (this.cue && this.worldX >= this.cue.xStart) {
      this.cue = null;
    }
    const next = this.gates.find((g) => g.xStart > this.lastCuedXStart);
    if (!next) return;
    const screenRight = this.worldX + this.width * (1 - BIRD_X_FRAC);
    const msUntilOnScreen =
      ((this.gateEnd(next) - screenRight) / this.difficulty.scrollSpeed) * 1000;
    const lead = this.cueStyle === "pause" ? 0 : CUE_LEAD_MS;
    if (msUntilOnScreen <= lead) {
      this.lastCuedXStart = next.xStart;
      this.cue = {
        tone: next.tone,
        xStart: next.xStart,
        atMs: nowMs,
        durationMs: CUE_DURATION_MS,
      };
    }
  }

  // -------------------------------------------------------------- snapshot

  snapshot(): RunSnapshot {
    const active = this.active;
    const upcoming = this.gates.find((g) => g.xStart > this.worldX) ?? null;
    return {
      birdChao: this.displayChao,
      voiced: this.voiced || this.inGrace(this.nowMs),
      pinned: this.pinned,
      trail: this.trail,
      gates: this.gates.map((g) => ({
        tone: g.tone,
        x0: this.screenX(g.xStart),
        x1: this.screenX(g.xStart + g.widthPx),
        tolChao: g.tolChao,
        xStart: g.xStart,
      })),
      activeGate: active
        ? {
            tone: active.gate.tone,
            t: this.progressIn(active.gate),
            tolChao: active.gate.tolChao,
            corridorChao: corridorChaoAt(
              active.gate.tone,
              this.progressIn(active.gate),
            ),
          }
        : null,
      cue: this.cue,
      phase: active ? "active" : this.cue ? "listen" : null,
      upcoming: upcoming
        ? {
            tone: upcoming.tone,
            msUntil:
              ((upcoming.xStart - this.worldX) / this.difficulty.scrollSpeed) *
              1000,
          }
        : null,
      score: this.stats.score,
      hearts: this.stats.hearts,
      comboMult: multiplierFor(this.stats.combo),
      over: this.isOver(),
      stats: this.stats,
      lastOutcome: this.lastOutcome,
      noisy: this.isNoisy(),
      difficulty: this.difficulty,
    };
  }

  // ------------------------------------------------------------- internals

  private isOver(): boolean {
    return this.mode === "tutorial"
      ? this.gatesFinished >= TUTORIAL_GATE_COUNT
      : this.stats.hearts <= 0;
  }

  private inGrace(nowMs: number): boolean {
    const graceMs =
      this.active?.gate.tone === 3 ? T3_GRACE_MS : GRACE_MS;
    return nowMs - this.lastVoicedAt <= graceMs;
  }

  /**
   * PRD §5.3: hold for the grace period, then drift to centre. Inside a T3
   * gate we hold indefinitely rather than drifting — creak is not a mistake.
   */
  private applyUnvoicedDynamics(dtMs: number, nowMs: number): void {
    if (this.voiced) return;
    if (this.active?.gate.tone === 3) return;
    if (this.inGrace(nowMs)) return;

    const step = (DRIFT_CHAO_PER_SEC * dtMs) / 1000;
    const delta = REST_CHAO - this.targetChao;
    this.targetChao +=
      Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
  }

  private screenX(worldPos: number): number {
    return this.width * BIRD_X_FRAC + (worldPos - this.worldX);
  }

  private progressIn(gate: Gate): number {
    const t = (this.worldX - gate.xStart) / gate.widthPx;
    return Math.min(1, Math.max(0, t));
  }

  /** Opens the gate the bird has entered and closes the one it has left. */
  private syncActive(): void {
    if (this.active && this.worldX > this.gateEnd(this.active.gate)) {
      this.finishGate(this.active);
      this.active = null;
      if (this.isOver()) return;
    }
    if (!this.active) {
      const entered = this.gates.find(
        (g) => this.worldX >= g.xStart && this.worldX <= this.gateEnd(g),
      );
      if (entered) {
        this.active = { gate: entered, samples: [], collided: false };
      }
    }
  }

  private gateEnd(gate: Gate): number {
    return gate.xStart + gate.widthPx;
  }

  private finishGate(state: ActiveGateState): void {
    // "When the app isn't sure, it says so rather than scoring you wrong"
    // (PRD §6). A mostly-unvoiced gate reports "couldn't hear that" even if a
    // held-through-grace frame clipped a wall — signal loss must never cost a
    // heart. This is why the collision flag is dropped here, not in scoreGate.
    const voicedFraction =
      state.samples.length === 0
        ? 0
        : state.samples.filter((s) => s.voiced).length / state.samples.length;
    const collided =
      voicedFraction < UNHEARD_VOICED_FLOOR ? false : state.collided;

    const { outcome, accuracy } = scoreGate(state.samples, collided);
    this.gatesFinished += 1;
    this.lastOutcome = {
      outcome,
      tone: state.gate.tone,
      atMs: this.nowMs,
    };
    if (CLEARED_OUTCOMES.has(outcome)) {
      this.gatesCleared += 1;
    }
    // The tutorial teaches: no score, no hearts, no stats to fail against.
    if (this.mode === "game") {
      this.stats = applyGate(this.stats, state.gate.tone, outcome, accuracy);
    }
    // PRD §6 ramps every 5 gates *cleared*. Counting collisions and unheard
    // gates here would speed the game up for exactly the player who is
    // struggling with it.
    this.difficulty = this.difficultyFor(this.gatesCleared);
    this.fillQueue();
  }

  private difficultyFor(gatesCleared: number): Difficulty {
    const base =
      this.mode === "tutorial" ? newDifficulty() : rampDifficulty(gatesCleared);
    const withTutorial =
      this.mode === "tutorial"
        ? { ...base, toleranceH: base.toleranceH * TUTORIAL_TOLERANCE_FACTOR }
        : base;
    return applyCorridorWidth(applyPace(withTutorial, this.pace), this.corridor);
  }

  /** Drops gates that have scrolled off the left edge. */
  private retireOffscreen(): void {
    this.gates = this.gates.filter(
      (g) => this.screenX(this.gateEnd(g)) > -this.width,
    );
  }

  /**
   * Keeps QUEUE_AHEAD gates alive that the bird has not yet passed — the one
   * it is in or approaching, plus its successor — so `upcoming` (which drives
   * the HUD's next-syllable cue and reference audio) is always populated.
   */
  private fillQueue(): void {
    while (
      this.gates.filter((g) => this.gateEnd(g) >= this.worldX).length <
      QUEUE_AHEAD
    ) {
      const tone = this.pickTone();
      if (tone === null) return;
      this.gates.push(makeGate(tone, this.nextSpawnX(), this.difficulty));
      this.spawnedTones.push(tone);
    }
  }

  /** Tutorial follows a fixed order and stops; game mode is endless. */
  private pickTone(): Tone | null {
    if (this.mode === "tutorial") {
      const i = this.spawnedTones.length;
      return i < TUTORIAL_GATE_COUNT ? TUTORIAL_TONES[i] : null;
    }
    return nextTone(this.spawnedTones, this.rand);
  }

  private nextSpawnX(): number {
    const restPx = (this.difficulty.scrollSpeed * this.difficulty.restMs) / 1000;
    const last = this.gates[this.gates.length - 1];
    if (!last) {
      // First gate enters at the right edge, so the player sees it coming.
      return this.worldX + this.width * (1 - BIRD_X_FRAC);
    }
    return Math.max(this.gateEnd(last) + restPx, this.worldX + restPx);
  }

  private pruneTrail(nowMs: number): void {
    const cutoff = nowMs - TRAIL_SECONDS * 1000;
    while (this.trail.length > 0 && this.trail[0].t < cutoff) {
      this.trail.shift();
    }
  }

  /**
   * PRD §10: a voiced-but-jumpy signal usually means a noisy room. We flag it
   * as a non-blocking hint, never as a score penalty.
   */
  private recordNoise(p: PitchState, nowMs: number): void {
    const erratic =
      p.voiced &&
      p.chao !== null &&
      this.lastChao !== null &&
      Math.abs(p.chao - this.lastChao) > ERRATIC_CHAO_DELTA;
    this.noiseFrames.push({ t: nowMs, erratic });
    this.lastChao = p.voiced ? p.chao : null;

    const cutoff = nowMs - NOISE_WINDOW_MS;
    while (this.noiseFrames.length > 0 && this.noiseFrames[0].t < cutoff) {
      this.noiseFrames.shift();
    }
  }

  private isNoisy(): boolean {
    if (this.noiseFrames.length < NOISE_MIN_FRAMES) return false;
    const erratic = this.noiseFrames.filter((f) => f.erratic).length;
    return erratic / this.noiseFrames.length > NOISE_FRACTION;
  }
}
