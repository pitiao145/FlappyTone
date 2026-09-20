/**
 * Tier entitlement limits — pure, no `src/data/` imports.
 *
 * Kept free of Supabase so `words.ts`, `dailyLimit.ts` and UI can read limits
 * without pulling the auth/DB graph into their bundle. `src/data/tier.ts`
 * resolves which `Tier` a player is; this file only says what each tier gets.
 *
 * Follows `src/game/tuning.ts`'s accessor pattern (frozen default + a
 * `tierLimits()` getter, `setTierLimits`/`resetTierLimits` for tests/Lab
 * only) rather than a flat exported `Record`, since Pierre expects the
 * TOCFL/proficiency access table below to keep changing by feel as content
 * gets recorded — moving a level between tiers should be a one-line data
 * edit here, never a call-site refactor. As with `tuning.ts`, this is
 * convention-only: nothing stops player-facing code from calling
 * `setTierLimits`, the same accepted risk `tuning.ts` takes.
 */

export type Tier = "guest" | "free" | "pro";
export type Proficiency = "beginner" | "intermediate";
export type TocflLevel = 1 | 2 | 3;

/**
 * What one proficiency (Beginner = single syllable, Intermediate = two
 * syllable) unlocks for a tier.
 *
 * `levels: null` means "no level choice at all" — the pre-game picker is
 * skipped and the pool resolves to that proficiency's fixed sampler list
 * instead (`wordsForList` in `src/game/words.ts`). `allowMix` is meaningless
 * (and never shown) when `levels.length < 2`.
 */
export interface ProficiencyAccess {
  levels: TocflLevel[] | null;
  allowMix: boolean;
}

export interface TierLimits {
  runsPerDay: number;
  /** 0 for guest: no per-tone word practice, explore/hum only. */
  wordsPerTone: number;
  visualiserPerTone: boolean;
  leaderboardFull: boolean;
  customization: boolean;
  beginner: ProficiencyAccess;
  intermediate: ProficiencyAccess;
  /** Tone-pairs mode's per-combo word cap. `Infinity` = unlimited. */
  pairWordsPerCombo: number;
}

export const DEFAULT_TIER_LIMITS: Readonly<Record<Tier, TierLimits>> = Object.freeze({
  guest: {
    runsPerDay: 3,
    wordsPerTone: 0,
    visualiserPerTone: false,
    leaderboardFull: false,
    customization: false,
    beginner: { levels: null, allowMix: false },
    intermediate: { levels: null, allowMix: false },
    // Guest can't reach Tone Pairs mode at all (ModeSelect hides it below
    // free) — 0, not Infinity, so this reads as "no access" rather than
    // implying an unrestricted mode nothing gates.
    pairWordsPerCombo: 0,
  },
  free: {
    runsPerDay: 10,
    wordsPerTone: 5,
    visualiserPerTone: true,
    leaderboardFull: false,
    customization: false,
    beginner: { levels: [1, 2], allowMix: true },
    intermediate: { levels: [1], allowMix: false },
    pairWordsPerCombo: 5,
  },
  pro: {
    runsPerDay: Infinity,
    wordsPerTone: Infinity,
    visualiserPerTone: true,
    leaderboardFull: true,
    customization: true,
    beginner: { levels: [1, 2, 3], allowMix: true },
    intermediate: { levels: [1, 2, 3], allowMix: true },
    pairWordsPerCombo: Infinity,
  },
}) as Readonly<Record<Tier, TierLimits>>;

function clone(t: Readonly<Record<Tier, TierLimits>>): Record<Tier, TierLimits> {
  const out = {} as Record<Tier, TierLimits>;
  for (const tier of Object.keys(t) as Tier[]) {
    out[tier] = { ...t[tier], beginner: { ...t[tier].beginner }, intermediate: { ...t[tier].intermediate } };
  }
  return out;
}

let current: Record<Tier, TierLimits> = clone(DEFAULT_TIER_LIMITS);

/** The values in force right now. Read this per use — never cache it. */
export function tierLimits(): Readonly<Record<Tier, TierLimits>> {
  return current;
}

/** Patches one tier's limits. Dev only; nothing in the player-facing app calls this. */
export function setTierLimits(tier: Tier, patch: Partial<TierLimits>): void {
  current = {
    ...current,
    [tier]: {
      ...current[tier],
      ...patch,
      beginner: { ...current[tier].beginner, ...(patch.beginner ?? {}) },
      intermediate: { ...current[tier].intermediate, ...(patch.intermediate ?? {}) },
    },
  };
}

export function resetTierLimits(): void {
  current = clone(DEFAULT_TIER_LIMITS);
}

/** This tier's allowed levels for a proficiency — `null` means sampler-only. */
export function levelsFor(tier: Tier, proficiency: Proficiency): TocflLevel[] | null {
  return tierLimits()[tier][proficiency].levels;
}
