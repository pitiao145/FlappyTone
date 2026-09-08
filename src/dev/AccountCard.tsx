/**
 * Dev-only tier override control: force Auto/Guest/Free/Pro to exercise
 * account UI and gating without needing a real account. Real account actions
 * (sign-up, sign-in, rename, sync) live in `src/ui/AccountCard.tsx` now — this
 * is only the tier toggle. Gated at the mount site in `Profile.tsx` with a
 * lazy import, same pattern as `Lab`/`DevLogin` in `GameApp.tsx` — see
 * CLAUDE.md hard rule 7.
 */
import { useState } from "react";

import { getTierOverride, setTierOverride } from "./tierOverride.ts";
import { useTier } from "../data/tier.ts";
import type { Tier } from "../game/tiers.ts";

export function DevTierCard() {
  const [tierOverride, setTierOverrideLocal] = useState<Tier | null>(() =>
    getTierOverride(),
  );
  const currentTier = useTier();

  function handleTierChange(t: Tier | null) {
    setTierOverride(t);
    setTierOverrideLocal(t);
  }

  return (
    <section className="progress-card">
      <div className="progress-card-header">
        <h3>Dev tier override</h3>
      </div>
      <div className="pace-row">
        <span className="pace-label">Dev tier</span>
        <button
          className={`pace ${tierOverride === null ? "active" : ""}`}
          onClick={() => handleTierChange(null)}
        >
          Auto
        </button>
        <button
          className={`pace ${tierOverride === "guest" ? "active" : ""}`}
          onClick={() => handleTierChange("guest")}
        >
          Guest
        </button>
        <button
          className={`pace ${tierOverride === "free" ? "active" : ""}`}
          onClick={() => handleTierChange("free")}
        >
          Free
        </button>
        <button
          className={`pace ${tierOverride === "pro" ? "active" : ""}`}
          onClick={() => handleTierChange("pro")}
        >
          Pro
        </button>
      </div>
      <p className="note">Resolved: {currentTier}</p>
    </section>
  );
}
