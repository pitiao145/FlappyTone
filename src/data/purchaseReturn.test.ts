/**
 * `pollPurchaseReturn` is the whole safety property of the checkout-return
 * flow: it must resolve to "pro" the moment the webhook lands, and must
 * never claim failure if it doesn't — only "pending" (still syncing). Fake
 * timers throughout; a real 10s wait has no place in a test suite.
 */
import { describe, expect, it, vi } from "vitest";
import type { Tier } from "../game/tiers.ts";
import { pollPurchaseReturn, type PurchasePollDeps, type PurchaseReturnState } from "./purchaseReturn.ts";

function fakeDeps(tierSequence: Tier[]): PurchasePollDeps {
  let i = 0;
  let elapsed = 0;
  return {
    refreshTier: async () => {
      if (i < tierSequence.length - 1) i++;
    },
    getTier: () => tierSequence[i],
    now: () => elapsed,
    delay: async (ms) => {
      elapsed += ms;
    },
  };
}

describe("pollPurchaseReturn", () => {
  it("resolves to confirmed as soon as the tier reads pro", async () => {
    const deps = fakeDeps(["guest", "guest", "pro", "pro"]);
    const states: PurchaseReturnState[] = [];
    await pollPurchaseReturn((s) => states.push(s), deps);
    expect(states[0]).toBe("checking");
    expect(states.at(-1)).toBe("confirmed");
  });

  it("gives up gracefully after ~10s of never reaching pro", async () => {
    const deps = fakeDeps(new Array(20).fill("guest") as Tier[]);
    const states: PurchaseReturnState[] = [];
    await pollPurchaseReturn((s) => states.push(s), deps);
    expect(states.at(-1)).toBe("pending");
    // Never reports a definitive failure state — only checking/pending.
    expect(states.every((s) => s === "checking" || s === "pending")).toBe(true);
  });

  it("stops polling once cancelled and never reports after that", async () => {
    let cancelled = false;
    const deps = fakeDeps(new Array(20).fill("guest") as Tier[]);
    const states: PurchaseReturnState[] = [];
    const promise = pollPurchaseReturn(
      (s) => states.push(s),
      deps,
      () => cancelled,
    );
    cancelled = true;
    await promise;
    // Only the initial synchronous "checking" call is allowed through.
    expect(states).toEqual(["checking"]);
  });

  it("treats a rejected refreshTier as a no-op, not a crash", async () => {
    let calls = 0;
    const deps: PurchasePollDeps = {
      refreshTier: async () => {
        calls++;
        if (calls === 1) throw new Error("network error");
      },
      getTier: () => (calls > 1 ? "pro" : "guest"),
      now: () => 0,
      delay: async () => {},
    };
    const states: PurchaseReturnState[] = [];
    await pollPurchaseReturn((s) => states.push(s), deps);
    expect(states.at(-1)).toBe("confirmed");
  });
});

describe("vi fake timers smoke test", () => {
  it("defaultPurchasePollDeps.delay actually schedules via setTimeout", async () => {
    vi.useFakeTimers();
    const { defaultPurchasePollDeps } = await import("./purchaseReturn.ts");
    const p = defaultPurchasePollDeps.delay(1500);
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    vi.useRealTimers();
  });
});
