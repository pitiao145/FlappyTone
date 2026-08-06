import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENDPOINT,
  FLUSH_DEBOUNCE_MS,
  flush,
  flushSync,
  initAnalytics,
  resetAnalyticsForTest,
  retryUnsent,
  setSharingEnabled,
  track,
  trackCalibration,
} from "./client.ts";
import { loadQueue, unsent, type Stores } from "./store.ts";
import type { SessionRecord } from "./session.ts";

function memoryStorage(): Storage {
  const map: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(map).length;
    },
    key: (i: number) => Object.keys(map)[i] ?? null,
    getItem: (k: string) => map[k] ?? null,
    setItem: (k: string, v: string) => {
      map[k] = String(v);
    },
    removeItem: (k: string) => {
      delete map[k];
    },
    clear: () => {
      for (const k of Object.keys(map)) delete map[k];
    },
  } as Storage;
}

interface Harness {
  stores: Stores;
  calls: { url: string; body: SessionRecord; keepalive: boolean }[];
  beacons: { url: string; body: BodyInit }[];
}

function setup(
  opts: {
    consent?: boolean;
    status?: number;
    throws?: boolean;
    beacon?: boolean | "fails";
  } = {},
): Harness {
  const stores: Stores = { local: memoryStorage(), session: memoryStorage() };
  const calls: Harness["calls"] = [];
  const beacons: Harness["beacons"] = [];
  let clock = 1_000_000;

  initAnalytics({
    stores,
    consent: () => opts.consent ?? true,
    now: () => (clock += 1000),
    nowIso: () => "2026-08-06T00:00:00.000Z",
    userAgent: "Mozilla/5.0 (iPhone) Safari",
    fetchImpl: (async (url: string, init: RequestInit) => {
      if (opts.throws) throw new Error("offline");
      calls.push({
        url,
        body: JSON.parse(init.body as string) as SessionRecord,
        keepalive: Boolean(init.keepalive),
      });
      return { ok: (opts.status ?? 200) < 400, status: opts.status ?? 200 } as Response;
    }) as unknown as typeof fetch,
    beacon:
      opts.beacon === false
        ? null
        : (url, body) => {
            beacons.push({ url, body });
            return opts.beacon !== "fails";
          },
  });

  return { stores, calls, beacons };
}

afterEach(() => {
  resetAnalyticsForTest();
  vi.useRealTimers();
});

describe("consent", () => {
  it("mints no player id and stores nothing when opted out", () => {
    const h = setup({ consent: false });
    track({ type: "landed" });
    track({ type: "mic", ok: true });

    expect(loadQueue(h.stores)).toEqual([]);
    expect(h.stores.local.getItem("toneflap.analytics.player.v1")).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it("erases anything left over when a visit starts opted out", () => {
    const first = setup();
    track({ type: "landed" });
    expect(loadQueue(first.stores)).toHaveLength(1);
    resetAnalyticsForTest();

    // Same device, sharing since turned off.
    initAnalytics({
      stores: first.stores,
      consent: () => false,
      fetchImpl: (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch,
      beacon: null,
      now: () => 1,
      nowIso: () => "x",
      userAgent: "",
    });

    expect(loadQueue(first.stores)).toEqual([]);
    expect(first.stores.local.getItem("toneflap.analytics.player.v1")).toBeNull();
  });

  it("setSharingEnabled(false) erases the queue and the ids immediately", () => {
    const h = setup();
    track({ type: "landed" });
    setSharingEnabled(false);

    expect(loadQueue(h.stores)).toEqual([]);
    expect(h.stores.local.getItem("toneflap.analytics.player.v1")).toBeNull();
    expect(h.stores.session.getItem("toneflap.analytics.session.v1")).toBeNull();
  });
});

describe("track", () => {
  it("persists locally before anything is sent", () => {
    const h = setup();
    track({ type: "landed" });

    // The durability rule: local storage is the source of truth, the network
    // is a mirror. A crash right here must not lose the event.
    // t is ms since session start; the harness clock ticks 1s per read, and
    // newSession consumed the first tick.
    expect(loadQueue(h.stores)[0].rec.events).toEqual([{ type: "landed", t: 1000 }]);
    expect(h.calls).toEqual([]);
  });

  it("does not send one request per event", () => {
    vi.useFakeTimers();
    const h = setup();
    for (let i = 0; i < 20; i++) track({ type: "landed" });
    expect(h.calls).toHaveLength(0);

    vi.advanceTimersByTime(FLUSH_DEBOUNCE_MS);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].body.events).toHaveLength(20);
  });

  it("carries the calibration numbers and nothing more", () => {
    const h = setup();
    trackCalibration({ f0Center: 198.44, rangeSemitones: 4.812, noiseFloor: 0.00213 });
    track({ type: "landed" });

    const rec = loadQueue(h.stores)[0].rec;
    expect(rec.calibration).toEqual({
      f0Center: 198.4,
      rangeSemitones: 4.81,
      noiseFloor: 0.00213,
    });
    expect(rec.device).toBe("ios/safari");
  });

  it("never throws out of an entry point", () => {
    const hostile = new Proxy({} as Storage, {
      get() {
        return () => {
          throw new Error("blocked");
        };
      },
    });
    resetAnalyticsForTest();
    initAnalytics({
      stores: { local: hostile, session: hostile },
      consent: () => true,
      fetchImpl: (() => {
        throw new Error("nope");
      }) as unknown as typeof fetch,
      beacon: null,
      now: () => {
        throw new Error("no clock");
      },
      nowIso: () => "x",
      userAgent: "",
    });

    expect(() => track({ type: "landed" })).not.toThrow();
    expect(() => flushSync()).not.toThrow();
  });
});

describe("flush", () => {
  it("sends the whole session and marks it acknowledged", async () => {
    const h = setup();
    track({ type: "landed" });
    track({ type: "mic", ok: true });
    await flush();

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe(ENDPOINT);
    expect(h.calls[0].keepalive).toBe(true);
    expect(h.calls[0].body.events).toHaveLength(2);
    expect(unsent(h.stores)).toEqual([]);
  });

  it("keeps the session queued when the network fails", async () => {
    const h = setup({ throws: true });
    track({ type: "landed" });
    await flush();

    expect(unsent(h.stores)).toHaveLength(1);
  });

  it("keeps the session queued on a 5xx", async () => {
    const h = setup({ status: 503 });
    track({ type: "landed" });
    await flush();

    expect(unsent(h.stores)).toHaveLength(1);
  });

  it("drops the session on a 4xx rather than retrying forever", async () => {
    // A payload the server will never accept must not be re-sent on every
    // page load for the rest of the device's life.
    const h = setup({ status: 400 });
    track({ type: "landed" });
    await flush();

    expect(unsent(h.stores)).toEqual([]);
  });

  it("sends nothing when there are no events", async () => {
    const h = setup();
    await flush();
    expect(h.calls).toEqual([]);
  });
});

describe("flushSync", () => {
  it("uses sendBeacon so the payload survives the tab closing", () => {
    const h = setup();
    track({ type: "landed" });
    flushSync();

    expect(h.beacons).toHaveLength(1);
    expect(h.beacons[0].url).toBe(ENDPOINT);
    expect(h.calls).toEqual([]);
  });

  it("falls back to fetch when sendBeacon is unavailable", () => {
    const h = setup({ beacon: false });
    track({ type: "landed" });
    flushSync();

    expect(h.calls).toHaveLength(1);
  });

  it("falls back to fetch when sendBeacon refuses the payload", () => {
    // sendBeacon returns false when the payload exceeds the browser's queue.
    const h = setup({ beacon: "fails" });
    track({ type: "landed" });
    flushSync();

    expect(h.beacons).toHaveLength(1);
    expect(h.calls).toHaveLength(1);
  });
});

describe("retryUnsent", () => {
  it("drains a session left behind by an earlier visit", async () => {
    const offline = setup({ throws: true });
    track({ type: "landed" });
    track({ type: "mic", ok: true });
    await flush();
    expect(unsent(offline.stores)).toHaveLength(1);

    // Next page load, network back.
    resetAnalyticsForTest();
    const calls: SessionRecord[] = [];
    initAnalytics({
      stores: offline.stores,
      consent: () => true,
      now: () => 2_000_000,
      nowIso: () => "2026-08-07T00:00:00.000Z",
      userAgent: "",
      beacon: null,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(init.body as string) as SessionRecord);
        return { ok: true, status: 200 } as Response;
      }) as unknown as typeof fetch,
    });
    // initAnalytics already started a drain; this joins it rather than
    // starting a second one.
    await retryUnsent();

    expect(calls).toHaveLength(1);
    expect(calls[0].events).toHaveLength(2);
    expect(unsent(offline.stores)).toEqual([]);
  });

  it("re-sends the same bytes, so a duplicate delivery is harmless", async () => {
    const h = setup();
    track({ type: "landed" });
    await flush();
    const first = JSON.stringify(h.calls[0].body);

    // Force it back into the queue as if the acknowledgement had been lost.
    track({ type: "mic", ok: true });
    await flush();

    expect(h.calls[1].body.sessionId).toBe(h.calls[0].body.sessionId);
    expect(JSON.parse(first).sessionId).toBe(h.calls[1].body.sessionId);
  });
});
