/**
 * Dev-only tier override control. Reads/writes `flappytone.devtier` from localStorage
 * and refreshes the tier state when changed.
 */
import { refreshTier } from "../data/tier.ts";
import type { Tier } from "../game/tiers.ts";

export function getTierOverride(): Tier | null {
  if (!import.meta.env.DEV) return null;
  try {
    const raw = localStorage.getItem("flappytone.devtier");
    if (raw === "guest" || raw === "free" || raw === "pro") return raw;
  } catch {
    // ignore
  }
  return null;
}

export function setTierOverride(t: Tier | null): void {
  if (!import.meta.env.DEV) return;
  try {
    if (t === null) {
      localStorage.removeItem("flappytone.devtier");
    } else {
      localStorage.setItem("flappytone.devtier", t);
    }
  } catch {
    // ignore
  }
  void refreshTier();
}
