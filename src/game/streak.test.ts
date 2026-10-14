import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheStreakFromServer, clearStreak, loadStreak, recordPlay, streakStatus } from "./streak.ts";

const KEY = "toneflap.streak.v1";

describe("Daily streak", () => {
  let storageMap: Record<string, string>;

  /** Set the fake clock to a local calendar day (midday, to stay clear of edges). */
  function setDay(iso: string): void {
    vi.setSystemTime(new Date(`${iso}T12:00:00`));
  }

  beforeEach(() => {
    storageMap = {};
    vi.stubGlobal(
      "localStorage",
      {
        getItem: (key: string) => storageMap[key] ?? null,
        setItem: (key: string, value: string) => {
          storageMap[key] = value;
        },
        removeItem: (key: string) => {
          delete storageMap[key];
        },
      } as Storage,
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at zero when nothing is stored", () => {
    setDay("2026-08-30");
    expect(loadStreak()).toEqual({ current: 0, best: 0 });
  });

  it("first play sets current and best to 1", () => {
    setDay("2026-08-30");
    expect(recordPlay()).toEqual({ current: 1, best: 1 });
    expect(loadStreak()).toEqual({ current: 1, best: 1 });
  });

  it("a second play the same day does not advance the streak", () => {
    setDay("2026-08-30");
    recordPlay();
    expect(recordPlay()).toEqual({ current: 1, best: 1 });
  });

  it("playing on consecutive days climbs the streak", () => {
    setDay("2026-08-30");
    recordPlay();
    setDay("2026-08-31");
    expect(recordPlay()).toEqual({ current: 2, best: 2 });
    setDay("2026-09-01");
    expect(recordPlay()).toEqual({ current: 3, best: 3 });
  });

  it("resets to 1 after a full day is missed, keeping best", () => {
    setDay("2026-08-30");
    recordPlay();
    setDay("2026-08-31");
    recordPlay(); // current 2, best 2
    setDay("2026-09-02"); // skipped 09-01
    expect(recordPlay()).toEqual({ current: 1, best: 2 });
  });

  it("loadStreak shows 0 when the streak is broken but keeps best", () => {
    setDay("2026-08-30");
    recordPlay();
    setDay("2026-08-31");
    recordPlay(); // current 2, best 2
    setDay("2026-09-03"); // two clear days missed
    expect(loadStreak()).toEqual({ current: 0, best: 2 });
  });

  it("loadStreak keeps yesterday's streak alive (still extendable today)", () => {
    setDay("2026-08-30");
    recordPlay(); // current 1
    setDay("2026-08-31");
    expect(loadStreak()).toEqual({ current: 1, best: 1 });
  });

  it("falls back to fresh on corrupt JSON", () => {
    setDay("2026-08-30");
    storageMap[KEY] = "not valid json {";
    expect(loadStreak()).toEqual({ current: 0, best: 0 });
  });

  it("falls back to fresh when the checksum is tampered with", () => {
    setDay("2026-08-30");
    recordPlay();
    const stored = JSON.parse(storageMap[KEY]);
    stored.current = 999; // edit the number without fixing chk
    storageMap[KEY] = JSON.stringify(stored);
    expect(loadStreak()).toEqual({ current: 0, best: 0 });
  });

  it("clearStreak removes the stored streak", () => {
    setDay("2026-08-30");
    recordPlay();
    clearStreak();
    expect(loadStreak()).toEqual({ current: 0, best: 0 });
    expect(storageMap[KEY]).toBeUndefined();
  });

  describe("streakStatus (brief 04)", () => {
    it("none when never played", () => {
      setDay("2026-08-30");
      expect(streakStatus()).toEqual({ state: "none", current: 0, best: 0 });
    });

    it("gap 0: done today", () => {
      setDay("2026-08-30");
      recordPlay();
      expect(streakStatus()).toEqual({ state: "done_today", current: 1, best: 1 });
    });

    it("gap 1: at risk, streak still shown", () => {
      setDay("2026-08-29");
      recordPlay();
      setDay("2026-08-30");
      recordPlay();
      setDay("2026-08-31");
      expect(streakStatus()).toEqual({ state: "at_risk", current: 2, best: 2 });
    });

    it("gap 2: broken, best kept", () => {
      setDay("2026-08-29");
      recordPlay();
      setDay("2026-08-31");
      expect(streakStatus()).toEqual({ state: "broken", current: 0, best: 1 });
    });

    it("month and year boundaries count as one day", () => {
      setDay("2026-01-31");
      recordPlay();
      setDay("2026-02-01");
      expect(streakStatus().state).toBe("at_risk");
      setDay("2026-12-31");
      recordPlay();
      setDay("2027-01-01");
      expect(streakStatus().state).toBe("at_risk");
    });

    it("DST change days count as one day (local calendar, not 24h)", () => {
      // Late at night before a spring-forward / fall-back day, early the morning after.
      vi.setSystemTime(new Date("2026-03-07T23:30:00"));
      recordPlay();
      vi.setSystemTime(new Date("2026-03-08T00:30:00"));
      expect(streakStatus().state).toBe("at_risk");
      vi.setSystemTime(new Date("2026-10-31T23:30:00"));
      recordPlay();
      vi.setSystemTime(new Date("2026-11-01T23:30:00"));
      expect(streakStatus().state).toBe("at_risk");
    });

    it("an account streak reads its state from the server's last day (brief 05)", () => {
      // Device 2 never played locally; the server says streak 5, last played yesterday.
      setDay("2026-08-30");
      cacheStreakFromServer({ current: 5, best: 7, lastDay: "2026-08-29" });
      expect(streakStatus()).toEqual({ state: "at_risk", current: 5, best: 7 });
      cacheStreakFromServer({ current: 5, best: 7, lastDay: "2026-08-30" });
      expect(streakStatus().state).toBe("done_today");
      cacheStreakFromServer({ current: 5, best: 7, lastDay: "2026-08-27" });
      expect(streakStatus()).toEqual({ state: "broken", current: 0, best: 7 });
      cacheStreakFromServer({ current: 0, best: 0, lastDay: null });
      expect(streakStatus().state).toBe("none");
    });

    it("an optimistic local play continues a cached server streak", () => {
      setDay("2026-08-30");
      cacheStreakFromServer({ current: 5, best: 5, lastDay: "2026-08-29" });
      expect(recordPlay()).toEqual({ current: 6, best: 6 });
    });
  });
});
