/**
 * Tier entitlement limits — pure, no `src/data/` imports.
 *
 * Kept free of Supabase so `words.ts`, `dailyLimit.ts` and UI can read limits
 * without pulling the auth/DB graph into their bundle. `src/data/tier.ts`
 * resolves which `Tier` a player is; this file only says what each tier gets.
 */

export type Tier = "guest" | "free" | "pro";

export interface TierLimits {
  runsPerDay: number;
  /** 0 for guest: no per-tone word practice, explore/hum only. */
  wordsPerTone: number;
  visualiserPerTone: boolean;
  leaderboardFull: boolean;
  customization: boolean;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  guest: {
    runsPerDay: 3,
    wordsPerTone: 0,
    visualiserPerTone: false,
    leaderboardFull: false,
    customization: false,
  },
  free: {
    runsPerDay: 10,
    wordsPerTone: 5,
    visualiserPerTone: true,
    leaderboardFull: false,
    customization: false,
  },
  pro: {
    runsPerDay: Infinity,
    wordsPerTone: Infinity,
    visualiserPerTone: true,
    leaderboardFull: true,
    customization: true,
  },
};
