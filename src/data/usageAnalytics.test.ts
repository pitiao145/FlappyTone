/**
 * Brief 35: the "Usage analytics" switch follows the account. Stricter wins
 * for an unsaved or old browser "off"; a failed account write is retried.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  row: { usage_analytics: true } as { usage_analytics: boolean } | null,
  readError: null as { message: string } | null,
  writeFails: false,
  writes: [] as boolean[],
}));

vi.mock("./supabase.ts", () => ({
  warn: vi.fn(),
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.readError ? null : db.row, error: db.readError }),
        }),
      }),
      update: (v: { usage_analytics: boolean }) => ({
        eq: () => ({
          select: async () => {
            if (db.writeFails) return { data: null, error: { message: "offline" } };
            db.writes.push(v.usage_analytics);
            if (db.row) db.row.usage_analytics = v.usage_analytics;
            return { data: [{ id: "A" }], error: null };
          },
        }),
      }),
    }),
  }),
}));

const switched = vi.hoisted(() => ({ calls: [] as boolean[] }));
vi.mock("../analytics/client.ts", () => ({
  setSharingEnabled: (on: boolean) => switched.calls.push(on),
}));

import { decideUsageAnalytics, OWED_KEY, setUsageAnalytics, syncUsageAnalytics } from "./usageAnalytics.ts";
import { noteAccount } from "./accountScope.ts";
import { resetAccountStorageForTests } from "../lib/accountStorage.ts";

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  } as Storage);
  resetAccountStorageForTests();
  store["toneflap.scoped.v1"] = "1"; // no legacy migration in these tests
  noteAccount("A");
  db.row = { usage_analytics: true };
  db.readError = null;
  db.writeFails = false;
  db.writes = [];
  switched.calls = [];
});

afterEach(() => vi.unstubAllGlobals());

const last = () => switched.calls[switched.calls.length - 1];

describe("decideUsageAnalytics", () => {
  it("browser off (never synced) + account on → off, and the account is written off", () => {
    expect(decideUsageAnalytics({ browser: "off", owed: null, synced: false, account: true })).toEqual({
      on: false,
      write: false,
    });
  });

  it("account off + browser on → off", () => {
    expect(decideUsageAnalytics({ browser: "on", owed: null, synced: true, account: false }).on).toBe(false);
    expect(decideUsageAnalytics({ browser: "on", owed: "on", synced: true, account: false }).on).toBe(false);
    expect(decideUsageAnalytics({ browser: null, owed: null, synced: false, account: false }).on).toBe(false);
  });

  it("an owed off always wins", () => {
    expect(decideUsageAnalytics({ browser: "off", owed: "off", synced: true, account: true })).toEqual({
      on: false,
      write: false,
    });
  });

  it("after a sync, the account decides: turning it on on another device reaches this one", () => {
    expect(decideUsageAnalytics({ browser: "off", owed: null, synced: true, account: true }).on).toBe(true);
  });
});

describe("syncUsageAnalytics", () => {
  it("an old browser off reaches the account and stays off", async () => {
    store["toneflap.sharedata.v1@A"] = "off";
    await syncUsageAnalytics("A");
    expect(last()).toBe(false);
    expect(db.writes).toEqual([false]);
    expect(store["toneflap.sharedata.v1@A"]).toBe("off");
    expect(store[`${OWED_KEY}@A`]).toBeUndefined();
  });

  it("account off + browser on → off, saved in the browser", async () => {
    store["toneflap.sharedata.v1@A"] = "on";
    db.row = { usage_analytics: false };
    await syncUsageAnalytics("A");
    expect(last()).toBe(false);
    expect(store["toneflap.sharedata.v1@A"]).toBe("off");
    expect(store["toneflap.sharedata.v1"]).toBe("off"); // the signed-out value too
    expect(db.writes).toEqual([]);
  });

  it("a fresh browser (private window) follows the account's off", async () => {
    db.row = { usage_analytics: false };
    await syncUsageAnalytics("A");
    expect(switched.calls).toEqual([false]);
  });

  it("a fresh browser with an account that is on turns analytics on", async () => {
    await syncUsageAnalytics("A");
    expect(switched.calls).toEqual([true]);
  });

  it("an unreadable account leaves the switch as it is (held), never on", async () => {
    db.readError = { message: "offline" };
    await syncUsageAnalytics("A");
    expect(switched.calls).not.toContain(true);
  });
});

describe("the Settings toggle", () => {
  it("applies at once and writes the account", async () => {
    await setUsageAnalytics("A", false);
    expect(switched.calls).toEqual([false]);
    expect(store["toneflap.sharedata.v1@A"]).toBe("off");
    expect(db.writes).toEqual([false]);
  });

  it("a failed account write is retried on the next sync", async () => {
    db.writeFails = true;
    await setUsageAnalytics("A", false);
    expect(switched.calls).toEqual([false]);
    expect(store[`${OWED_KEY}@A`]).toBe("off");
    expect(db.row?.usage_analytics).toBe(true);

    db.writeFails = false;
    await syncUsageAnalytics("A");
    expect(db.writes).toEqual([false]);
    expect(db.row?.usage_analytics).toBe(false);
    expect(store[`${OWED_KEY}@A`]).toBeUndefined();
    expect(last()).toBe(false);
  });

  it("never throws, even with storage blocked", async () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom } as unknown as Storage);
    await expect(setUsageAnalytics("A", false)).resolves.toBeUndefined();
    await expect(syncUsageAnalytics("A")).resolves.toBeUndefined();
  });
});
