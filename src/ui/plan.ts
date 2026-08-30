/**
 * Canonical Free / Pro (EarlyBird) plan copy — one source of truth so the
 * Progress pricing card, the Profile plan card, and the EarlyBird modal never
 * drift apart. Update features here, not in three JSX files.
 */

export const PRO_PRICE = "$19";

export interface PlanFeature {
  label: string;
  /** Not shipped yet — rendered dimmed. */
  soon?: boolean;
}

/** What every player has today — mirrors the Progress pricing card's Free column. */
export const FREE_FEATURES: PlanFeature[] = [
  { label: "5 runs a day" },
  { label: "Access to all current words" },
  { label: "Tone accuracy for your last 5 runs" },
  { label: "Last 5 runs of history" },
  { label: "Game modes: shuffle, tone drill, learn" },
  { label: "Sharing your results" },
  { label: "HSK / TOCFL word lists (coming soon)", soon: true },
];

/** What Pro (EarlyBird) unlocks — mirrors the Progress pricing card's Pro column. */
export const PRO_FEATURES: string[] = [
  "Unlimited runs",
  "Accuracy per tone across every run, plus its evolution over time",
  "Your average tone shape, and how it evolves over time",
  "Weekly leaderboards",
  "Full run history & trends",
  "Custom word lists",
  "Vocab mode",
];

/** One-line Free summary for compact spots (the Profile plan card). */
export const FREE_SUMMARY =
  "5 runs/day · all current words · accuracy for your last 5 runs · sharing";
