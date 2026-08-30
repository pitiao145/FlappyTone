import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStreak, loadStreak, recordPlay } from "./streak.ts";

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
});
