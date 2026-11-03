import { describe, expect, it, vi } from "vitest";
import {
  SECONDS_PER_WORD,
  englishOf,
  filterWords,
  listProgress,
  minutesLeft,
  percentDone,
  timeLeftLabel,
} from "./boothPlan.ts";
import type { BoothWord } from "./boothWords.ts";

function word(id: string, textbook: BoothWord["textbook"], natural: BoothWord["natural"], lists: string[]): BoothWord {
  return { id, hanzi: "媽", pinyin: "mā", tone: 1, textbook, natural, lists };
}

const words: BoothWord[] = [
  word("a", "pending", "pending", ["core-120"]),
  word("b", "recorded", "pending", ["core-120", "tocfl1"]),
  word("c", "published", "recorded", ["core-120"]),
  word("d", "pending", "published", ["tocfl1"]),
];

describe("listProgress", () => {
  it("counts one list in one style", () => {
    expect(listProgress(words, "core-120", "textbook")).toEqual({ done: 2, total: 3, pending: 1 });
    expect(listProgress(words, "core-120", "natural")).toEqual({ done: 1, total: 3, pending: 2 });
  });

  it("counts every word when no list is selected", () => {
    expect(listProgress(words, null, "textbook")).toEqual({ done: 2, total: 4, pending: 2 });
    expect(listProgress(words, null, "natural")).toEqual({ done: 2, total: 4, pending: 2 });
  });

  it("treats a word without lists as in no list", () => {
    const bare = { ...word("e", "pending", "pending", []), lists: undefined };
    expect(listProgress([bare], "core-120", "textbook")).toEqual({ done: 0, total: 0, pending: 0 });
    expect(listProgress([bare], null, "textbook").total).toBe(1);
  });
});

describe("time left", () => {
  it("uses the shared per-word constant", () => {
    expect(SECONDS_PER_WORD).toBe(4);
    // Core 120 from scratch is the brief's "~8 min".
    expect(minutesLeft(120)).toBe(8);
  });

  it("rounds up, and is 0 only when nothing is left", () => {
    expect(minutesLeft(0)).toBe(0);
    expect(minutesLeft(1)).toBe(1);
    expect(minutesLeft(16)).toBe(2); // 64 s
    expect(minutesLeft(15)).toBe(1); // 60 s
  });

  it("labels short and empty jobs in plain words", () => {
    expect(timeLeftLabel(0)).toBe("nothing left");
    expect(timeLeftLabel(3)).toBe("under a minute left");
    expect(timeLeftLabel(120)).toBe("about 8 min left");
  });

  it("gives a percentage for the bar, an empty list being done", () => {
    expect(percentDone({ done: 1, total: 3, pending: 2 })).toBe(33);
    expect(percentDone({ done: 0, total: 0, pending: 0 })).toBe(100);
  });
});

describe("filterWords", () => {
  it("splits by the active style's status", () => {
    expect(filterWords(words, "all", "textbook")).toHaveLength(4);
    expect(filterWords(words, "todo", "textbook").map((w) => w.id)).toEqual(["a", "d"]);
    expect(filterWords(words, "done", "textbook").map((w) => w.id)).toEqual(["b", "c"]);
    expect(filterWords(words, "done", "natural").map((w) => w.id)).toEqual(["c", "d"]);
  });
});

describe("english", () => {
  it("shows the gloss when there is one", () => {
    expect(englishOf({ ...words[0], english: " mom " })).toBe("mom");
  });

  it("shows a dash when the field is missing or empty", () => {
    expect(englishOf(words[0])).toBe("–");
    expect(englishOf({ ...words[0], english: "" })).toBe("–");
  });

  it("accepts a Worker response without `english` at all", async () => {
    const body = {
      speaker: { id: "ted", name: "Ted" },
      words: [{ id: "a", hanzi: "媽", pinyin: "mā", tone: 1, textbook: "pending", natural: "pending", lists: [] }],
    };
    const fetchImpl = (() =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as unknown as typeof fetch;
    // The base URL is read at import time, so stub it and re-import.
    vi.resetModules();
    vi.stubEnv("VITE_CLIPS_BASE_URL", "https://clips.example.com");
    try {
      const { fetchBoothWords } = await import("./boothWords.ts");
      const res = await fetchBoothWords("x", fetchImpl);
      expect(res.words[0].english).toBeUndefined();
      expect(englishOf(res.words[0])).toBe("–");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
