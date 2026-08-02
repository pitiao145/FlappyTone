/**
 * Gate scoring, hearts, combo, and per-tone stats — pure game logic.
 * No Web Audio, no React, no canvas. See docs/PRD.md §7.
 */

import type { Tone } from "./gates.ts";

export interface GateSample {
  /** |bird - corridor centre| in chao. */
  errChao: number;
  tolChao: number;
  voiced: boolean;
}

export type GateOutcome = "perfect" | "good" | "ok" | "collision" | "unheard";

/** Below this voiced fraction a gate is "couldn't hear that", not a failure (PRD §6). */
export const UNHEARD_VOICED_FLOOR = 0.6;
const PERFECT_ACCURACY = 0.85;
const GOOD_ACCURACY = 0.6;

/** Scores a single gate from its per-frame samples. PRD §7. */
export function scoreGate(
  samples: GateSample[],
  collided: boolean,
): { outcome: GateOutcome; accuracy: number } {
  if (collided) {
    return { outcome: "collision", accuracy: 0 };
  }

  const voicedSamples = samples.filter((s) => s.voiced);
  const voicedFraction = samples.length === 0 ? 0 : voicedSamples.length / samples.length;

  if (voicedFraction < UNHEARD_VOICED_FLOOR) {
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
  perTone: Record<Tone, { gates: number; accSum: number; unheard: number }>;
}

/** A fresh run: default 3 hearts, zeroed score and per-tone stats. */
export function newRunStats(hearts = 3): RunStats {
  const perTone = {} as RunStats["perTone"];
  for (const tone of [1, 2, 3, 4] as Tone[]) {
    perTone[tone] = { gates: 0, accSum: 0, unheard: 0 };
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
): RunStats {
  const priorCombo = stats.combo;
  const multiplier = multiplierFor(priorCombo);
  const points = Math.round(BASE_POINTS[outcome] * multiplier);
  const combo = comboAfter(outcome, priorCombo);

  const prevTone = stats.perTone[tone];
  const nextTone =
    outcome === "unheard"
      ? { ...prevTone, unheard: prevTone.unheard + 1 }
      : {
          ...prevTone,
          gates: prevTone.gates + 1,
          accSum: prevTone.accSum + accuracy,
        };

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
}

/** Per-tone accuracy breakdown for the game-over screen. */
export function toneBreakdown(stats: RunStats): ToneBreakdownEntry[] {
  return ([1, 2, 3, 4] as Tone[]).map((tone) => {
    const t = stats.perTone[tone];
    return {
      tone,
      pct: t.gates > 0 ? (t.accSum / t.gates) * 100 : null,
      unheard: t.unheard,
      gates: t.gates,
    };
  });
}

/** A one-line takeaway naming the worst tone with >= 2 scored gates, or a generic prompt if none qualify. */
export function takeaway(breakdown: ToneBreakdownEntry[]): string {
  const eligible = breakdown.filter(
    (b): b is ToneBreakdownEntry & { pct: number } =>
      b.pct !== null && b.gates >= MIN_SCORED_GATES_FOR_TAKEAWAY,
  );
  if (eligible.length === 0) {
    return "Play a longer run for a per-tone read.";
  }
  const worst = eligible.reduce((min, b) => (b.pct < min.pct ? b : min));
  return `Tone ${worst.tone} is your weak spot — ${TONE_TAKEAWAY_CUE[worst.tone]}.`;
}
