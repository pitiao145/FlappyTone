/**
 * The live analytics client: the one impure piece.
 *
 * Everything here is fire-and-forget and every entry point swallows its own
 * failures. Analytics must never break a run — the same posture `saveGateLog`
 * takes for quota errors, for the same reason. If this file ever throws into a
 * caller, that is the bug, whatever else was also wrong.
 *
 * ## When the payload is sent
 *
 * Never per event — that would be a request per gate. Four triggers:
 *
 * | when                          | how                    | catches                          |
 * |-------------------------------|------------------------|----------------------------------|
 * | run end                       | `fetch` + `keepalive`  | the normal case                  |
 * | `FLUSH_DEBOUNCE_MS` after an event | `fetch`           | a crash mid-run loses ≤10s       |
 * | page hidden                   | `sendBeacon`           | tab switch, home button, lock    |
 * | next page load                | `fetch` per unsent     | offline, force-quit, server 5xx  |
 *
 * The last row is what actually makes this lossless, and it works because
 * every flush PUTs the *whole* session to the same key with `allowOverwrite`.
 * A retry of an already-received session rewrites identical bytes, so there is
 * no dedupe logic anywhere — client or server.
 *
 * ## Consent
 *
 * `loadShareData()` is checked before anything is stored or sent, and crucially
 * before `playerId()` is called: opting out means an id is never minted, not
 * that one is minted and withheld.
 */

import {
  loadShareData,
  type CalibrationSettings,
} from "../game/settings.ts";
import {
  appendEvent,
  newSession,
  setCalibration,
  deviceBucket,
  type AnalyticsEvent,
  type SessionRecord,
} from "./session.ts";
import {
  forgetEverything,
  markSent,
  playerId,
  saveSession,
  sessionId,
  unsent,
  type Stores,
} from "./store.ts";

export const ENDPOINT = "/api/analytics";
/** Long enough that a run's gates coalesce into one request, short enough that a crash costs little. */
export const FLUSH_DEBOUNCE_MS = 10_000;

interface Deps {
  stores: Stores;
  fetchImpl: typeof fetch;
  /** `null` where `sendBeacon` is unavailable; the fetch path covers it. */
  beacon: ((url: string, body: BodyInit) => boolean) | null;
  now: () => number;
  nowIso: () => string;
  userAgent: string;
  consent: () => boolean;
}

let deps: Deps | null = null;
let live: SessionRecord | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
/** The in-flight retry drain, so concurrent callers share one pass. */
let retrying: Promise<void> | null = null;

/**
 * Browser defaults, each guarded independently. A test supplies only the parts
 * it cares about; a missing `window` yields `null` for `stores`, which is the
 * one dependency with no sensible stand-in.
 */
function defaultDeps(): Omit<Deps, "stores"> & { stores: Stores | null } {
  const hasWindow = typeof window !== "undefined";
  return {
    stores: hasWindow ? { local: window.localStorage, session: window.sessionStorage } : null,
    fetchImpl: hasWindow ? window.fetch.bind(window) : (() => Promise.reject(new Error("no fetch"))),
    beacon:
      typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
        ? (url, body) => navigator.sendBeacon(url, body)
        : null,
    now: () => Date.now(),
    nowIso: () => new Date().toISOString(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    consent: loadShareData,
  };
}

/**
 * Wires the client up and drains anything a previous visit failed to send.
 *
 * Call once, from app start. Safe to call again — later calls are ignored so a
 * React strict-mode double-mount cannot register two visibility listeners.
 */
export function initAnalytics(overrides: Partial<Deps> = {}): void {
  try {
    if (deps) return;
    const base = defaultDeps();
    const stores = overrides.stores ?? base.stores;
    if (!stores) return;
    deps = { ...base, ...overrides, stores };

    if (!deps.consent()) {
      // Opted out before this visit: make sure nothing lingers from before.
      forgetEverything(deps.stores);
      return;
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onHidden);
      // `pagehide` fires on iOS where `visibilitychange` sometimes does not.
      window.addEventListener("pagehide", onHidden);
    }
    void retryUnsent();
  } catch {
    deps = null;
  }
}

/** Test seam: forget all module state so each test starts clean. */
export function resetAnalyticsForTest(): void {
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onHidden);
  }
  if (debounce !== null) clearTimeout(debounce);
  debounce = null;
  retrying = null;
  deps = null;
  live = null;
}

function onHidden(): void {
  try {
    if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
      return;
    }
    flushSync();
  } catch {
    // ignore
  }
}

function ensureLive(): SessionRecord | null {
  if (!deps) return null;
  if (!deps.consent()) return null;
  if (live) return live;
  // playerId() mints on first read — so it is reached only past the consent
  // check above, never for an opted-out player.
  live = newSession(
    sessionId(deps.stores),
    playerId(deps.stores),
    deviceBucket(deps.userAgent),
    deps.now(),
    deps.nowIso(),
  );
  return live;
}

/** Records an event. Persists immediately; sends later. */
export function track(event: AnalyticsEvent): void {
  try {
    const d = deps;
    const rec = ensureLive();
    if (!d || !rec) return;
    live = appendEvent(rec, event, d.now());
    saveSession(d.stores, live);
    scheduleFlush();
  } catch {
    // ignore
  }
}

/** Stamps the calibration numbers onto the session. Overwrites on re-calibration. */
export function trackCalibration(cal: CalibrationSettings): void {
  try {
    const d = deps;
    const rec = ensureLive();
    if (!d || !rec) return;
    live = setCalibration(rec, cal);
    saveSession(d.stores, live);
  } catch {
    // ignore
  }
}

function scheduleFlush(): void {
  if (debounce !== null) return;
  debounce = setTimeout(() => {
    debounce = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
}

/**
 * Sends the live session now. Awaited at run end, where the payload matters
 * most and the player is looking at a game-over screen anyway.
 */
export async function flush(): Promise<void> {
  try {
    if (debounce !== null) {
      clearTimeout(debounce);
      debounce = null;
    }
    const d = deps;
    if (!d || !live || live.events.length === 0) return;
    await send(d, live, true);
  } catch {
    // ignore
  }
}

/**
 * The page-is-going-away path. Must not await: the browser will not keep the
 * tab alive for a promise, and `sendBeacon` is the only thing that reliably
 * survives an iOS home-button press.
 */
export function flushSync(): void {
  try {
    const d = deps;
    if (!d || !live || live.events.length === 0) return;
    const body = JSON.stringify(live);
    const count = live.events.length;
    const id = live.sessionId;
    if (d.beacon) {
      // Optimistic: the browser gives no completion callback. If it silently
      // failed, the queue entry is gone — which is why the *next* page load
      // also re-sends anything still unacknowledged rather than trusting this.
      if (d.beacon(ENDPOINT, new Blob([body], { type: "application/json" }))) {
        markSent(d.stores, id, count);
        return;
      }
    }
    void send(d, live, true);
  } catch {
    // ignore
  }
}

/**
 * Drains sessions from earlier visits that were never acknowledged.
 *
 * Concurrent calls share one drain. `initAnalytics` starts one without
 * awaiting it, so without this a caller invoking it too would upload every
 * queued session twice — harmless, since writes are idempotent, but it doubles
 * the requests on exactly the slow connection that caused the backlog.
 */
export function retryUnsent(): Promise<void> {
  if (retrying) return retrying;
  retrying = (async () => {
    try {
      const d = deps;
      if (!d) return;
      for (const rec of unsent(d.stores)) {
        if (rec.sessionId === live?.sessionId) continue;
        await send(d, rec, false);
      }
    } catch {
      // ignore
    } finally {
      retrying = null;
    }
  })();
  return retrying;
}

async function send(d: Deps, rec: SessionRecord, keepalive: boolean): Promise<void> {
  const count = rec.events.length;
  try {
    const res = await d.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rec),
      keepalive,
    });
    // 4xx means this payload will never be accepted — a schema change, an id
    // the server rejects. Drop it rather than retrying it every page load
    // forever. 5xx and network errors stay queued.
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      markSent(d.stores, rec.sessionId, count);
    }
  } catch {
    // Offline. It stays in the queue for the next page load — the case this
    // whole retry design exists for.
  }
}

/**
 * Applies an opt-out immediately: stops the client and erases the queue, the
 * player id and the session id. Opting back in mints a fresh player id, so it
 * is genuinely a new anonymous player rather than a resumed one.
 */
export function setSharingEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      live = null;
      if (!deps) initAnalytics();
      return;
    }
    if (deps) forgetEverything(deps.stores);
    live = null;
    if (debounce !== null) {
      clearTimeout(debounce);
      debounce = null;
    }
  } catch {
    // ignore
  }
}
