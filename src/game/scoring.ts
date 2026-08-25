/**
 * Gate scoring, hearts, combo, and per-tone stats — pure game logic.
 * No Web Audio, no React, no canvas. See docs/PRD.md §7.
 */

import type { Tone } from "./gates.ts";
import type { ClassifiedTone, ToneClassification } from "./toneClassifier.ts";
import { tuning } from "./tuning.ts";

export interface GateSample {
  /** |bird - corridor centre| in chao. */
  errChao: number;
  tolChao: number;
  voiced: boolean;
  /** Host clock (ms) the frame was analysed at. Duration reasoning needs it. */
  atMs: number;
}

export type GateOutcome = "perfect" | "good" | "ok" | "collision" | "unheard";

/**
 * A voiced run shorter than this is not an attempt — it is a cough or a click.
 *
 * This replaced a *fractional* floor (60% of the gate's frames voiced). A gate
 * is 600ms of travel; a citation-form syllable carries pitch for ~300–400ms of
 * it, so the old rule demanded more voicing than the language produces and
 * "couldn't hear that" fired on roughly half of all real attempts. The right
 * question is not "what proportion of the window was voiced" but "did the
 * player produce an utterance long enough to judge".
 */
export const MIN_UTTERANCE_MS = 180;
/** Voiced runs separated by less than this are one utterance (covers T3 creak). */
export const MERGE_GAP_MS = 120;
const PERFECT_ACCURACY = 0.85;
const GOOD_ACCURACY = 0.6;

/**
 * Ceiling applied to accuracy when the standalone tone classifier
 * (`src/game/toneClassifier.ts`) confidently read a different tone than the
 * one the gate was scoring — just under `GOOD_ACCURACY`, so the outcome it
 * produces can never grade above "ok" no matter how well the pitch trace
 * itself tracked the corridor.
 */
const CLASSIFIER_MISMATCH_ACCURACY_CAP = GOOD_ACCURACY - 0.01;

/**
 * Length of the longest voiced run in `samples`, merging unvoiced gaps shorter
 * than MERGE_GAP_MS. Mirrors the segmentation in src/dev/report.ts.
 *
 * A run's length is the span between its first and last voiced frame, so a
 * lone frame measures 0 — one frame is not a duration.
 */
export function longestUtteranceMs(samples: GateSample[]): number {
  let best = 0;
  let start: number | null = null;
  let lastVoicedAt = 0;

  for (const s of samples) {
    if (!s.voiced) continue;
    if (start === null || s.atMs - lastVoicedAt > tuning().mergeGapMs) {
      start = s.atMs;
    }
    lastVoicedAt = s.atMs;
    best = Math.max(best, lastVoicedAt - start);
  }
  return best;
}

/** Did the player produce anything long enough to score? */
export function heardUtterance(samples: GateSample[]): boolean {
  return longestUtteranceMs(samples) >= tuning().minUtteranceMs;
}

/**
 * Why a gate went unheard — the difference between "I heard nothing" and "I
 * heard something too brief to judge".
 *
 * "When the app isn't sure, it says so rather than scoring you wrong" (PRD §6)
 * is stronger when it also says *what* it is unsure about. This is the only
 * moment the game admits doubt, so it is the cheapest place to teach.
 */
export type UnheardHint = "louder" | "longer" | "generic";

/**
 * A voiced run this short is a click or a breath, not a clipped attempt —
 * below it we claim nothing about why.
 */
const HINT_MIN_EVIDENCE_MS = 60;

/**
 * Pick the hint for an unheard gate. Conservative by construction: a wrong
 * hint is worse than a generic one, so anything ambiguous returns "generic".
 *
 * Note this reasons from voicing alone — `GateSample` carries no RMS, so
 * "louder" is inferred from the *absence* of any voiced frame rather than
 * measured quietness. That is the honest reading: if nothing crossed the
 * voicing gate at all, level is the likeliest cause.
 */
export function unheardHint(samples: GateSample[]): UnheardHint {
  if (samples.length === 0) return "generic";
  if (!samples.some((s) => s.voiced)) return "louder";
  const utterance = longestUtteranceMs(samples);
  if (utterance >= HINT_MIN_EVIDENCE_MS) return "longer";
  return "generic";
}

/** Scores a single gate from its per-frame samples. PRD §7. */
export function scoreGate(
  samples: GateSample[],
  collided: boolean,
): { outcome: GateOutcome; accuracy: number } {
  if (collided) {
    return { outcome: "collision", accuracy: 0 };
  }

  const voicedSamples = samples.filter((s) => s.voiced);

  if (!heardUtterance(samples)) {
    return { outcome: "unheard", accuracy: 0 };
  }

  const meanErr =
    voicedSamples.reduce((sum, s) => sum + s.errChao / s.tolChao, 0) /
    voicedSamples.length;
  const accuracy = Math.min(1, Math.max(0, 1 - meanErr));

  const outcome: GateOutcome =
    accuracy >= PERFECT_ACCURACY
      ? "perfect"
      : accuracy >= GOOD_ACCURACY
        ? "good"
        : "ok";

  return { outcome, accuracy };
}

/**
 * Caps a scored gate's outcome/accuracy when the shape the player actually
 * produced was confidently recognized as a *different* tone than the one the
 * gate targeted (`src/game/toneClassifier.ts` via `tuning().toneClassifierGatingEnabled`
 * in `run.ts`). A collision or an unheard gate is untouched — this only
 * softens an outcome that would otherwise be "ok" or better, so hitting the
 * corridor with the wrong tone can no longer score as if it were correct.
 */
export function applyClassifierMismatch(
  outcome: GateOutcome,
  accuracy: number,
): { outcome: GateOutcome; accuracy: number } {
  if (outcome === "collision" || outcome === "unheard") {
    return { outcome, accuracy };
  }
  return {
    outcome: "ok",
    accuracy: Math.min(accuracy, CLASSIFIER_MISMATCH_ACCURACY_CAP),
  };
}

/**
 * Mirrors `applyClassifierMismatch` in the other direction: when the
 * classifier confidently recognizes the *correct* tone, it can raise a
 * gate's accuracy/outcome, not just lower it. Corridor tracking punishes
 * timing/precision the classifier doesn't care about, so a shape that is
 * unmistakably the right tone can still score well even when the pitch
 * trace wandered outside a tight corridor tolerance along the way.
 *
 * `confidence` below `toneClassifierBoostMinConfidence` leaves the gate
 * untouched — this is a reward for being *sure*, not a general softening.
 * Above it, confidence maps linearly onto accuracy between
 * `toneClassifierBoostFloorAccuracy` (at the threshold) and 1 (at
 * confidence 1), and the gate's accuracy becomes whichever is higher: what
 * corridor tracking already earned, or this boost. A collision or an
 * unheard gate is untouched — this only ever raises an "ok" or "good"
 * outcome, never resurrects a wall hit or invents an utterance.
 */
export function applyClassifierBoost(
  outcome: GateOutcome,
  accuracy: number,
  confidence: number,
): { outcome: GateOutcome; accuracy: number } {
  if (outcome === "collision" || outcome === "unheard") {
    return { outcome, accuracy };
  }
  const minConfidence = tuning().toneClassifierBoostMinConfidence;
  if (confidence < minConfidence) {
    return { outcome, accuracy };
  }
  const floor = tuning().toneClassifierBoostFloorAccuracy;
  const frac = Math.min(1, Math.max(0, (confidence - minConfidence) / (1 - minConfidence)));
  const boosted = floor + frac * (1 - floor);
  const nextAccuracy = Math.max(accuracy, boosted);
  const nextOutcome: GateOutcome =
    nextAccuracy >= PERFECT_ACCURACY ? "perfect" : nextAccuracy >= GOOD_ACCURACY ? "good" : outcome;
  return { outcome: nextOutcome, accuracy: nextAccuracy };
}

/**
 * Whether the classifier's confident read of the player's shape is
 * *drastically* different from the gate's target — different enough that
 * this should cost a heart the same way hitting a wall does, not just soften
 * the outcome (`applyClassifierMismatch`).
 *
 * With only four tones, "confidently a different tone than the target" and
 * "T1/T4 confused with anything, or a confident T2↔T3 mixup" are the same
 * set of pairs — every cross-tone confusion is either a {1,4}/{2,3}
 * within-group swap or crosses between the flat/falling tones and the
 * contour tones, and both are drastic by the request's own framing. So the
 * only real gate is confidence: the classifier must clear the same bar
 * `applyClassifierMismatch` already reads
 * (`toneClassifierMinConfidence`/`toneClassifierMarginThreshold`, enforced
 * inside `classifyTone` itself before it ever returns a non-`"none"` tone).
 *
 * A `"none"` read (low confidence / ambiguous) never counts — that stays the
 * existing neutral "couldn't hear that" territory.
 */
export function isDrasticToneMismatch(
  target: Tone,
  classification: ToneClassification | null,
): boolean {
  if (classification === null) return false;
  const winner = classification.tone;
  if (winner === "none" || winner === target) return false;
  return classification.confidence >= tuning().toneClassifierMinConfidence;
}

const BASE_POINTS: Record<GateOutcome, number> = {
  perfect: 300,
  good: 150,
  ok: 50,
  collision: 0,
  unheard: 0,
};

/** Points for a gate outcome, scaled by the combo multiplier in effect. */
export function pointsFor(outcome: GateOutcome, combo: number): number {
  return Math.round(BASE_POINTS[outcome] * multiplierFor(combo));
}

/** The combo count after a gate outcome. Perfect/good increment; ok/collision reset; unheard is neutral. */
export function comboAfter(outcome: GateOutcome, combo: number): number {
  if (outcome === "perfect" || outcome === "good") return combo + 1;
  if (outcome === "unheard") return combo;
  return 0;
}

/** Score multiplier for a given combo count: 0->x1, 1->x1.5, 2->x2, >=3->x3. */
export function multiplierFor(combo: number): number {
  if (combo >= 3) return 3;
  if (combo === 2) return 2;
  if (combo === 1) return 1.5;
  return 1;
}

export interface RunStats {
  score: number;
  hearts: number;
  /** Consecutive perfect/good gates. Carried in stats so applyGate can thread it explicitly. */
  combo: number;
  bestMultiplier: number;
  perTone: Record<
    Tone,
    {
      gates: number;
      accSum: number;
      unheard: number;
      /** Gates forced to a collision by `isDrasticToneMismatch`. */
      mismatched: number;
      /** Which wrong tone the classifier heard instead, on those mismatched gates. */
      mismatchedAs: Partial<Record<Tone, number>>;
    }
  >;
}

/** A fresh run: default 3 hearts, zeroed score and per-tone stats. */
export function newRunStats(hearts = 3): RunStats {
  const perTone = {} as RunStats["perTone"];
  for (const tone of [1, 2, 3, 4] as Tone[]) {
    perTone[tone] = { gates: 0, accSum: 0, unheard: 0, mismatched: 0, mismatchedAs: {} };
  }
  return { score: 0, hearts, combo: 0, bestMultiplier: 1, perTone };
}

/**
 * Folds a gate's outcome into run stats. Mutate-free: returns a new object,
 * `stats` is left untouched. Collisions cost a heart; unheard gates cost
 * nothing and don't reset the combo, but are tallied per-tone separately
 * from scored (voiced) gates.
 */
export function applyGate(
  stats: RunStats,
  tone: Tone,
  outcome: GateOutcome,
  accuracy: number,
  /** Set when this gate's outcome was forced to a collision by a drastic classifier mismatch. */
  mismatchedAs?: ClassifiedTone | null,
): RunStats {
  const priorCombo = stats.combo;
  const multiplier = multiplierFor(priorCombo);
  const points = Math.round(BASE_POINTS[outcome] * multiplier);
  const combo = comboAfter(outcome, priorCombo);

  const prevTone = stats.perTone[tone];
  const withOutcome =
    outcome === "unheard"
      ? { ...prevTone, unheard: prevTone.unheard + 1 }
      : {
          ...prevTone,
          gates: prevTone.gates + 1,
          accSum: prevTone.accSum + accuracy,
        };
  const nextTone =
    mismatchedAs != null && mismatchedAs !== "none"
      ? {
          ...withOutcome,
          mismatched: withOutcome.mismatched + 1,
          mismatchedAs: {
            ...withOutcome.mismatchedAs,
            [mismatchedAs]: (withOutcome.mismatchedAs[mismatchedAs] ?? 0) + 1,
          },
        }
      : withOutcome;

  return {
    score: stats.score + points,
    hearts: outcome === "collision" ? stats.hearts - 1 : stats.hearts,
    bestMultiplier: Math.max(stats.bestMultiplier, multiplierFor(combo)),
    perTone: { ...stats.perTone, [tone]: nextTone },
    combo,
  };
}

const TONE_TAKEAWAY_CUE: Record<Tone, string> = {
  1: "keep it level",
  2: "it rises, don't start too high",
  3: "it dips before it rises",
  4: "it falls fast — commit to the drop",
};

const MIN_SCORED_GATES_FOR_TAKEAWAY = 2;

export interface ToneBreakdownEntry {
  tone: Tone;
  pct: number | null;
  unheard: number;
  /** Scored (voiced, non-unheard) gates this tone was seen in. Used to gate the takeaway's eligibility. */
  gates: number;
  /** Gates forced to a collision by a confident, drastically-wrong classifier read. */
  mismatched: number;
  /** The wrong tone heard most often on those mismatched gates, or null if none. */
  mismatchedAsMostly: Tone | null;
}

/** Per-tone accuracy breakdown for the game-over screen. */
export function toneBreakdown(stats: RunStats): ToneBreakdownEntry[] {
  return ([1, 2, 3, 4] as Tone[]).map((tone) => {
    const t = stats.perTone[tone];
    const mismatchEntries = Object.entries(t.mismatchedAs) as [
      string,
      number,
    ][];
    const mismatchedAsMostly =
      mismatchEntries.length === 0
        ? null
        : (Number(
            mismatchEntries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0],
          ) as Tone);
    return {
      tone,
      pct: t.gates > 0 ? (t.accSum / t.gates) * 100 : null,
      unheard: t.unheard,
      gates: t.gates,
      mismatched: t.mismatched,
      mismatchedAsMostly,
    };
  });
}

/**
 * A one-line takeaway. Prefers a mismatch-based read when a tone's misses
 * are dominated by the classifier hearing a specific different tone —
 * naming *what it sounded like instead* teaches more than the generic
 * accuracy cue does. Falls back to the plain worst-accuracy phrasing
 * otherwise, or a generic prompt if nothing qualifies.
 */
export function takeaway(breakdown: ToneBreakdownEntry[]): string {
  const eligible = breakdown.filter(
    (b): b is ToneBreakdownEntry & { pct: number } =>
      b.pct !== null && b.gates >= MIN_SCORED_GATES_FOR_TAKEAWAY,
  );
  if (eligible.length === 0) {
    return "Play a longer run for a per-tone read.";
  }
  const worst = eligible.reduce((min, b) => (b.pct < min.pct ? b : min));
  if (
    worst.mismatchedAsMostly !== null &&
    worst.mismatched * 2 >= worst.gates
  ) {
    return `Tone ${worst.tone} gates are landing like Tone ${worst.mismatchedAsMostly} — ${TONE_TAKEAWAY_CUE[worst.tone]}.`;
  }
  return `Tone ${worst.tone} is your weak spot — ${TONE_TAKEAWAY_CUE[worst.tone]}.`;
}
