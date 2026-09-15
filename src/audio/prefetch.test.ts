import { beforeEach, describe, expect, it, vi } from "vitest";

const loadClip = vi.fn((_word: Word) => Promise.resolve());
vi.mock("./reference.ts", () => ({ loadClip: (w: Word) => loadClip(w) }));

import { planPrefetch, prefetchPool } from "./prefetch.ts";
import { CALIBRATION_TONES, Run } from "../game/run.ts";
import { wordsFromCatalog, type Word } from "../game/words.ts";
import type { Tone } from "../game/gates.ts";
import { tuning } from "../game/tuning.ts";
import type { PitchState } from "../pitch/types.ts";

/** 30 words per tone, ids `t<tone>w<n>`, in catalog order — the shipped shape. */
function inventory(): Word[] {
  const rows: Record<string, unknown>[] = [];
  let position = 0;
  for (const tone of [1, 2, 3, 4]) {
    for (let n = 0; n < 30; n++) {
      rows.push({
        id: `t${tone}w${n}`,
        hanzi: "八",
        pinyin: "bā",
        english: "eight",
        tone,
        tones: [tone],
        syllables: 1,
        position: position++,
        status: "published",
        min_tier: "free",
        clip_key: `t${tone}w${n}.wav`,
        duration_s: 1,
        onset_s: null,
        clip_s: null,
        polyline: [
          [0, 4.5],
          [1, 4.5],
        ],
        updated_at: "2026-09-01T00:00:00Z",
      });
    }
  }
  return wordsFromCatalog(rows);
}

const POOL = inventory();

function byId(id: string): Word {
  const w = POOL.find((x) => x.id === id);
  if (!w) throw new Error(`no word ${id}`);
  return w;
}

beforeEach(() => {
  loadClip.mockClear();
});

describe("planPrefetch", () => {
  it("puts every queued (exact) word before any speculative word", () => {
    const queued = [byId("t3w17"), byId("t2w29")];
    const plan = planPrefetch({ mode: "game", queued, pool: POOL, perTone: 8 });
    const ids = plan.map((w) => w.id);
    expect(ids.slice(0, 2)).toEqual(["t3w17", "t2w29"]);
    // ...and neither reappears later in the list.
    expect(ids.filter((i) => i === "t3w17")).toHaveLength(1);
    expect(ids.filter((i) => i === "t2w29")).toHaveLength(1);
  });

  it("caps the speculative tier at perTone words of each tone", () => {
    const plan = planPrefetch({ mode: "game", queued: [], pool: POOL, perTone: 8 });
    expect(plan).toHaveLength(32);
    for (const tone of [1, 2, 3, 4] as Tone[]) {
      expect(plan.filter((w) => w.tone === tone)).toHaveLength(8);
    }
  });

  it("drill speculates only over its own tone", () => {
    const plan = planPrefetch({
      mode: "drill",
      drillTone: 3,
      queued: [byId("t3w0")],
      pool: POOL,
      perTone: 8,
    });
    expect(plan.every((w) => w.tone === 3)).toBe(true);
    expect(plan).toHaveLength(8);
  });

  it("single speculates over nothing — only its own queued word", () => {
    const plan = planPrefetch({
      mode: "single",
      queued: [byId("t4w5")],
      pool: POOL,
      perTone: 8,
    });
    expect(plan.map((w) => w.id)).toEqual(["t4w5"]);
  });

  it("tutorial (incl. the calibration flight) speculates over nothing", () => {
    const plan = planPrefetch({
      mode: "tutorial",
      queued: [byId("t1w0"), byId("t3w0")],
      pool: POOL,
      perTone: 8,
    });
    expect(plan.map((w) => w.id)).toEqual(["t1w0", "t3w0"]);
  });

  it("fetches nothing at all when the mode never plays a clip", () => {
    const plan = planPrefetch({
      mode: "learn",
      queued: [byId("t1w0")],
      pool: POOL,
      perTone: 8,
      cuesUseClips: false,
    });
    expect(plan).toEqual([]);
  });

  it("de-duplicates a word that is both queued and speculative", () => {
    const plan = planPrefetch({
      mode: "game",
      queued: [byId("t1w0")],
      pool: POOL,
      perTone: 8,
    });
    expect(plan.filter((w) => w.id === "t1w0")).toHaveLength(1);
    expect(plan).toHaveLength(32);
  });

  it("perTone 0 leaves only the exact tier", () => {
    const plan = planPrefetch({ mode: "game", queued: [byId("t1w0")], pool: POOL, perTone: 0 });
    expect(plan.map((w) => w.id)).toEqual(["t1w0"]);
  });

  it("ships a speculative cap as a tuning field, not a bare constant", () => {
    // Deliberately not pinning the tuned number — that is the Lab's to move.
    const cap = tuning().prefetchWordsPerTone;
    expect(Number.isFinite(cap)).toBe(true);
    expect(cap).toBeGreaterThan(0);
  });

  it("plans nothing — not the pool — when the run's queue is unreadable", () => {
    // The host passes null when its Run ref is empty. Falling back to the
    // whole pool here is precisely the bulk-first inversion this fixes, and it
    // would fail silently, so the plan must be empty instead.
    expect(planPrefetch({ mode: "game", queued: null, pool: POOL, perTone: 6 })).toEqual([]);
    expect(planPrefetch({ mode: "drill", drillTone: 3, queued: null, pool: POOL, perTone: 6 })).toEqual(
      [],
    );
  });
});

describe("prefetchPool", () => {
  it("requests words in list order, so the exact tier goes out first", () => {
    const plan = planPrefetch({
      mode: "game",
      queued: [byId("t3w17"), byId("t2w29")],
      pool: POOL,
      perTone: 8,
    });
    prefetchPool(plan);
    // Only CONCURRENCY workers start synchronously; those first slots must
    // hold the exact tier, not catalog words 1-4.
    const firstOut = loadClip.mock.calls.map((c) => c[0].id);
    expect(firstOut).toHaveLength(4);
    expect(firstOut.slice(0, 2)).toEqual(["t3w17", "t2w29"]);
  });

  it("never runs more than 4 fetches at once", async () => {
    let inFlight = 0;
    let peak = 0;
    loadClip.mockImplementation((_word: Word) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      return Promise.resolve().then(() => {
        inFlight--;
      });
    });
    prefetchPool(planPrefetch({ mode: "game", queued: [], pool: POOL, perTone: 8 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(peak).toBeLessThanOrEqual(4);
    expect(loadClip).toHaveBeenCalledTimes(32);
    loadClip.mockImplementation((_word: Word) => Promise.resolve());
  });
});

/** An unvoiced frame — the calibration flight scores nothing either way here. */
function silence(): PitchState {
  return {
    f0: null,
    clarity: 0,
    rms: 0,
    voiced: false,
    semitones: null,
    chao: null,
    smoothedChao: 3,
  };
}

describe("the calibration flight's exact tier", () => {
  it("never queues a tone-2 or tone-4 word, over the whole flight", () => {
    const run = new Run({
      mode: "tutorial",
      width: 420,
      words: POOL,
      tutorialTones: CALIBRATION_TONES,
    });
    const seen = new Set<string>();
    let now = 0;
    for (let i = 0; i < 4000; i++) {
      const snap = run.snapshot();
      for (const g of snap.gates) if (g.word) seen.add(g.word.id);
      if (snap.over) break;
      run.tickAudio(silence(), now);
      run.tickFrame(16, now);
      now += 16;
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const id of seen) expect(id.startsWith("t1w") || id.startsWith("t3w")).toBe(true);
    // Four gates, so at most four distinct clips — never a bulk pool.
    expect(seen.size).toBeLessThanOrEqual(CALIBRATION_TONES.length);
  });
});
