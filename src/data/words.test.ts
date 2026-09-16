/**
 * The catalog read's never-throw contract, which is the whole point of this
 * module: a player whose network, project or browser storage is broken must
 * still get a word list, and must never see a rejected promise.
 *
 * The three tiers — live, cache, bundled fallback — are each asserted on their
 * own, plus the two ways the cache can betray a caller (absent, corrupt).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CATALOG_KEY, catalogFromCache, fetchCatalog } from "./words.ts";
import * as supabaseModule from "./supabase.ts";

vi.mock("./supabase.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase.ts")>();
  return { ...actual, getSupabase: vi.fn(), warn: vi.fn() };
});

/** A published row that `wordsFromCatalog` accepts. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: "ma1",
    hanzi: "媽",
    pinyin: "mā",
    english: "mother",
    tone: 1,
    tones: [1],
    syllables: 1,
    position: 0,
    status: "published",
    min_tier: "free",
    clip_key: "ma1.wav",
    duration_s: 0.8,
    onset_s: 0.1,
    clip_s: 1.0,
    polyline: [
      [0, 4.5],
      [1, 4.5],
    ],
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

/**
 * A stand-in for the PostgREST builder chain. `order` is the thenable end of
 * `from().select().eq().order()`, and every link records its arguments so a
 * test can assert the query that was actually built.
 */
function client(result: { data: unknown; error: unknown } | Error) {
  const order = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  const chain: { eq: (c: string, v: string) => typeof chain; order: typeof order } = {
    eq: null as never,
    order,
  };
  const eq = vi.fn<(column: string, value: string) => typeof chain>().mockReturnValue(chain);
  chain.eq = eq;
  const select = vi.fn<(columns: string) => typeof chain>().mockReturnValue(chain);
  const from = vi.fn<(table: string) => { select: typeof select }>().mockReturnValue({ select });
  return {
    supabase: { from } as unknown as supabaseModule.FlappyToneClient,
    from,
    select,
    eq,
    order,
  };
}

let storageMap: Record<string, string>;

beforeEach(() => {
  storageMap = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storageMap[key] ?? null,
    setItem: (key: string, value: string) => {
      storageMap[key] = value;
    },
    removeItem: (key: string) => {
      delete storageMap[key];
    },
  } as Storage);
  vi.mocked(supabaseModule.warn).mockReset();
  vi.mocked(supabaseModule.getSupabase).mockReset();
});

describe("fetchCatalog", () => {
  it("returns the live rows and caches them", async () => {
    const c = client({ data: [row()], error: null });
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(c.supabase);

    const words = await fetchCatalog();

    expect(words.map((w) => w.id)).toEqual(["ma1"]);
    expect(c.from).toHaveBeenCalledWith("words");
    expect(c.eq).toHaveBeenCalledWith("status", "published");

    const cached = JSON.parse(localStorage.getItem(CATALOG_KEY)!) as {
      savedAt: number;
      rows: unknown[];
    };
    expect(typeof cached.savedAt).toBe("number");
    expect(cached.rows).toHaveLength(1);
  });

  it("falls back to the cache when the live query throws", async () => {
    localStorage.setItem(
      CATALOG_KEY,
      JSON.stringify({ savedAt: Date.now(), rows: [row({ id: "cached" })] }),
    );
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(client(new Error("offline")).supabase);

    const words = await fetchCatalog();

    expect(words.map((w) => w.id)).toEqual(["cached"]);
  });

  it("falls back to the cache when the live query returns an error", async () => {
    localStorage.setItem(
      CATALOG_KEY,
      JSON.stringify({ savedAt: Date.now(), rows: [row({ id: "cached" })] }),
    );
    const c = client({ data: null, error: { message: "permission denied" } });
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(c.supabase);

    expect((await fetchCatalog()).map((w) => w.id)).toEqual(["cached"]);
    expect(supabaseModule.warn).toHaveBeenCalled();
  });

  it("falls back to the bundled export with no client and no cache", async () => {
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(null);

    const words = await fetchCatalog();

    // The shipped inventory, not an empty list: a first-time visitor on a dead
    // network gets a real game, not the tuning defaults.
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((w) => w.polyline.length >= 2)).toBe(true);
  });

  it("ignores a corrupt cache rather than throwing", async () => {
    localStorage.setItem(CATALOG_KEY, "{not json");
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(null);

    // The corrupt value is skipped, not parsed: the bundled export answers.
    await expect(fetchCatalog()).resolves.not.toHaveLength(0);
    expect(catalogFromCache()).toBeNull();
  });

  it("survives a localStorage that throws on every access", () => {
    // Safari private mode, and any browser with site data blocked: the
    // accessors exist and throw. The catalog read must degrade to the bundled
    // export, not to a rejected promise or a lost cache write.
    const blocked = () => {
      throw new Error("storage disabled");
    };
    vi.stubGlobal("localStorage", {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    } as unknown as Storage);
    const c = client({ data: [row()], error: null });
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(c.supabase);

    expect(catalogFromCache()).toBeNull();
    return expect(fetchCatalog()).resolves.not.toHaveLength(0);
  });

  it("filters through word_lists when a listId is given", async () => {
    const c = client({ data: [row()], error: null });
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(c.supabase);

    await fetchCatalog({ listId: "core" });

    expect(c.select.mock.calls[0][0]).toContain("word_lists!inner(list_id)");
    expect(c.eq).toHaveBeenCalledWith("word_lists.list_id", "core");
  });

  it("never rejects, even when the client itself explodes", async () => {
    vi.mocked(supabaseModule.getSupabase).mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(fetchCatalog()).resolves.toBeInstanceOf(Array);
  });
});

describe("catalogFromCache", () => {
  it("returns null with nothing stored", () => {
    expect(catalogFromCache()).toBeNull();
  });

  it("returns the cached words", () => {
    localStorage.setItem(
      CATALOG_KEY,
      JSON.stringify({ savedAt: Date.now(), rows: [row({ id: "cached" })] }),
    );
    expect(catalogFromCache()?.map((w) => w.id)).toEqual(["cached"]);
  });

  it("returns null when the cache holds no usable rows", () => {
    localStorage.setItem(CATALOG_KEY, JSON.stringify({ savedAt: Date.now(), rows: [] }));
    expect(catalogFromCache()).toBeNull();
  });
});
