import { describe, expect, it } from "vitest";
import {
  evict,
  forgetEverything,
  loadQueue,
  markSent,
  MAX_QUEUE_BYTES,
  MAX_QUEUED_SESSIONS,
  newId,
  playerId,
  saveSession,
  sessionId,
  unsent,
  type QueuedSession,
  type Stores,
} from "./store.ts";
import { appendEvent, MAX_EVENTS, newSession, type SessionRecord } from "./session.ts";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = { ...seed };
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

/** Every call throws — private browsing, disabled storage, full quota. */
const hostileStorage = new Proxy({} as Storage, {
  get() {
    return () => {
      throw new Error("blocked");
    };
  },
});

function stores(): Stores {
  return { local: memoryStorage(), session: memoryStorage() };
}

function rec(id: string, startedAtMs: number): SessionRecord {
  return newSession(id, "player00", "desktop/chrome", startedAtMs, new Date(startedAtMs).toISOString());
}

function withEvents(r: SessionRecord, n: number): SessionRecord {
  let out = r;
  for (let i = 0; i < n; i++) out = appendEvent(out, { type: "landed" }, r.startedAtMs + i);
  return out;
}

describe("newId", () => {
  it("matches the shape the endpoint accepts", () => {
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("does not collide across many mints", () => {
    const seen = new Set(Array.from({ length: 500 }, () => newId()));
    expect(seen.size).toBe(500);
  });
});

describe("playerId / sessionId", () => {
  it("mints once and is stable thereafter", () => {
    const s = stores();
    const first = playerId(s);
    expect(playerId(s)).toBe(first);
  });

  it("keeps the player id in local and the session id in session storage", () => {
    const s = stores();
    playerId(s);
    sessionId(s);
    // A player id in sessionStorage would reset every tab, making retention
    // unmeasurable — the one question the id exists to answer.
    expect(s.local.getItem("toneflap.analytics.player.v1")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.session.getItem("toneflap.analytics.session.v1")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.session.getItem("toneflap.analytics.player.v1")).toBeNull();
  });

  it("re-mints rather than trusting a tampered id", () => {
    // The id lands in a storage path on the server; a value with a slash in it
    // would file the session somewhere else entirely.
    const s: Stores = {
      local: memoryStorage({ "toneflap.analytics.player.v1": "../../etc/passwd" }),
      session: memoryStorage(),
    };
    expect(playerId(s)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("still returns a usable id when storage is blocked", () => {
    const s: Stores = { local: hostileStorage, session: hostileStorage };
    expect(playerId(s)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});

describe("saveSession / loadQueue", () => {
  it("round-trips a session", () => {
    const s = stores();
    saveSession(s, withEvents(rec("aaaaaaaa", 1000), 3));
    const queue = loadQueue(s);
    expect(queue).toHaveLength(1);
    expect(queue[0].rec.events).toHaveLength(3);
    expect(queue[0].sentCount).toBe(0);
  });

  it("upserts rather than duplicating the same session", () => {
    const s = stores();
    const r = rec("aaaaaaaa", 1000);
    saveSession(s, withEvents(r, 1));
    saveSession(s, withEvents(r, 5));
    expect(loadQueue(s)).toHaveLength(1);
    expect(loadQueue(s)[0].rec.events).toHaveLength(5);
  });

  it("carries the acknowledged count across an append", () => {
    const s = stores();
    const r = rec("aaaaaaaa", 1000);
    saveSession(s, withEvents(r, 4));
    markSent(s, "aaaaaaaa", 4);
    // Fully acknowledged, so it left the queue...
    expect(loadQueue(s)).toHaveLength(0);

    // ...but a session that only got partway keeps its count.
    const s2 = stores();
    saveSession(s2, withEvents(r, 6));
    markSent(s2, "aaaaaaaa", 4);
    saveSession(s2, withEvents(r, 8));
    expect(loadQueue(s2)[0].sentCount).toBe(4);
  });

  it("survives a corrupt queue instead of throwing", () => {
    const s: Stores = {
      local: memoryStorage({ "toneflap.analytics.queue.v1": "{not json" }),
      session: memoryStorage(),
    };
    expect(loadQueue(s)).toEqual([]);
    expect(() => saveSession(s, rec("aaaaaaaa", 1))).not.toThrow();
  });

  it("does not throw when storage is blocked", () => {
    const s: Stores = { local: hostileStorage, session: hostileStorage };
    expect(() => saveSession(s, rec("aaaaaaaa", 1))).not.toThrow();
    expect(loadQueue(s)).toEqual([]);
  });
});

describe("evict", () => {
  it("drops the oldest sessions past the count cap", () => {
    const queue: QueuedSession[] = Array.from({ length: MAX_QUEUED_SESSIONS + 5 }, (_, i) => ({
      rec: rec(`s${i}`.padEnd(8, "0"), i * 1000),
      sentCount: 0,
    }));
    const kept = evict(queue);
    expect(kept).toHaveLength(MAX_QUEUED_SESSIONS);
    // The newest — which is always the live session — survives.
    expect(kept[kept.length - 1].rec.startedAtMs).toBe((MAX_QUEUED_SESSIONS + 4) * 1000);
    expect(kept[0].rec.startedAtMs).toBe(5000);
  });

  it("drops the oldest past the byte cap", () => {
    // Sessions at the event ceiling: enough of them to blow the byte cap well
    // before the count cap, which is the case the byte cap exists for.
    const fat = (id: string, at: number) => ({
      rec: withEvents(rec(id, at), MAX_EVENTS),
      sentCount: 0,
    });
    const queue = Array.from({ length: 8 }, (_, i) => fat(`s${i}`.padEnd(8, "0"), (i + 1) * 1000));
    const kept = evict(queue);

    expect(kept.length).toBeLessThan(8);
    expect(JSON.stringify(kept).length).toBeLessThanOrEqual(MAX_QUEUE_BYTES);
    // The live session — always the newest — survives.
    expect(kept[kept.length - 1].rec.sessionId).toBe("s7000000");
  });

  it("never evicts down to nothing", () => {
    // A single session larger than the cap is still worth trying to send.
    const kept = evict([{ rec: withEvents(rec("aaaaaaaa", 1), 1900), sentCount: 0 }]);
    expect(kept).toHaveLength(1);
  });
});

describe("markSent / unsent", () => {
  it("drops a session once every event is acknowledged", () => {
    const s = stores();
    saveSession(s, withEvents(rec("aaaaaaaa", 1000), 5));
    markSent(s, "aaaaaaaa", 5);
    expect(unsent(s)).toEqual([]);
  });

  it("keeps a session whose events grew while the flush was in flight", () => {
    const s = stores();
    saveSession(s, withEvents(rec("aaaaaaaa", 1000), 9));
    // The request that just returned only carried the first 5.
    markSent(s, "aaaaaaaa", 5);
    expect(unsent(s).map((r) => r.sessionId)).toEqual(["aaaaaaaa"]);
  });

  it("leaves other sessions alone", () => {
    const s = stores();
    saveSession(s, withEvents(rec("aaaaaaaa", 1000), 2));
    saveSession(s, withEvents(rec("bbbbbbbb", 2000), 2));
    markSent(s, "aaaaaaaa", 2);
    expect(unsent(s).map((r) => r.sessionId)).toEqual(["bbbbbbbb"]);
  });

  it("returns unsent sessions oldest first, so retries go in order", () => {
    const s = stores();
    saveSession(s, withEvents(rec("cccccccc", 3000), 1));
    saveSession(s, withEvents(rec("aaaaaaaa", 1000), 1));
    saveSession(s, withEvents(rec("bbbbbbbb", 2000), 1));
    expect(unsent(s).map((r) => r.sessionId)).toEqual(["aaaaaaaa", "bbbbbbbb", "cccccccc"]);
  });
});

describe("forgetEverything", () => {
  it("removes the queue, the player id and the session id", () => {
    const s = stores();
    playerId(s);
    sessionId(s);
    saveSession(s, withEvents(rec("aaaaaaaa", 1000), 3));

    forgetEverything(s);

    expect(loadQueue(s)).toEqual([]);
    expect(s.local.getItem("toneflap.analytics.player.v1")).toBeNull();
    expect(s.session.getItem("toneflap.analytics.session.v1")).toBeNull();
  });

  it("does not throw when storage is blocked", () => {
    expect(() => forgetEverything({ local: hostileStorage, session: hostileStorage })).not.toThrow();
  });
});
