/**
 * Brief 34: a new account on a used browser starts fresh. One browser, two
 * accounts (A, B), switched with and without a sign-out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: "A" as string | null, serverRow: null as { count: number } | null }));

vi.mock("./supabase.ts", () => ({
  warn: vi.fn(),
  currentSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)),
  ensureAnonSession: vi.fn(),
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: session.userId ? { access_token: "t", user: { id: session.userId } } : null },
      }),
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: session.serverRow, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("./tier.ts", () => ({ getTier: () => "free", tierReady: async () => {} }));

import { currentAccountId, noteAccount, resetAccountScopeForTests } from "./accountScope.ts";
import { consumePendingCheckout, setPendingCheckout } from "./checkoutIntent.ts";
import { consumePendingJoin, setPendingJoin } from "./joinIntent.ts";
import { displayName, setLocalDisplayName } from "./leaderboard.ts";
import { incrementDailyRuns, loadDailyRuns, refreshServerDailyRuns } from "../game/dailyLimit.ts";
import { cacheFromServer, loadRunHistory } from "../game/runHistory.ts";
import { cacheStreakFromServer, loadStreakState } from "../game/streak.ts";

let storageMap: Record<string, string>;

beforeEach(() => {
  storageMap = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storageMap[k] ?? null,
    setItem: (k: string, v: string) => {
      storageMap[k] = v;
    },
    removeItem: (k: string) => {
      delete storageMap[k];
    },
  } as Storage);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T12:00:00"));
  resetAccountScopeForTests();
  session.userId = "A";
  session.serverRow = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A page load (or in-page login) that resolves to `id`. */
function login(id: string | null): void {
  resetAccountScopeForTests();
  session.userId = id;
  noteAccount(id);
}

function serverStats(userId: string, totalRuns: number) {
  return {
    userId,
    displayName: null,
    totalRuns,
    bestScore: 100,
    totalGates: 10,
    wordIds: ["ma1"],
    perTarget: [],
    recent: [],
  };
}

describe("accountScope", () => {
  it("names the change", () => {
    expect(noteAccount("A")).toBe("first");
    expect(noteAccount("A")).toBe("same");
    expect(noteAccount("B")).toBe("switch");
    expect(noteAccount(null)).toBe("signed-out");
    expect(noteAccount("A")).toBe("first");
  });

  it("falls back to the last saved account before this page noted one", () => {
    noteAccount("A");
    resetAccountScopeForTests();
    expect(currentAccountId()).toBe("A");
    noteAccount(null);
    expect(currentAccountId()).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage);
    expect(() => noteAccount("A")).not.toThrow();
    expect(() => loadDailyRuns()).not.toThrow();
    expect(() => incrementDailyRuns()).not.toThrow();
    expect(typeof displayName()).toBe("string");
  });
});

describe("daily runs are per account", () => {
  it("A 10 -> B 0 -> B plays 1 -> A 10, B 1", () => {
    login("A");
    for (let i = 0; i < 10; i++) incrementDailyRuns();
    expect(loadDailyRuns()).toEqual({ count: 10, limit: 10 });

    login("B");
    expect(loadDailyRuns().count).toBe(0);
    incrementDailyRuns();
    expect(loadDailyRuns().count).toBe(1);

    login("A");
    expect(loadDailyRuns().count).toBe(10);
    login("B");
    expect(loadDailyRuns().count).toBe(1);
  });

  it("the same, with a sign-out between the accounts", () => {
    login("A");
    for (let i = 0; i < 10; i++) incrementDailyRuns();
    login(null);
    login("B");
    expect(loadDailyRuns().count).toBe(0);
    login(null);
    login("A");
    expect(loadDailyRuns().count).toBe(10);
  });

  it("A's saved server count never shows for B", async () => {
    login("A");
    session.serverRow = { count: 10 };
    await refreshServerDailyRuns();
    expect(loadDailyRuns().count).toBe(10);

    login("B");
    expect(loadDailyRuns().count).toBe(0);
    login("A");
    expect(loadDailyRuns().count).toBe(10);
  });

  it("refreshServerDailyRuns with no row saves 0 for the current account", async () => {
    login("B");
    session.serverRow = null;
    await refreshServerDailyRuns();
    const saved = JSON.parse(storageMap["toneflap.daily.server.v2"]) as Record<string, { count: number }>;
    expect(saved.B.count).toBe(0);
    expect(loadDailyRuns().count).toBe(0);
  });

  it("drops the old ownerless keys without error", () => {
    storageMap["toneflap.daily.v1"] = JSON.stringify({ date: "2026-11-08", count: 8, chk: "x" });
    storageMap["toneflap.daily.server.v1"] = JSON.stringify({ date: "2026-11-08", count: 10 });
    login("B");
    expect(loadDailyRuns().count).toBe(0);
    expect(storageMap["toneflap.daily.v1"]).toBeUndefined();
    expect(storageMap["toneflap.daily.server.v1"]).toBeUndefined();
  });

  it("an entry copied to another account fails its checksum", () => {
    login("A");
    for (let i = 0; i < 3; i++) incrementDailyRuns();
    const map = JSON.parse(storageMap["toneflap.daily.v2"]) as Record<string, unknown>;
    storageMap["toneflap.daily.v2"] = JSON.stringify({ ...map, B: { ...(map.A as object), count: 0 } });
    login("B");
    expect(loadDailyRuns().count).toBe(0);
  });

  it("keeps only today's entries", () => {
    login("A");
    incrementDailyRuns();
    vi.setSystemTime(new Date("2026-11-09T12:00:00"));
    login("B");
    incrementDailyRuns();
    const map = JSON.parse(storageMap["toneflap.daily.v2"]) as Record<string, unknown>;
    expect(Object.keys(map)).toEqual(["B"]);
  });
});

describe("the board name is per account", () => {
  it("A's saved name is not used for B; back on A it is A's server name", () => {
    login("A");
    setLocalDisplayName("KeenPlover32", "A"); // syncAccount writes the server name down
    expect(displayName()).toBe("KeenPlover32");

    login("B");
    const bName = displayName();
    expect(bName).not.toBe("KeenPlover32");
    expect(displayName()).toBe(bName); // stable for B

    login("A");
    setLocalDisplayName("KeenPlover32", "A"); // A's sync on return
    expect(displayName()).toBe("KeenPlover32");
  });

  it("an ownerless (old-format) name belongs to no account", () => {
    storageMap["toneflap.identity.v1"] = JSON.stringify({ name: "KeenPlover32" });
    login("B");
    expect(displayName()).not.toBe("KeenPlover32");
    expect(displayName("B")).toBe(displayName());
  });
});

describe("run history and streak", () => {
  it("after A -> B without sign-out, B sees neither A's runs nor A's streak", () => {
    login("A");
    cacheFromServer(serverStats("A", 11), "A");
    cacheStreakFromServer({ current: 2, best: 2, lastDay: "2026-11-08" });
    expect(loadRunHistory().totalRuns).toBe(11);

    login("B");
    expect(loadRunHistory().totalRuns).toBe(0);
    expect(loadStreakState().current).toBe(0);
  });

  it("clears another account's cache left behind with no account noted", () => {
    cacheFromServer(serverStats("A", 11), "A");
    cacheStreakFromServer({ current: 2, best: 2, lastDay: "2026-11-08" });
    login("B"); // nothing saved yet: the "first" path
    expect(loadRunHistory().totalRuns).toBe(0);
    expect(loadStreakState().current).toBe(0);
  });

  it("keeps the same account's cache and unowned guest progress", () => {
    login("A");
    cacheFromServer(serverStats("A", 11), "A");
    login("A");
    expect(loadRunHistory().totalRuns).toBe(11);

    // Unowned guest progress (no `owner`), waiting for adoption.
    storageMap = {};
    cacheFromServer(serverStats("x", 1), "x");
    const guest = JSON.parse(storageMap["toneflap.history.v1"]) as Record<string, unknown>;
    delete guest.owner;
    storageMap["toneflap.history.v1"] = JSON.stringify(guest);
    resetAccountScopeForTests();
    noteAccount("B");
    expect(loadRunHistory().totalRuns).toBe(1);
  });
});

describe("pending intents", () => {
  it("an intent set by A is not consumed by B", () => {
    login("A");
    setPendingJoin(500, currentAccountId());
    setPendingCheckout(currentAccountId());
    expect(consumePendingJoin("B")).toBeNull();
    expect(consumePendingCheckout("B")).toBe(false);
  });

  it("an intent set by A is consumed by A", () => {
    login("A");
    setPendingJoin(500, "A");
    setPendingCheckout("A");
    expect(consumePendingJoin("A")).toBe(500);
    expect(consumePendingCheckout("A")).toBe(true);
  });

  it("a switch from A to B clears A's intents", () => {
    login("A");
    setPendingJoin(500, "A");
    setPendingCheckout("A");
    login("B");
    expect(storageMap["toneflap.joinIntent.v1"]).toBeUndefined();
    expect(storageMap["toneflap.checkoutIntent.v1"]).toBeUndefined();
  });

  it("a signed-out intent is consumed by the first account", () => {
    login(null);
    setPendingJoin(700, currentAccountId());
    setPendingCheckout(currentAccountId());
    login("B");
    expect(consumePendingJoin("B")).toBe(700);
    expect(consumePendingCheckout("B")).toBe(true);
  });

  it("old-format (ownerless) intents load without error and count as signed out", () => {
    storageMap["toneflap.joinIntent.v1"] = JSON.stringify({ score: 9, ts: Date.now() });
    storageMap["toneflap.checkoutIntent.v1"] = String(Date.now());
    expect(consumePendingJoin("B")).toBe(9);
    expect(consumePendingCheckout("B")).toBe(true);
  });

  it("expired intents are not consumed", () => {
    setPendingJoin(1, null);
    setPendingCheckout(null);
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(consumePendingJoin("A")).toBeNull();
    expect(consumePendingCheckout("A")).toBe(false);
  });
});
