/**
 * Local persistence for analytics sessions.
 *
 * The design rule this file exists to enforce: **local storage is the source
 * of truth and the network is a best-effort mirror.** Every event append
 * rewrites the session here first; a session is deleted only once the server
 * has acknowledged a write containing that session's events. So the failure
 * mode is never "lost", only "not yet sent" — and the next page load drains
 * whatever is still queued.
 *
 * That last part is what makes the whole thing survive the real failure cases:
 * airplane mode on a train, a force-quit, a 500 from the endpoint. `sendBeacon`
 * alone covers none of them.
 *
 * `Storage` is injected rather than reached for globally (the
 * `src/record/progress.ts` convention), so the queue logic — caps, eviction,
 * acknowledgement — is testable without a browser, including against a storage
 * that throws on every call.
 */

import type { SessionRecord } from "./session.ts";

const PLAYER_KEY = "toneflap.analytics.player.v1";
const SESSION_KEY = "toneflap.analytics.session.v1";
const QUEUE_KEY = "toneflap.analytics.queue.v1";

/**
 * Caps on the unsent queue. A device that is offline forever must not be able
 * to grow `localStorage` without bound — the game's own settings live there
 * too, and filling the quota would break calibration, which matters and
 * analytics does not.
 */
export const MAX_QUEUED_SESSIONS = 20;
export const MAX_QUEUE_BYTES = 200_000;

export interface QueuedSession {
  rec: SessionRecord;
  /** How many events the server has confirmed. 0 until a flush is acknowledged. */
  sentCount: number;
}

export interface Stores {
  local: Storage;
  /** Session-scoped: a reload continues the session, closing the tab ends it. */
  session: Storage;
}

/** Injected so tests are deterministic; production passes the crypto-backed one. */
export type IdSource = () => string;

/**
 * 22 chars of URL-safe base64-ish entropy — matches the endpoint's
 * `^[a-zA-Z0-9_-]{8,64}$` and carries ~128 bits.
 *
 * Not `crypto.randomUUID()`: that is undefined on a non-secure origin, which
 * is exactly the `http://<lan-ip>:5173` setup used to test on a real phone.
 * An id generator that throws only on the device you most need data from is
 * worse than useless.
 */
export function newId(): string {
  const bytes = new Uint8Array(16);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (const b of bytes) out += alphabet[b & 63];
  return out;
}

/** Reads a key, minting and persisting a fresh id if absent. */
function readOrMint(storage: Storage, key: string, id: IdSource): string {
  try {
    const existing = storage.getItem(key);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  } catch {
    // Storage blocked (private mode, quota, disabled). Fall through to a
    // throwaway id: the session still reports, it just won't be linkable.
  }
  const minted = id();
  try {
    storage.setItem(key, minted);
  } catch {
    // ignore — see above
  }
  return minted;
}

/**
 * Stable across visits. This is the one value that makes "does anyone play it
 * twice" answerable (PRD §14). Random, never derived from anything about the
 * device or the person, and cleared by clearing site data.
 *
 * Callers must check consent *before* calling this — an opted-out player
 * should never have an id minted at all.
 */
export function playerId(stores: Stores, id: IdSource = newId): string {
  return readOrMint(stores.local, PLAYER_KEY, id);
}

export function sessionId(stores: Stores, id: IdSource = newId): string {
  return readOrMint(stores.session, SESSION_KEY, id);
}

export function loadQueue(stores: Stores): QueuedSession[] {
  let raw: string | null;
  try {
    raw = stores.local.getItem(QUEUE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueued);
  } catch {
    // A corrupt queue is discarded rather than repaired. There is nothing here
    // worth recovering, and a half-parsed record would upload as garbage.
    return [];
  }
}

function isQueued(v: unknown): v is QueuedSession {
  if (typeof v !== "object" || v === null) return false;
  const q = v as QueuedSession;
  return (
    typeof q.sentCount === "number" &&
    typeof q.rec === "object" &&
    q.rec !== null &&
    typeof q.rec.sessionId === "string" &&
    Array.isArray(q.rec.events)
  );
}

function writeQueue(stores: Stores, queue: QueuedSession[]): void {
  try {
    stores.local.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Quota or blocked storage. Diagnostics are never worth breaking a run for
    // — the same posture `saveGateLog` takes.
  }
}

/**
 * Upserts a session into the queue and enforces the caps.
 *
 * Eviction drops the *oldest* sessions first, which by construction protects
 * the live one: it is always the newest. Losing a stale session from three
 * days ago to keep the one being played is the right trade.
 */
export function saveSession(stores: Stores, rec: SessionRecord): void {
  const queue = loadQueue(stores);
  const existing = queue.find((q) => q.rec.sessionId === rec.sessionId);
  const rest = queue.filter((q) => q.rec.sessionId !== rec.sessionId);
  // The acknowledged count carries over: appending events to a session the
  // server has partly seen must not re-mark the whole thing as unsent-from-zero.
  rest.push({ rec, sentCount: existing?.sentCount ?? 0 });
  writeQueue(stores, evict(rest));
}

export function evict(queue: QueuedSession[]): QueuedSession[] {
  const sorted = [...queue].sort((a, b) => a.rec.startedAtMs - b.rec.startedAtMs);
  // Size each entry once. Re-measuring the whole queue per dropped element
  // would be quadratic, and this runs on every event append during a run.
  const sizes = sorted.map((q) => JSON.stringify(q).length);
  let total = sizes.reduce((a, b) => a + b, 0);

  let start = 0;
  while (sorted.length - start > MAX_QUEUED_SESSIONS) {
    total -= sizes[start];
    start += 1;
  }
  // Never evict down to nothing: a single session over the cap is still worth
  // trying to send, and dropping it would lose the only data on that device.
  while (sorted.length - start > 1 && total > MAX_QUEUE_BYTES) {
    total -= sizes[start];
    start += 1;
  }
  return sorted.slice(start);
}

/**
 * Records that the server accepted a flush carrying `eventCount` events.
 *
 * If the session has grown since the flush was sent — events kept arriving
 * while the request was in flight — the entry stays queued with its
 * acknowledged count, so the tail is sent later. Only a fully-acknowledged
 * session is dropped.
 */
export function markSent(
  stores: Stores,
  id: string,
  eventCount: number,
): void {
  const queue = loadQueue(stores);
  const next: QueuedSession[] = [];
  for (const q of queue) {
    if (q.rec.sessionId !== id) {
      next.push(q);
      continue;
    }
    if (q.rec.events.length > eventCount) {
      next.push({ ...q, sentCount: eventCount });
    }
    // else: fully acknowledged, drop it.
  }
  writeQueue(stores, next);
}

/** Sessions with events the server has not confirmed, oldest first. */
export function unsent(stores: Stores): SessionRecord[] {
  return loadQueue(stores)
    .filter((q) => q.rec.events.length > q.sentCount)
    .map((q) => q.rec);
}

/** Used by the opt-out: leaves nothing behind, including the player id. */
export function forgetEverything(stores: Stores): void {
  for (const [storage, key] of [
    [stores.local, QUEUE_KEY],
    [stores.local, PLAYER_KEY],
    [stores.session, SESSION_KEY],
  ] as const) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
