/**
 * `loadClip`'s failure behaviour — the half of the clip path that has to be
 * right when R2, the Worker, or the network is not.
 *
 * None of these cases decodes anything, so no AudioContext is involved: the
 * point of every one of them is that the fetch never gets far enough to need
 * one, and the caller still gets a resolved promise (→ the synthetic sweep).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Word } from "../game/words.ts";

const getPlayTicket = vi.fn<() => Promise<string | null>>();
const invalidatePlayTicket = vi.fn();
let baseUrl: string | null = "https://clips.example.com";

vi.mock("./clipToken.ts", () => ({
  get CLIPS_BASE_URL() {
    return baseUrl;
  },
  getPlayTicket: () => getPlayTicket(),
  invalidatePlayTicket: () => invalidatePlayTicket(),
}));

function word(id: string): Word {
  return {
    id,
    hanzi: "媽",
    pinyin: "mā",
    english: "mother",
    tone: 1,
    tones: [1],
    syllables: 1,
    clipKey: `${id}.wav`,
    durationS: 0.5,
    onsetS: 0.1,
    clipS: 0.8,
    polyline: [
      [0, 4.5],
      [1, 4.5],
    ],
    minTier: "free",
    updatedAt: "2026-09-15T00:00:00Z",
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  return await import("./reference.ts");
}

beforeEach(() => {
  baseUrl = "https://clips.example.com";
  getPlayTicket.mockReset().mockResolvedValue("tok-1");
  invalidatePlayTicket.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("loadClip", () => {
  it("asks the Worker for the word id, version-stamped, with the ticket", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const { loadClip } = await load();
    await loadClip(word("ma1"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://clips.example.com/clip/ma1?v=2026-09-15T00%3A00%3A00Z");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("resolves (never rejects) on a 404 — the cue falls back to the sweep", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const { loadClip } = await load();
    await expect(loadClip(word("ma1"))).resolves.toBeUndefined();
  });

  it("resolves on a 403 and does not retry it — a pro word stays refused", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 } as unknown as Response);
    const { loadClip } = await load();
    await loadClip(word("pro1"));
    await loadClip(word("pro1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invalidatePlayTicket).not.toHaveBeenCalled();
  });

  it("resolves when the network throws", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { loadClip } = await load();
    await expect(loadClip(word("ma1"))).resolves.toBeUndefined();
  });

  it("on a 401 invalidates the ticket AND lets the next gate retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
    const { loadClip } = await load();
    await loadClip(word("ma1"));
    expect(invalidatePlayTicket).toHaveBeenCalledTimes(1);
    // The failed load must be out of the `loads` map, or this word would be
    // stuck on a stale-ticket failure for the rest of the session.
    await loadClip(word("ma1"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never fetches when there is no clips base URL", async () => {
    baseUrl = null;
    getPlayTicket.mockResolvedValue(null);
    const { loadClip } = await load();
    await expect(loadClip(word("ma1"))).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never fetches when no ticket could be minted", async () => {
    getPlayTicket.mockResolvedValue(null);
    const { loadClip } = await load();
    await loadClip(word("ma1"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("prefetchPool", () => {
  it("fetches every word, at most 4 in flight, and never rejects", async () => {
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return { ok: false, status: 404 } as unknown as Response;
    });
    await load(); // same module graph as prefetch's own import
    const { prefetchPool } = await import("./prefetch.ts");
    const words = Array.from({ length: 12 }, (_, i) => word(`w${i}`));
    prefetchPool(words);
    // Let the queue drain.
    for (let i = 0; i < 200; i++) await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
