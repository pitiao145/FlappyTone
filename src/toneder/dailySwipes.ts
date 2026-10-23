/**
 * The app's TONEder daily swipe cap: how many answers this device has given
 * today, per local day. The limit itself is `tierLimits()[tier].tonederSwipesPerDay`.
 *
 * Device-local and not tamper-proof, by decision (brief 20): a guest who
 * clears storage gets a fresh count. Never throws (hard rule 10): blocked
 * storage reads as 0 used.
 */
import { tierLimits, type Tier } from "../game/tiers.ts";

const KEY = "flappytone.toneder.swipes.v1";

/** A local date, `YYYY-MM-DD`. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function store(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Swipes used on `day` (0 for another day, or no storage). */
export function swipesUsed(day: string = localDay(), s: Store | null = store()): number {
  try {
    const v = JSON.parse(s?.getItem(KEY) ?? "null") as { day?: unknown; n?: unknown } | null;
    return v && v.day === day && typeof v.n === "number" && v.n > 0 ? Math.floor(v.n) : 0;
  } catch {
    return 0;
  }
}

/** Counts one swipe on `day`; returns the new total. */
export function countSwipe(day: string = localDay(), s: Store | null = store()): number {
  const n = swipesUsed(day, s) + 1;
  try {
    s?.setItem(KEY, JSON.stringify({ day, n }));
  } catch {
    // A full or blocked storage: the cap just doesn't hold today.
  }
  return n;
}

/** Swipes left today for this tier (`Infinity` for no cap). */
export function swipesLeft(tier: Tier, used: number): number {
  const cap = tierLimits()[tier].tonederSwipesPerDay;
  return Number.isFinite(cap) ? Math.max(0, cap - used) : Infinity;
}
