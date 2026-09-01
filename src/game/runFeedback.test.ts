import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasShownFeedbackToday, markFeedbackShown } from "./runFeedback.ts";

const KEY = "toneflap.runFeedback.v1";

describe("Run feedback shown-today gate", () => {
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

  it("has not been shown when nothing is stored", () => {
    setDay("2026-08-30");
    expect(hasShownFeedbackToday()).toBe(false);
  });

  it("is shown for the rest of the same day after being marked", () => {
    setDay("2026-08-30");
    markFeedbackShown();
    expect(hasShownFeedbackToday()).toBe(true);
  });

  it("is not shown again on the next day", () => {
    setDay("2026-08-30");
    markFeedbackShown();
    setDay("2026-08-31");
    expect(hasShownFeedbackToday()).toBe(false);
  });

  it("does not reset the stored date just from a day change (load() must not decay)", () => {
    setDay("2026-08-30");
    markFeedbackShown();
    setDay("2026-08-31");
    hasShownFeedbackToday(); // a read on a new day
    setDay("2026-08-30");
    // Still true back on the originally-marked day — proves the stored date
    // survived the day-31 read untouched, rather than being reset to "".
    expect(hasShownFeedbackToday()).toBe(true);
  });

  it("falls back to not-shown on corrupt JSON", () => {
    setDay("2026-08-30");
    storageMap[KEY] = "not valid json {";
    expect(hasShownFeedbackToday()).toBe(false);
  });

  it("falls back to not-shown when the checksum is tampered with", () => {
    setDay("2026-08-30");
    markFeedbackShown();
    const stored = JSON.parse(storageMap[KEY]);
    stored.lastShownDate = "2099-01-01"; // edit the date without fixing chk
    storageMap[KEY] = JSON.stringify(stored);
    expect(hasShownFeedbackToday()).toBe(false);
  });
});
