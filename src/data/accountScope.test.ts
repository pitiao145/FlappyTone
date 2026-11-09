/**
 * Brief 34: everything the game saves in the browser is per account, except
 * the mic calibration. One browser, two accounts (A, B), switched with and
 * without a sign-out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: "A" as string | null, serverRow: null as { count: number } | null }));

vi.mock("./supabase.ts", () => ({
  warn: vi.fn(),
  currentSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)),
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

import { currentAccountId, noteAccount } from "./accountScope.ts";
import { resetAccountStorageForTests } from "../lib/accountStorage.ts";
import { displayName, setLocalDisplayName } from "./leaderboard.ts";
import { incrementDailyRuns, loadDailyRuns, refreshServerDailyRuns } from "../game/dailyLimit.ts";
import { cacheFromServer, loadRunHistory } from "../game/runHistory.ts";
import { cacheStreakFromServer, loadStreakState } from "../game/streak.ts";
import {
  loadShowPinyin,
  loadSettings,
  loadTheme,
  saveSettings,
  saveShowPinyin,
  saveTheme,
  type CalibrationSettings,
} from "../game/settings.ts";
import { countSwipe, swipesUsed } from "../toneder/dailySwipes.ts";

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
  resetAccountStorageForTests();
  session.userId = "A";
  session.serverRow = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A page load (or in-page login) that resolves to `id`. */
function login(id: string | null): void {
  resetAccountStorageForTests();
  session.userId = id;
  noteAccount(id);
}

function serverStats(userId: string, totalRuns: number) {
  return { userId, displayName: null, totalRuns, bestScore: 100, totalGates: 10, wordIds: ["ma1"], perTarget: [], recent: [] };
}

const calibration: CalibrationSettings = {
  f0Center: 120,
  noiseFloor: 0.01,
  rangeSemitones: 6,
  rangeDownSemitones: 5,
};

describe("accountScope", () => {
  it("falls back to the last saved account before this page noted one", () => {
    noteAccount("A");
    resetAccountStorageForTests();
    expect(currentAccountId()).toBe("A");
    noteAccount(null);
    resetAccountStorageForTests();
    expect(currentAccountId()).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom } as unknown as Storage);
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
    await refreshServerDailyRuns();
    expect(JSON.parse(storageMap["toneflap.daily.server.v2@B"]).count).toBe(0);
    expect(loadDailyRuns().count).toBe(0);
  });

  it("an entry copied to another account fails its checksum", () => {
    login("A");
    for (let i = 0; i < 3; i++) incrementDailyRuns();
    storageMap["toneflap.daily.v2@B"] = storageMap["toneflap.daily.v2@A"];
    login("B");
    expect(loadDailyRuns().count).toBe(0);
  });
});

describe("the board name is per account", () => {
  it("A's name is not used for B; back on A it is A's name", () => {
    login("A");
    setLocalDisplayName("KeenPlover32");
    login("B");
    const bName = displayName();
    expect(bName).not.toBe("KeenPlover32");
    expect(displayName()).toBe(bName);
    login("A");
    expect(displayName()).toBe("KeenPlover32");
  });
});

describe("run history and streak", () => {
  it("after A -> B without sign-out, B sees neither A's runs nor A's streak; A gets them back", () => {
    login("A");
    cacheFromServer(serverStats("A", 11), "A");
    cacheStreakFromServer({ current: 2, best: 2, lastDay: "2026-11-08" });
    login("B");
    expect(loadRunHistory().totalRuns).toBe(0);
    expect(loadStreakState().current).toBe(0);
    login("A");
    expect(loadRunHistory().totalRuns).toBe(11);
    expect(loadStreakState().current).toBe(2);
  });
});

describe("settings: per account, except calibration", () => {
  it("theme, pinyin and the TONEder swipe count follow the account", () => {
    login("A");
    saveTheme("pixel-flappy");
    saveShowPinyin(false);
    countSwipe();
    countSwipe();
    login("B");
    expect(loadTheme()).not.toBe("pixel-flappy");
    expect(loadShowPinyin()).toBe(true);
    expect(swipesUsed()).toBe(0);
    login("A");
    expect(loadTheme()).toBe("pixel-flappy");
    expect(loadShowPinyin()).toBe(false);
    expect(swipesUsed()).toBe(2);
  });

  it("the calibration stays with the browser", () => {
    login("A");
    saveSettings(calibration);
    login("B");
    expect(loadSettings()?.f0Center).toBe(120);
    login(null);
    expect(loadSettings()?.f0Center).toBe(120);
  });
});

describe("migration of values saved before keys were per account", () => {
  it("the first account takes the settings; ownerless name and counts are dropped", () => {
    storageMap["toneflap.theme.v1"] = "pixel-flappy";
    storageMap["toneflap.pinyin.v1"] = "off";
    storageMap["toneflap.identity.v1"] = JSON.stringify({ name: "KeenPlover32" });
    storageMap["toneflap.daily.v1"] = JSON.stringify({ date: "2026-11-08", count: 8, chk: "x" });
    storageMap["toneflap.daily.server.v1"] = JSON.stringify({ date: "2026-11-08", count: 10 });
    login("B");
    expect(loadTheme()).toBe("pixel-flappy");
    expect(loadShowPinyin()).toBe(false);
    expect(displayName()).not.toBe("KeenPlover32");
    expect(loadDailyRuns().count).toBe(0);
    for (const k of ["toneflap.theme.v1", "toneflap.identity.v1", "toneflap.daily.v1", "toneflap.daily.server.v1"]) {
      expect(storageMap[k]).toBeUndefined();
    }
    // Only once: a second account starts from the defaults.
    login("C");
    expect(loadTheme()).not.toBe("pixel-flappy");
  });

  it("the history cache moves only to its own owner, with its streak", () => {
    cacheFromServer(serverStats("A", 11), "A");
    cacheStreakFromServer({ current: 2, best: 2, lastDay: "2026-11-08" });
    login("A");
    expect(loadRunHistory().totalRuns).toBe(11);
    expect(loadStreakState().current).toBe(2);
  });

  it("another account's history cache is dropped", () => {
    cacheFromServer(serverStats("A", 11), "A");
    cacheStreakFromServer({ current: 2, best: 2, lastDay: "2026-11-08" });
    login("B");
    expect(loadRunHistory().totalRuns).toBe(0);
    expect(loadStreakState().current).toBe(0);
    expect(storageMap["toneflap.history.v1"]).toBeUndefined();
  });
});

describe("the old Usage analytics value (brief 35 review)", () => {
  it("stays as the signed-out value and is recorded browser-wide, not given to one account", () => {
    storageMap["toneflap.sharedata.v1"] = "off";
    login("A");
    expect(storageMap["toneflap.sharedata.v1"]).toBe("off");
    expect(storageMap["toneflap.sharedata.v1@A"]).toBeUndefined();
    expect(storageMap["toneflap.sharedata.legacyoff.v1"]).toBe("1");
  });

  it("an old on leaves no legacy marker", () => {
    storageMap["toneflap.sharedata.v1"] = "on";
    login("A");
    expect(storageMap["toneflap.sharedata.legacyoff.v1"]).toBeUndefined();
  });
});
