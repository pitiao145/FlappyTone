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

vi.mock("./platform.ts", () => ({ isChromeIOS: () => false }));
vi.mock("./session.ts", () => ({ getMicSession: () => null }));

vi.mock("./clipToken.ts", () => ({
  get CLIPS_BASE_URL() {
    return baseUrl;
  },
  getPlayTicket: () => getPlayTicket(),
  invalidatePlayTicket: () => invalidatePlayTicket(),
}));

function word(id: string, speakerId = "jane"): Word {
  return {
    id,
    hanzi: "媽",
    pinyin: "mā",
    speakerId,
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
    listIds: [],
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
    expect(url).toBe("https://clips.example.com/clip/jane/ma1?v=2026-09-15T00%3A00%3A00Z");
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

  it("keys the in-flight map by speaker, so one voice cannot serve another", async () => {
    // Same word id, two speakers: two fetches, not one cache hit serving the
    // wrong voice.
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const { loadClip } = await load();
    await Promise.all([loadClip(word("ma1b")), loadClip(word("ma1b", "mark"))]);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining("/clip/jane/ma1b"),
      expect.stringContaining("/clip/mark/ma1b"),
    ]);
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
  it("fetches the exact tier at once and paces the speculative tail", async () => {
    vi.useFakeTimers();
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
    const { resetClipQueue } = await import("./clipQueue.ts");
    resetClipQueue();
    const words = Array.from({ length: 12 }, (_, i) => word(`w${i}`));
    // First three are the Run's already-queued gates; the rest is the bet.
    prefetchPool(words, { exactCount: 3 });

    // The exact tier is not paced — it is due in seconds, so all three go
    // straight through (lead first and alone, then the other two). The
    // speculative tail only gets the bucket's saved-up burst on top, and then
    // has to wait: this is the behaviour that stopped a run start from
    // tripping the Worker's rate limit.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3 + 3);

    // It still completes, given time.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(4);
    resetClipQueue();
    vi.useRealTimers();
  });

  it("drops speculation whose signal aborted, without rejecting", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    await load();
    const { prefetchPool } = await import("./prefetch.ts");
    const { resetClipQueue } = await import("./clipQueue.ts");
    resetClipQueue();
    const controller = new AbortController();
    prefetchPool(
      Array.from({ length: 12 }, (_, i) => word(`a${i}`)),
      { exactCount: 1, signal: controller.signal },
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    // The lead (and whatever was already on the wire) still went; the rest of
    // the bet was dropped rather than spending the rate budget of whatever
    // screen the player moved to.
    expect(fetchMock.mock.calls.length).toBeLessThan(12);
    resetClipQueue();
    vi.useRealTimers();
  });
});

/**
 * The `clips` map — the decoded buffers — keyed by speaker as well as id.
 *
 * This is the half that decides which audio a player actually *hears*, so it
 * is the one that must not be keyed on `id` alone. `loads` only decides
 * whether a fetch repeats; a bare-`id` `clips` key plays one voice's recording
 * under another's name with no error anywhere.
 *
 * Both tests below fail if `playToneCue`/`cueDurationMsFor` look the word up
 * by `word.id`: jane's clip is the only one ever decoded, so a bare-id lookup
 * finds it for `mark` too.
 */
describe("clips are keyed by speaker, not by word id alone", () => {
  /** Jane's ma1b, decoded and in the map. Nothing is decoded for mark. */
  async function loadJaneClip() {
    const decoded = { duration: 0.8 } as unknown as AudioBuffer;
    const played: AudioBuffer[] = [];
    const node = () => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { setValueCurveAtTime: vi.fn() },
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      set buffer(b: AudioBuffer) {
        played.push(b);
      },
    });
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        currentTime = 0;
        destination = {};
        decodeAudioData = () => Promise.resolve(decoded);
        createBufferSource = node;
        createOscillator = node;
        createGain = node;
        resume = () => Promise.resolve();
      },
    );
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as unknown as Response);
    const mod = await load();
    await mod.loadClip(word("ma1b"));
    return { ...mod, decoded, played };
  }

  it("does not play jane's buffer for mark's same-id word", async () => {
    const { playToneCue, decoded, played } = await loadJaneClip();

    // Jane's own word finds its clip: the fixture is live, not inert.
    expect(playToneCue(1, 200, 6, word("ma1b"))).toBe(true);
    expect(played).toEqual([decoded]);

    // Mark's has none, so the cue must fall back to the synthetic sweep.
    expect(playToneCue(1, 200, 6, word("ma1b", "mark"))).toBe(false);
    expect(played).toEqual([decoded]);
  });

  it("does not report jane's clip length for mark's same-id word", async () => {
    const { cueDurationMsFor } = await loadJaneClip();
    // Jane's loaded clip answers with the decoded clipS; mark's falls back to
    // the word's own catalog length. Same number here (both 0.8s), so assert
    // the distinguishing case: a mark word whose catalog clipS differs.
    const mark = { ...word("ma1b", "mark"), clipS: 2 };
    expect(cueDurationMsFor(word("ma1b"), 1)).toBe(800);
    expect(cueDurationMsFor(mark, 1)).toBe(2000);
  });
});
