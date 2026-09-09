/**
 * Canonical Guest / Free / Pro (EarlyBird) plan copy — one source of truth so
 * the Progress pricing card, the Profile plan card, and the EarlyBird modal
 * never drift apart. Update features here, not in three JSX files.
 *
 * Run counts and words-per-tone are **derived from `TIER_LIMITS`**, not
 * retyped as prose — the two have already drifted apart once (this file used
 * to say "5 runs a day / all words" while `tiers.ts` said 3/10/unlimited and
 * 0/5/unlimited). Anything else that reads a number out of `TIER_LIMITS`
 * belongs here too.
 */
import { TIER_LIMITS, type Tier } from "../game/tiers.ts";

export const PRO_PRICE = "$19";

export interface PlanFeature {
  label: string;
  /** Not shipped yet — rendered dimmed. */
  soon?: boolean;
}

function runsLabel(tier: Tier): string {
  const n = TIER_LIMITS[tier].runsPerDay;
  return Number.isFinite(n) ? `${n} runs a day` : "Unlimited runs";
}

function wordsLabel(tier: Tier): string {
  const n = TIER_LIMITS[tier].wordsPerTone;
  if (n === 0) return "Free-explore visualiser only, no per-tone word practice";
  if (!Number.isFinite(n)) return "Practise every word, every tone";
  return `Per-tone visualiser practice, ${n} words per tone`;
}

/** Guest column — no signup at all. */
export const GUEST_FEATURES: PlanFeature[] = [
  { label: runsLabel("guest") },
  { label: "Full scored game & calibration" },
  { label: "Share your results" },
  { label: "Local progress, saved on this device" },
  { label: "See your would-be leaderboard place" },
  { label: wordsLabel("guest") },
];

/** Free account column — email signup, no payment. */
export const FREE_FEATURES: PlanFeature[] = [
  { label: runsLabel("free") },
  { label: "Progress saved and synced to your account" },
  { label: "A real entry on the leaderboard, under a generated name" },
  { label: "Basic stats: tone accuracy for your last 5 runs" },
  { label: wordsLabel("free") },
  { label: "HSK / TOCFL word lists (coming soon)", soon: true },
];

/** Pro (EarlyBird) column — what signing up as Pro unlocks. */
export const PRO_FEATURES: string[] = [
  "Help shape future features",
  runsLabel("pro"),
  wordsLabel("pro"),
  "Accuracy per tone across every run, plus its evolution over time",
  "Your average tone shape, and how it evolves over time",
  "Full run history & trends",
  "Tone pair practice",
  "Leaderboard under a name you choose",
  "Customize your bird & profile",
  "Every future feature, as it ships",
];

/** One-line Free summary for compact spots (the Profile plan card). */
export const FREE_SUMMARY = `${runsLabel("free")} · ${TIER_LIMITS.free.wordsPerTone} words per tone · synced progress · a real leaderboard row`;

/** One-line Guest summary, for the same compact spots. */
export const GUEST_SUMMARY = `${runsLabel("guest")} · full game · local progress only`;

export const TIER_LABEL: Record<Tier, string> = {
  guest: "Guest",
  free: "Free",
  pro: "Pro",
};
