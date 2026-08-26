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
  corridorChaoAt,
  corridorToleranceAt,
  makeGate,
  newDifficulty,
  nextTone,
  rampDifficulty,
  type CorridorWidth,
  type Difficulty,
  type Gate,
  type GateShape,
  type Tone,
} from "./gates.ts";
import { pickWord, type Word } from "./words.ts";
import {
  applyClassifierBoost,
  applyGate,
  heardUtterance,
  isDrasticToneMismatch,
  longestUtteranceMs,
  newRunStats,
  multiplierFor,
  scoreGate,
  unheardHint,
  type GateOutcome,
  type GateSample,
  type RunStats,
  type UnheardHint,
} from "./scoring.ts";
import { REST_CHAO } from "./dynamics.ts";
import { DEFAULT_TUNING, tuning } from "./tuning.ts";
import type { PitchState } from "../pitch/types.ts";
import { computeRangeHalves, type RangeHalves } from "../pitch/calibration.ts";
import type { Contour } from "./contours.ts";
import { classifyTone, type ClassifiedTone } from "./toneClassifier.ts";

export type RunMode = "game" | "tutorial" | "single";

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
   * Corridor width chosen by the player (see gates.ts). Defaults to "normal"
   * (the PRD tolerance); the UI passes the persisted choice.
   */
  corridor?: CorridorWidth;
  /**
   * Whether the reference demo plays at all. "pause": the world freezes while
   * the demo is traced, then resumes — a clear call-and-response beat. "off":
   * no clip, no demo trace, no freeze; the corridors simply arrive.
   *
   * There used to be a third setting, "flow", where the clip played over a
   * moving world. It was cut rather than kept as an option: playtesting found
   * it blurred the example into the attempt, and asking a player to choose
   * between two demo *styles* asked them to have an opinion they cannot form
   * before playing. On or off is a choice anyone can make.
   */
  cueStyle?: CueStyle;
  /**
   * Audible cue length, in ms, for the word about to be cued. The host wires
   * this to the loaded reference clips (audio/reference.ts cueDurationMsFor)
   * so the demo sweep and pause window match what the player actually hears;
   * queried at cue time because clips finish loading after the Run is
   * constructed. `word` is null when the gate is a bare tone, in which case
   * the tone's synthetic sweep length is the answer. Defaults to
   * CUE_DURATION_MS.
   */
  cueDurationMsFor?: (word: Word | null, tone: Tone) => number;
  /**
   * The clip inventory, from `public/ref/manifest.json`. Omitted or empty, the
   * run builds gates from the tuning defaults and cues them synthetically —
   * which is what a failed manifest fetch degrades to, deliberately.
   */
  words?: Word[];
  /**
   * The one word a "single" mode run flies — a Lab-only mode that flies
   * exactly one hand-picked gate through the real collision/scoring pipeline,
   * then ends. Required when `mode === "single"`, ignored otherwise.
   */
  singleWord?: Word;
}

export type CueStyle = "pause" | "off";

export const CUE_STYLES: CueStyle[] = ["pause", "off"];

export interface TrailSample {
  chao: number;
  voiced: boolean;
  t: number;
  /**
   * Screen x at the moment this snapshot was taken.
   *
   * The trail used to be positioned from age alone, at a fixed fraction of
   * canvas width per second — ~126 px/s against a world scrolling at 220, and
   * diverging further as the difficulty ramp raised scroll speed but not the
   * trail. Your trace was drawn horizontally compressed against the very
   * corridor it is meant to be compared with, which is the one visual PRD §8
   * calls the whole product. Positions now come from the world, so the trace
   * and the corridor share a coordinate frame through speed ramps and cue
   * pauses alike.
   */
  x: number;
  /**
   * How far off the corridor centre this sample was, in units of the local
   * tolerance — 0 dead centre, 1 at the wall. Null outside a gate, where
   * there is no corridor to be off.
   *
   * Lets the trail show where the player drifted without any text.
   */
  errRatio: number | null;
}

/** Trail sample as stored: world-space, so screen x is derived per frame. */
interface TrailPoint {
  chao: number;
  voiced: boolean;
  t: number;
  worldX: number;
  errRatio: number | null;
}

export interface GateView {
  tone: Tone;
  /** The word this gate cues and labels. Null when the gate is a bare tone. */
  word: Word | null;
  /** The corridor being drawn. Not always the word's own — see `shapeForWord`. */
  shape: GateShape;
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
  word: Word | null;
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
  /** The clip to play. Null falls back to the tone's synthetic sweep. */
  word: Word | null;
  /** The corridor the demo dot traces — the same one the gate will draw. */
  shape: GateShape;
  /** World-space identity of the cued gate — matches GateView.xStart. */
  xStart: number;
  /** When the cue fired (host clock, same nowMs fed to tick*). */
  atMs: number;
  /** How long the audible cue lasts — drives the freeze window. */
  durationMs: number;
  /** How long the demo dot takes to trace the corridor. Usually the same. */
  sweepMs: number;
  /**
   * How long after `atMs` the demo dot starts moving.
   *
   * The clip begins with the consonant and the corridor does not, so the dot
   * has to sit still through it. Separate from `sweepMs` for the same reason
   * `sweepMs` is separate from `durationMs`: these are three different clocks
   * and folding any two together has broken the demo once already.
   */
  sweepDelayMs: number;
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
  /** 0–1 corridor fit, as scored. Drives how hot the ignition burns. */
  accuracy: number;
  /** Points this gate added, combo multiplier already applied. 0 when none. */
  points: number;
  /** Combo multiplier in force after this gate — the escalation lever. */
  comboMult: number;
  /**
   * The path actually flown through the gate, captured at resolve time.
   *
   * Snapshotted rather than sliced from the live trail on demand because the
   * trail prunes at TRAIL_SECONDS (1.0s) and a T3 gate runs 1.33s — the start
   * of the very contour being celebrated would already have been dropped.
   */
  path: TrailSample[];
  /** Why the gate went unheard, when it did. Null for every other outcome. */
  hint: UnheardHint | null;
  /**
   * The standalone classifier's read of the flown path when it forced this
   * gate's outcome to a collision (`isDrasticToneMismatch`), so the HUD can
   * say what it sounded like instead. Null otherwise, including on a plain
   * wall collision.
   */
  mismatchedAs: ClassifiedTone | null;
  /**
   * The classifier's confidence in `mismatchedAs`, 0–1. Null exactly when
   * `mismatchedAs` is — lets the HUD phrase a near-certain misread ("that
   * was a T3, not a T2") differently from a merely confident one ("that
   * sounded more like a T3").
   */
  mismatchedConfidence: number | null;
  /**
   * The standalone classifier's read of the flown path, whether or not it
   * matched the gate's target — unlike `mismatchedAs`, set on every heard
   * gate the classifier could read at all. Lets the HUD praise a confident
   * *correct* read ("nice T1!") the same way `mismatchedAs` lets it name a
   * confident wrong one. Null when nothing could be classified (too little
   * signal) or the gate went unheard/collided outright.
   */
  classifiedTone: ClassifiedTone | null;
  /** The classifier's confidence in `classifiedTone`, 0–1. Null exactly when `classifiedTone` is. */
  classifiedConfidence: number | null;
}

export interface RunSnapshot {
  birdChao: number;
  voiced: boolean;
  pinned: "high" | "low" | null;
  trail: TrailSample[];
  gates: GateView[];
  activeGate: ActiveGateView | null;
  upcoming: { tone: Tone; word: Word | null; msUntil: number } | null;
  cue: CueView | null;
  phase: RunPhase;
  /** True while the world is frozen for a "pause"-style demo — the renderer dims the scene. */
  cuePaused: boolean;
  score: number;
  hearts: number;
  comboMult: number;
  over: boolean;
  stats: RunStats;
  lastOutcome: LastOutcome | null;
  noisy: boolean;
  difficulty: Difficulty;
  /**
   * Dev instrumentation (spec A2) — every gate this run resolved, oldest
   * first. Uncapped: a run is bounded by 3 hearts, and truncating it meant the
   * first half of a 20-gate measurement was gone by the time anyone read it.
   */
  gateLog: GateLogEntry[];
  /** Voiced runs of >=150ms that occurred while no gate was active. */
  missedUtterances: number;
  /**
   * The range the player actually produced this run, measured the same way
   * calibration measures a preview capture (`computeRangeHalves`). Null
   * until the run is over, or if too few voiced frames were captured.
   */
  measuredRange: RangeHalves | null;
}

const TUTORIAL_TONES: Tone[] = [1, 1, 4, 4, 2, 2, 3, 3];
const TUTORIAL_TOLERANCE_FACTOR = 2;
const TUTORIAL_GATE_COUNT = TUTORIAL_TONES.length;

/**
 * Bird's fixed horizontal position, as a fraction of canvas width.
 *
 * The shipped default, as a convenience alias — live reads go through
 * `birdXFrac()` so the Lab can move it while a run is being flown.
 */
export const BIRD_X_FRAC = DEFAULT_TUNING.birdXFrac;

/**
 * Canvas width `tuning.ts`'s `baseScrollSpeed` (and every other px/s figure
 * derived from it) is authored and measured against — GameApp's mobile
 * `CANVAS_W`. `difficultyFor` scales scrollSpeed by `width / this` so a
 * wider canvas (desktop) doesn't change how long a gate takes to reach the
 * bird, which would desync it from its fixed-length reference audio clip.
 */
export const SCROLL_SPEED_REF_WIDTH = 420;

/** Live bird position. See `Tuning.birdXFrac`. */
export function birdXFrac(): number {
  return tuning().birdXFrac;
}
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

/**
 * How far back a gate will reach for an utterance the player began before it
 * opened. Long enough to cover a whole citation syllable, short enough that
 * unrelated earlier voicing has already fallen out of the buffer.
 */
export const PRE_GATE_BUFFER_MS = 400;

/** One frame of pitch history kept while no gate is active, for pre-gate seeding. */
interface PreGateSample {
  chao: number;
  voiced: boolean;
  atMs: number;
}

/**
 * How long the player must stay outside the corridor for it to count as flying
 * into a wall.
 *
 * A single frame is ~21ms of measurement, not a mistake. Judging collision
 * frame-by-frame made every *contour* tone near-impossible: tolerance is 0.8
 * chao (1.04 on T3), so dividing by how fast each corridor moves gives the
 * phase budget a perfectly-pitched attempt has before it clips a wall — T2
 * 240ms, T3 125ms on the rise, T4 120ms, T1 unlimited because it is flat. A
 * native speaker cleared 90% of T1 gates and 8% of T2/T3/T4 gates, which is
 * the shape of a timing rule, not a pitch rule.
 *
 * Raised 80 → 120ms after the 18-gate run of 4 Aug 2026: a T1 gate collided on
 * an 85ms excursion, close enough to the threshold to be noise, while the two
 * genuine failures ran 469ms and 512ms. Nothing real sits between.
 */
export const COLLISION_SUSTAIN_MS = 120;

interface ActiveGateState {
  gate: Gate;
  samples: GateSample[];
  /** Host clock when the gate opened — bounds the flown path on resolve. */
  enteredAtMs: number;
  collided: boolean;
  /** When the current unbroken out-of-corridor excursion began, or null. */
  outsideSinceMs: number | null;
  /** How many samples were seeded from before the gate opened. Instrumentation. */
  seeded: number;
  /** Longest sustained excursion this gate, in ms. Instrumentation. */
  worstExcursionMs: number;
}

/** `LastOutcome` as stored — path in world space, projected on snapshot. */
interface LastOutcomeState extends Omit<LastOutcome, "path"> {
  path: TrailPoint[];
}

/** Per-gate diagnostics — dev instrumentation, not gameplay (spec A2). */
export interface GateLogEntry {
  tone: Tone;
  outcome: GateOutcome;
  /**
   * The gate's accuracy as `scoreGate` computed it, 0–1.
   *
   * Kept per-gate rather than only summed into `RunStats.perTone.accSum`
   * because a mean cannot tell "everyone scrapes 0.6" from "half score 0.9 and
   * half score 0.3" — and those two ask for opposite changes to the corridor.
   * Always 0 for an unheard gate, which is a neutral outcome, not a bad score;
   * anything aggregating this must exclude them the way `applyGate` does.
   */
  accuracy: number;
  samples: number;
  voiced: number;
  voicedFraction: number;
  utteranceMs: number;
  seeded: number;
  /** Longest unbroken time outside the corridor. >= COLLISION_SUSTAIN_MS means a wall. */
  worstExcursionMs: number;
  atMs: number;
  /**
   * The standalone classifier's independent read of the flown path, or
   * `null` when there wasn't enough signal to classify. Recorded
   * unconditionally so a logged run shows what the recognizer thought even
   * on a gate where it didn't end up affecting scoring.
   */
  classifiedTone: ClassifiedTone | null;
}


/** A voiced run at least this long while no gate is active is a missed attempt. */
const MISSED_UTTERANCE_MS = 150;

interface NoiseFrame {
  t: number;
  erratic: boolean;
}

export class Run {
  private readonly mode: RunMode;
  private readonly width: number;
  private readonly rand: () => number;
  private readonly corridor: CorridorWidth;
  private cueStyle: CueStyle;
  private readonly cueDurationMsFor: (word: Word | null, tone: Tone) => number;

  /** Distance the world has scrolled, in px. The bird's world position. */
  private worldX = 0;
  private difficulty: Difficulty;
  /** Gates spawned and not yet retired, in ascending xStart order. */
  private gates: Gate[] = [];
  /** Tones already spawned — feeds nextTone's repeat guard, and the tutorial cursor. */
  private spawnedTones: Tone[] = [];
  /** Words already spawned — feeds pickWord's don't-repeat-yourself window. */
  private spawnedWords: Word[] = [];
  /** The clip inventory this run draws from. Empty is a valid run. */
  private words: Word[];
  /** The one word a "single" mode run flies. Unused otherwise. */
  private readonly singleWord: Word | null;
  private active: ActiveGateState | null = null;

  /** Gates resolved, whatever the outcome. Ends the tutorial. */
  private gatesFinished = 0;
  /** Gates flown through without collision and with enough signal to score. Drives the ramp. */
  private gatesCleared = 0;
  private stats: RunStats;
  private lastOutcome: LastOutcomeState | null = null;

  /** Every voiced frame's raw semitones this run, whole-run and gate-agnostic. */
  private voicedSemitones: number[] = [];
  /**
   * `computeRangeHalves` on `voicedSemitones`, computed once at run-end.
   * `undefined` means not computed yet; `null` means computed but sparse.
   */
  private suggestedRange: RangeHalves | null | undefined = undefined;

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

  private trail: TrailPoint[] = [];
  private noiseFrames: NoiseFrame[] = [];
  private nowMs = 0;

  /**
   * Recent pitch frames kept while no gate is active, so a gate that opens
   * mid-syllable can claim the part of the syllable that came first.
   */
  private preGate: PreGateSample[] = [];
  /** End of the last resolved gate — never seed a gate from a previous gate's audio. */
  private lastGateEndedAtMs = -Infinity;

  private gateLog: GateLogEntry[] = [];
  /** Voiced runs of >= MISSED_UTTERANCE_MS that happened with no gate active. */
  private missedUtterances = 0;
  private idleRunStartMs: number | null = null;
  private idleRunLastMs = -Infinity;
  private idleRunCounted = false;

  constructor(cfg: RunConfig) {
    this.mode = cfg.mode;
    this.width = cfg.width;
    this.rand = cfg.rand ?? Math.random;
    this.corridor = cfg.corridor ?? "normal";
    this.cueStyle = cfg.cueStyle ?? "pause";
    this.cueDurationMsFor = cfg.cueDurationMsFor ?? (() => CUE_DURATION_MS);
    this.words = cfg.words ?? [];
    this.singleWord = cfg.singleWord ?? null;
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
      if (p.semitones !== null) this.voicedSemitones.push(p.semitones);
      this.pinned =
        p.chao !== null && p.chao >= 5 - PIN_EPSILON
          ? "high"
          : p.chao !== null && p.chao <= 1 + PIN_EPSILON
            ? "low"
            : null;
      this.trail.push({
        chao: p.smoothedChao,
        voiced: true,
        t: nowMs,
        worldX: this.worldX,
        // Filled in below if a gate is running — the corridor is not resolved
        // at this point in the frame.
        errRatio: null,
      });
      this.pruneTrail(nowMs);
    } else {
      this.pinned = null;
    }

    this.recordNoise(p, nowMs);

    const active = this.active;
    if (!active) {
      this.recordPreGate(p.voiced, nowMs);
      return;
    }
    // A gate is running: nothing here can be pre-gate audio for the next one.
    this.preGate = [];

    const t = this.progressIn(active.gate);
    const corridor = corridorChaoAt(active.gate.shape, t);
    const errChao = Math.abs(this.targetChao - corridor);
    // Local, not the gate's base: on a moving stretch of corridor a small
    // timing error is worth more chao than the whole corridor is wide.
    const tolChao = corridorToleranceAt(active.gate.shape, t, active.gate.tolChao);
    active.samples.push({
      errChao,
      tolChao,
      voiced: p.voiced,
      atMs: nowMs,
    });

    // Tag the trail point pushed earlier this frame, so the drawn ribbon can
    // show where the player drifted. Guarded on the timestamp: an unvoiced
    // frame pushes nothing, and tagging a stale point would attribute this
    // frame's error to an older part of the contour.
    const newest = this.trail[this.trail.length - 1];
    if (newest && newest.t === nowMs) {
      newest.errRatio = tolChao > 0 ? errChao / tolChao : null;
    }

    // Only a *voiced* off-corridor frame can start a collision. During grace
    // the dot is held at the player's last real pitch while the corridor keeps
    // moving underneath it — that divergence is the app's interpolation, not a
    // wrong note, and must never cost a heart. An already-voiced collision
    // stays set (the flag is sticky), so grace can sustain but never create.
    //
    // The excursion must also *last*: an unvoiced frame clears the timer
    // rather than bridging two excursions, so signal loss can never be the
    // thing that accumulates into a lost heart.
    if (!p.voiced) {
      active.outsideSinceMs = null;
    } else if (errChao > tolChao) {
      active.outsideSinceMs ??= nowMs;
      const heldMs = nowMs - active.outsideSinceMs;
      active.worstExcursionMs = Math.max(active.worstExcursionMs, heldMs);
      if (heldMs >= tuning().collisionSustainMs) {
        active.collided = true;
      }
    } else {
      active.outsideSinceMs = null;
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

    // "pause" cue style: the world stands still while the demo is traced
    // (plus a beat), so the example and the attempt cannot blur together.
    if (!this.inCuePause(nowMs)) {
      this.worldX += (this.difficulty.scrollSpeed * dt) / 1000;
    }
    // Resolve which gate the bird is in *before* the dynamics read it. Drifting
    // first meant the T3 hold used last frame's gate, so entering a T3 gate
    // while unvoiced still took one drift step toward centre — at the 100ms dt
    // clamp that is half a chao of unearned movement, on the tone whose whole
    // mitigation is "don't move when we can't hear you".
    this.syncActive();
    if (this.isOver()) return;

    this.applyUnvoicedDynamics(dt, nowMs);
    this.displayChao +=
      (this.targetChao - this.displayChao) *
      (1 - Math.exp(-dt / tuning().easeTauMs));

    this.updateCue(nowMs);
    this.retireOffscreen();
    this.pruneTrail(nowMs);
  }

  private inCuePause(nowMs: number): boolean {
    return (
      this.cueStyle === "pause" &&
      this.cue !== null &&
      nowMs - this.cue.atMs < this.cue.durationMs + tuning().cuePauseHoldMs
    );
  }

  /**
   * The cue fires when the gate is close enough to the bird (see below), and is
   * kept — the "listen" phase — until the bird enters that gate, then dropped:
   * it is the player's turn. Gates are cued once each, in spawn order.
   *
   * With the demo off nothing is ever cued, which is the whole implementation
   * of that setting: no clip is requested, no demo trace is drawn, the "listen"
   * banner never shows and `inCuePause` can never be true.
   */
  private updateCue(nowMs: number): void {
    if (this.cueStyle === "off") return;
    if (this.cue && this.worldX >= this.cue.xStart) {
      this.cue = null;
    }
    const next = this.gates.find((g) => g.xStart > this.lastCuedXStart);
    if (!next) return;
    // Spec B3. The world freezes for the demo plus a beat, so what the player
    // waits through after the call is whatever travel the gate has *left*
    // when the cue fires — measured at 1161–1440ms in play, with the HUD
    // still reading "listen…" while they had already begun answering. Fire on
    // remaining travel rather than on "the gate is fully on screen", so the
    // freeze ends roughly as the corridor arrives.
    //
    // One number for every tone, measured to the gate's *start* — the edge
    // the bird enters. It was briefly bounded by "the gate must be fully on
    // screen", because the demo is drawn along the gate's real position; but
    // a wide corridor is by definition close to you by the time it fits, so
    // that bound gave T3 ~197ms of approach against T1's 647ms at normal
    // pace. Reported in play as the pause landing right on top of a T3 gate.
    //
    // The cost of dropping it: at 600ms the gate's start sits 119px ahead of
    // the dot, so T3's right-hand third hangs off the screen and its demo
    // sweep finishes out of view. Chosen deliberately — a uniform beat
    // matters more than seeing the end of the widest trace, and the whole
    // clip is still audible.
    const travelToBirdMs =
      ((next.xStart - this.worldX) / this.difficulty.scrollSpeed) * 1000;
    if (travelToBirdMs <= tuning().cueApproachMs) {
      this.lastCuedXStart = next.xStart;
      this.cue = {
        tone: next.tone,
        word: next.word,
        shape: next.shape,
        xStart: next.xStart,
        atMs: nowMs,
        durationMs: this.cueDurationMsFor(next.word, next.tone),
        // The dot traces the corridor, so it takes the corridor's own time —
        // which is the audible length for every tone but 3, where the gate
        // flies the citation polyline while the clip is a shorter natural take
        // (see `shapeForWord`). Sweeping T3 in the clip's time would show the
        // contour at more than twice the rate the player is scored against,
        // the same failure a flat 500ms synthetic demo caused once already.
        //
        // Deliberately not folded into `durationMs`: that drives the freeze,
        // and the response gap has to stay the same for every tone — a beat
        // that moves with the corridor is what "the pause lands right on top
        // of a T3 gate" was.
        sweepMs: next.shape.durationS * 1000,
        sweepDelayMs: (next.word?.onsetS ?? 0) * 1000,
      };
    }
  }

  /**
   * Hands the run its inventory once the manifest has landed.
   *
   * Gates already spawned keep the corridor they were built with — rebuilding
   * a gate the bird is approaching would move the wall underneath it. In
   * practice the manifest is fetched at app start and resolves long before a
   * run exists; this is the seam for the case where it does not.
   */
  setWords(words: Word[]): void {
    this.words = words;
  }

  /**
   * Turn the demo on or off mid-run, from the pause menu.
   *
   * Live rather than next-run because this is the one option whose effect is
   * obvious the moment you resume, and because turning it off is usually what
   * someone does when the call-and-response beat is in their way *right now*.
   * Corridor width stays next-run: it would move the world under a gate
   * already in flight.
   */
  setCueStyle(style: CueStyle): void {
    this.cueStyle = style;
    // A cue left standing with the demo off would keep the world frozen and
    // the "listen" banner up with nothing playing.
    if (style === "off") this.cue = null;
  }

  // -------------------------------------------------------------- snapshot

  snapshot(): RunSnapshot {
    const active = this.active;
    const upcoming = this.gates.find((g) => g.xStart > this.worldX) ?? null;
    if (this.isOver() && this.suggestedRange === undefined) {
      this.suggestedRange = computeRangeHalves(this.voicedSemitones);
    }
    return {
      birdChao: this.displayChao,
      voiced: this.voiced || this.inGrace(this.nowMs),
      pinned: this.pinned,
      trail: this.trail.map((s) => this.projectTrail(s)),
      gates: this.gates.map((g) => ({
        tone: g.tone,
        word: g.word,
        shape: g.shape,
        x0: this.screenX(g.xStart),
        x1: this.screenX(g.xStart + g.widthPx),
        tolChao: g.tolChao,
        xStart: g.xStart,
      })),
      activeGate: active
        ? {
            tone: active.gate.tone,
            word: active.gate.word,
            t: this.progressIn(active.gate),
            tolChao: corridorToleranceAt(active.gate.shape,
              this.progressIn(active.gate),
              active.gate.tolChao,
            ),
            corridorChao: corridorChaoAt(active.gate.shape,
              this.progressIn(active.gate),
            ),
          }
        : null,
      cue: this.cue,
      phase: active ? "active" : this.cue ? "listen" : null,
      cuePaused: this.inCuePause(this.nowMs),
      upcoming: upcoming
        ? {
            tone: upcoming.tone,
            word: upcoming.word,
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
      lastOutcome: this.lastOutcome
        ? {
            ...this.lastOutcome,
            path: this.lastOutcome.path.map((s) => this.projectTrail(s)),
          }
        : null,
      noisy: this.isNoisy(),
      difficulty: this.difficulty,
      gateLog: this.gateLog,
      missedUtterances: this.missedUtterances,
      measuredRange: this.suggestedRange ?? null,
    };
  }

  // ------------------------------------------------------------- internals

  private isOver(): boolean {
    if (this.mode === "tutorial") return this.gatesFinished >= TUTORIAL_GATE_COUNT;
    if (this.mode === "single") return this.gatesFinished >= 1;
    return this.stats.hearts <= 0;
  }

  private inGrace(nowMs: number): boolean {
    const graceMs =
      this.active?.gate.tone === 3 ? tuning().t3GraceMs : tuning().graceMs;
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

    const step = (tuning().driftChaoPerSec * dtMs) / 1000;
    const delta = REST_CHAO - this.targetChao;
    this.targetChao +=
      Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
  }

  /** World-space trail point → the shape the renderer consumes. */
  private projectTrail(s: TrailPoint): TrailSample {
    return {
      chao: s.chao,
      voiced: s.voiced,
      t: s.t,
      x: this.screenX(s.worldX),
      errRatio: s.errRatio,
    };
  }

  private screenX(worldPos: number): number {
    return this.width * birdXFrac() + (worldPos - this.worldX);
  }

  private progressIn(gate: Gate): number {
    const t = (this.worldX - gate.xStart) / gate.widthPx;
    return Math.min(1, Math.max(0, t));
  }

  /**
   * Keeps the last PRE_GATE_BUFFER_MS of pitch history while no gate is
   * active, and tallies voiced runs that landed with nowhere to go.
   */
  private recordPreGate(voiced: boolean, nowMs: number): void {
    this.preGate.push({ chao: this.targetChao, voiced, atMs: nowMs });
    const cutoff = nowMs - tuning().preGateBufferMs;
    while (this.preGate.length > 0 && this.preGate[0].atMs < cutoff) {
      this.preGate.shift();
    }

    if (!voiced) return;
    if (
      this.idleRunStartMs === null ||
      nowMs - this.idleRunLastMs > tuning().mergeGapMs
    ) {
      this.idleRunStartMs = nowMs;
      this.idleRunCounted = false;
    }
    this.idleRunLastMs = nowMs;
    if (!this.idleRunCounted && nowMs - this.idleRunStartMs >= MISSED_UTTERANCE_MS) {
      this.idleRunCounted = true;
      this.missedUtterances += 1;
    }
  }

  /**
   * Samples of the voiced run that is *still ongoing* as the gate opens, scored
   * against the corridor's starting chao.
   *
   * A player who answers the demo straight away — the call-and-response beat the
   * game itself trains — is mid-syllable when the gate arrives. Without this the
   * whole utterance was discarded and the gate reported "couldn't hear that".
   * Only the ongoing run is taken: stray older voicing must not pre-fill a gate.
   */
  private seedSamples(gate: Gate): GateSample[] {
    const buf = this.preGate;
    if (buf.length === 0 || !buf[buf.length - 1].voiced) return [];

    let i = buf.length - 1;
    while (i > 0) {
      const prev = buf[i - 1];
      if (!prev.voiced) break;
      if (buf[i].atMs - prev.atMs > tuning().mergeGapMs) break;
      if (prev.atMs <= this.lastGateEndedAtMs) break;
      i -= 1;
    }
    // The run must be seen to *begin* inside the buffer. If it is still going
    // at the buffer's oldest frame we cannot tell an answer-to-the-cue from a
    // sustained hum the player never stopped — and crediting the hum would both
    // average in pitch aimed at no corridor and let continuous noise satisfy
    // MIN_UTTERANCE_MS for a gate the player never actually addressed.
    if (i === 0) return [];

    const corridor = corridorChaoAt(gate.shape, 0);
    const tolChao = corridorToleranceAt(gate.shape, 0, gate.tolChao);
    return buf.slice(i).map((s) => ({
      errChao: Math.abs(s.chao - corridor),
      tolChao,
      voiced: s.voiced,
      atMs: s.atMs,
    }));
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
        const samples = this.seedSamples(entered);
        this.active = {
          gate: entered,
          samples,
          enteredAtMs: this.nowMs,
          collided: false,
          outsideSinceMs: null,
          seeded: samples.length,
          worstExcursionMs: 0,
        };
        this.preGate = [];
        this.idleRunStartMs = null;
      }
    }
  }

  private gateEnd(gate: Gate): number {
    return gate.xStart + gate.widthPx;
  }

  /**
   * The flown path re-shaped into what `classifyTone` expects: voiced points
   * only, time-zeroed to the first one. Mirrors the Lab's own
   * `gateResult.lastOutcome.path` → `Contour` conversion (see commit 7bab7ab)
   * so a live-game classification and a single-gate Lab test read the same
   * shape the same way. Null when there's nothing to classify.
   */
  private contourFromPath(path: TrailPoint[]): Contour | null {
    const voiced = path.filter((p) => p.voiced);
    if (voiced.length < 2) return null;
    const startMs = voiced[0].t;
    return {
      points: voiced.map((p) => ({ tMs: p.t - startMs, chao: p.chao })),
      startedAtMs: startMs,
      endedAtMs: voiced[voiced.length - 1].t,
    };
  }

  private finishGate(state: ActiveGateState): void {
    // "When the app isn't sure, it says so rather than scoring you wrong"
    // (PRD §6). A mostly-unvoiced gate reports "couldn't hear that" even if a
    // held-through-grace frame clipped a wall — signal loss must never cost a
    // heart. This is why the collision flag is dropped here, not in scoreGate.
    const heard = heardUtterance(state.samples);
    const collided = heard ? state.collided : false;

    // Only the stretch flown inside the gate — see `lastOutcome.path` below
    // for why the whole trail isn't used.
    const flownPath = this.trail.filter((s) => s.t >= state.enteredAtMs);

    let classifiedTone: ClassifiedTone | null = null;
    let classifiedConfidence: number | null = null;
    let mismatchedAs: ClassifiedTone | null = null;
    let mismatchedConfidence: number | null = null;
    let forcedCollision = false;
    if (heard) {
      // The classifier judges shape alone, so it must see the *whole*
      // utterance, not just whatever fell after the gate opened. A player
      // who starts a hair early has the front of their tone seeded from
      // `preGate` into `state.samples` (see `seedSamples`) — `flownPath`
      // above still cuts at `enteredAtMs` regardless, so using it here would
      // hand the classifier a truncated shape and misread a correct, early
      // attempt as a different tone. `state.samples[0].atMs` is that
      // utterance's real start (seeded samples are unshifted onto the front,
      // so index 0 is always the earliest); trail retention (`TRAIL_SECONDS`)
      // comfortably outlasts the pre-gate buffer window, so it's still there.
      const classifyStartMs =
        state.samples.length > 0 ? state.samples[0].atMs : state.enteredAtMs;
      const classifyPath = this.trail.filter((s) => s.t >= classifyStartMs);
      const contour = this.contourFromPath(classifyPath);
      const classification = contour ? classifyTone(contour) : null;
      classifiedTone = classification?.tone ?? null;
      classifiedConfidence = classification?.confidence ?? null;

      // A confident, drastically-wrong read (T1/T4 confused with anything,
      // or a confident T2<->T3 mixup) costs a heart the same way hitting a
      // wall does — checked before scoring so it flows through the normal
      // collision path rather than a separate outcome type.
      if (
        tuning().toneMismatchCollisionEnabled &&
        isDrasticToneMismatch(state.gate.tone, classification)
      ) {
        forcedCollision = true;
        mismatchedAs = classifiedTone;
        mismatchedConfidence = classifiedConfidence;
      }
    }

    let { outcome, accuracy } = scoreGate(
      state.samples,
      collided || forcedCollision,
    );

    if (
      heard &&
      !forcedCollision &&
      // A confident read of the *correct* tone can raise accuracy/outcome,
      // not just lower it — corridor tracking punishes timing/precision the
      // classifier doesn't care about, so an unmistakable shape can still
      // score well despite a wandering trace.
      tuning().toneClassifierBoostEnabled &&
      classifiedTone === state.gate.tone &&
      classifiedConfidence !== null
    ) {
      ({ outcome, accuracy } = applyClassifierBoost(outcome, accuracy, classifiedConfidence));
    }

    this.gatesFinished += 1;
    this.lastGateEndedAtMs = this.nowMs;
    this.preGate = [];

    const voicedCount = state.samples.filter((s) => s.voiced).length;
    this.gateLog.push({
      tone: state.gate.tone,
      outcome,
      accuracy,
      samples: state.samples.length,
      voiced: voicedCount,
      voicedFraction:
        state.samples.length === 0 ? 0 : voicedCount / state.samples.length,
      utteranceMs: longestUtteranceMs(state.samples),
      seeded: state.seeded,
      worstExcursionMs: state.worstExcursionMs,
      atMs: this.nowMs,
      classifiedTone,
    });

    if (CLEARED_OUTCOMES.has(outcome)) {
      this.gatesCleared += 1;
    }
    // The tutorial teaches: no score, no hearts, no stats to fail against.
    const scoreBefore = this.stats.score;
    if (this.mode === "game") {
      this.stats = applyGate(
        this.stats,
        state.gate.tone,
        outcome,
        accuracy,
        mismatchedAs,
      );
    }

    this.lastOutcome = {
      outcome,
      tone: state.gate.tone,
      atMs: this.nowMs,
      accuracy,
      points: this.stats.score - scoreBefore,
      comboMult: multiplierFor(this.stats.combo),
      // Only the stretch flown inside the gate — the trail also holds the
      // approach and whatever the player did between gates, and igniting that
      // would celebrate pitch aimed at no corridor.
      path: flownPath,
      hint: outcome === "unheard" ? unheardHint(state.samples) : null,
      mismatchedAs,
      mismatchedConfidence,
      classifiedTone: outcome === "collision" ? null : classifiedTone,
      classifiedConfidence: outcome === "collision" ? null : classifiedConfidence,
    };
    // PRD §6 ramps every 5 gates *cleared*. Counting collisions and unheard
    // gates here would speed the game up for exactly the player who is
    // struggling with it.
    this.difficulty = this.difficultyFor(this.gatesCleared);
    this.fillQueue();
  }

  private difficultyFor(gatesCleared: number): Difficulty {
    const base =
      this.mode === "tutorial" ? newDifficulty() : rampDifficulty(gatesCleared);
    // `baseScrollSpeed` (tuning.ts) is authored against SCROLL_SPEED_REF_WIDTH.
    // A wider canvas (desktop) scales scrollSpeed by the same factor as the
    // spawn distance below (`this.width * (1 - birdXFrac())`, also
    // width-proportional), so distance/speed — and with it every cue's
    // timing against its reference audio clip — stays exactly what it was at
    // the reference width, rather than gates reaching the bird later on a
    // wider frame.
    const scaled = {
      ...base,
      scrollSpeed: base.scrollSpeed * (this.width / SCROLL_SPEED_REF_WIDTH),
    };
    const withTutorial =
      this.mode === "tutorial"
        ? { ...scaled, toleranceH: scaled.toleranceH * TUTORIAL_TOLERANCE_FACTOR }
        : scaled;
    return applyCorridorWidth(withTutorial, this.corridor);
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
      // A word if the inventory has one for this tone, the bare tone if not.
      // Not having one is normal, not an error: a build whose manifest fetch
      // failed still plays, on the tuning defaults. "single" mode flies the
      // one word it was handed rather than drawing from the pool.
      const word =
        this.mode === "single"
          ? this.singleWord
          : pickWord(this.words, tone, this.spawnedWords, this.rand);
      this.gates.push(makeGate(word ?? tone, this.nextSpawnX(), this.difficulty));
      this.spawnedTones.push(tone);
      if (word) this.spawnedWords.push(word);
    }
  }

  /**
   * Tutorial follows a fixed order and stops; "single" flies its one word's
   * tone once and stops; game mode is endless.
   */
  private pickTone(): Tone | null {
    if (this.mode === "tutorial") {
      const i = this.spawnedTones.length;
      return i < TUTORIAL_GATE_COUNT ? TUTORIAL_TONES[i] : null;
    }
    if (this.mode === "single") {
      return this.spawnedTones.length < 1 ? (this.singleWord?.tone ?? null) : null;
    }
    return nextTone(this.spawnedTones, this.rand);
  }

  private nextSpawnX(): number {
    const restPx = (this.difficulty.scrollSpeed * this.difficulty.restMs) / 1000;
    const last = this.gates[this.gates.length - 1];
    if (!last) {
      // First gate enters at the right edge, so the player sees it coming.
      return this.worldX + this.width * (1 - birdXFrac());
    }
    return Math.max(this.gateEnd(last) + restPx, this.worldX + restPx);
  }

  private pruneTrail(nowMs: number): void {
    const cutoff = nowMs - tuning().trailSeconds * 1000;
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
