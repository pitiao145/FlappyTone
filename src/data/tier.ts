/**
 * Resolves which `Tier` the current player is, and holds it as a small store
 * other modules/components can read synchronously.
 *
 * Resolution: paid access wins outright; otherwise a permanent account is
 * "free", anything else (anonymous or signed-out) is "guest". Never throws —
 * a failed lookup just settles to "guest", the safe default.
 */
import { useSyncExternalStore } from "react";

import { getAccount, type AccountStatus } from "./account.ts";
import { fetchHasAccess } from "./entitlements.ts";
import { bumpSessionVersion } from "./sessionVersion.ts";
import { getSupabase } from "./supabase.ts";
import type { Tier } from "../game/tiers.ts";

export function resolveTier(status: AccountStatus, hasAccess: boolean): Tier {
  if (hasAccess) return "pro";
  if (status === "permanent") return "free";
  return "guest";
}

interface TierState {
  tier: Tier;
  loading: boolean;
}

let state: TierState = { tier: "guest", loading: false };
let resolved = false;
const listeners = new Set<() => void>();

function setState(next: TierState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getTier(): Tier {
  return state.tier;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TierState {
  return state;
}

export async function refreshTier(): Promise<void> {
  setState({ tier: state.tier, loading: true });
  let tier: Tier = "guest";
  try {
    const [account, hasAccess] = await Promise.all([getAccount(), fetchHasAccess()]);
    tier = resolveTier(account.status, hasAccess);
  } catch {
    tier = "guest";
  }
  tier = applyDevOverride(tier);
  resolved = true;
  setState({ tier, loading: false });
}

/** Dev-only tier override, read directly (not via `src/dev/`) so this stays
 * out of the module graph src/dev/ would otherwise pull in. Dropped from
 * production by Rollup via the `import.meta.env.DEV` guard (CLAUDE.md rule 7). */
function applyDevOverride(tier: Tier): Tier {
  if (import.meta.env.DEV) {
    try {
      const raw = localStorage.getItem("flappytone.devtier");
      if (raw === "guest" || raw === "free" || raw === "pro") return raw;
    } catch {
      // ignore
    }
  }
  return tier;
}

export function useTier(): Tier {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  if (!resolved && !snapshot.loading) {
    resolved = true;
    void refreshTier();
  }
  return snapshot.tier;
}

const supabase = getSupabase();
if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    void refreshTier();
    // A first, immediate nudge to any component reading account-derived
    // local data — account.ts's `syncAccount()`/`signOut()` bump again once
    // their own localStorage rewrite finishes, which is the bump that
    // matters for correctness; this one just gets status-only UI (e.g. the
    // "Guest player" card) moving without waiting on a sync round trip.
    bumpSessionVersion();
  });
}

/**
 * Re-check entitlements whenever the tab/app regains focus.
 *
 * Covers the case `?purchased=1` can't: a payment finished somewhere that
 * never navigates this page at all. On iOS, an installed home-screen PWA
 * can't load Lemon Squeezy's checkout in its own webview — the OS pops it
 * into a separate Safari overlay, completes the purchase and the redirect
 * back to `?purchased=1` entirely inside that overlay, and dismissing it
 * returns to this page exactly as it was, URL unchanged. Without this, the
 * player would see "free" until they happened to fully reload the app.
 * Guarded on `resolved` so it never races the very first resolution.
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (resolved && document.visibilityState === "visible") void refreshTier();
  });
}
