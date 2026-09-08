/**
 * The state machine for "returning from Lemon Squeezy checkout."
 *
 * Split out of any component because the webhook that grants access can land
 * *after* the browser is already back on `/app?purchased=1` — so this must
 * never resolve to "you're not Pro," only to "confirmed" or "still syncing."
 * Framework-free and driven by injected deps so the 10s wait is testable with
 * fake timers, not a real clock.
 */
import { useEffect, useState } from "react";
import { getTier, refreshTier } from "./tier.ts";

export type PurchaseReturnState = "checking" | "confirmed" | "pending";

const POLL_INTERVAL_MS = 1500;
const TOTAL_WAIT_MS = 10_000;

export interface PurchasePollDeps {
  refreshTier: () => Promise<void>;
  getTier: () => ReturnType<typeof getTier>;
  now: () => number;
  delay: (ms: number) => Promise<void>;
}

export const defaultPurchasePollDeps: PurchasePollDeps = {
  refreshTier,
  getTier,
  now: () => Date.now(),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Polls `refreshTier()` until the tier reads "pro" or `TOTAL_WAIT_MS`
 * elapses, reporting each state transition through `onState`. `isCancelled`
 * is checked between every await so an unmounted caller stops cleanly
 * instead of calling `onState` after the fact.
 */
export async function pollPurchaseReturn(
  onState: (state: PurchaseReturnState) => void,
  deps: PurchasePollDeps = defaultPurchasePollDeps,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const start = deps.now();
  onState("checking");
  for (;;) {
    if (isCancelled()) return;
    await deps.refreshTier().catch(() => {});
    if (isCancelled()) return;
    if (deps.getTier() === "pro") {
      onState("confirmed");
      return;
    }
    if (deps.now() - start >= TOTAL_WAIT_MS) {
      onState("pending");
      return;
    }
    await deps.delay(POLL_INTERVAL_MS);
  }
}

/**
 * React wrapper: polls only while `active` is true (gate this on
 * `?purchased=1` being present), resets to "checking" each time `active`
 * flips on, and stops updating state after unmount.
 */
export function usePurchaseReturn(active: boolean): PurchaseReturnState {
  const [state, setState] = useState<PurchaseReturnState>("checking");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setState("checking");
    void pollPurchaseReturn(
      (s) => {
        if (!cancelled) setState(s);
      },
      defaultPurchasePollDeps,
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
  }, [active]);

  return state;
}
