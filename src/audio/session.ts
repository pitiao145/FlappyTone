/**
 * One microphone session for the whole app, with a swappable frame sink.
 *
 * Why a singleton: iOS Safari only grants `getUserMedia` / `AudioContext.resume`
 * inside a user gesture, so the mic must be opened in the click handler that
 * navigates to a screen — not in that screen's mount effect, which runs outside
 * the gesture. The screen then claims the already-open session by installing
 * its own frame sink.
 */
import { track } from "../analytics/client.ts";
import { MicError, startMic, type MicSession } from "./mic.ts";

export type FrameSink = (frame: Float32Array, sampleRate: number) => void;

let session: MicSession | null = null;
let sink: FrameSink | null = null;
let starting: Promise<MicSession> | null = null;
/** The generation `starting` belongs to; -1 when nothing is in flight. */
let startingGen = -1;
/**
 * Bumped by `stopMic`. A `startMic` that resolves after a stop belongs to a
 * superseded generation and must close its own stream rather than becoming the
 * current session — otherwise the mic and its AudioContext leak, live, forever.
 */
let generation = 0;

/**
 * Opens the mic if it isn't already open. **Must be called synchronously from
 * a user-gesture handler.** Throws `MicError` on failure.
 *
 * Rejects with `MicCancelled` if `stopMic()` was called while it was in flight.
 */
export function ensureMic(): Promise<MicSession> {
  if (session) return Promise.resolve(session);
  // Only share an in-flight start from the *current* generation. A start that
  // `stopMic` already doomed is going to reject with MicCancelled, and handing
  // it to a fresh caller would make their click silently do nothing.
  if (starting && startingGen === generation) return starting;

  const gen = generation;
  const clearIfCurrent = () => {
    if (startingGen === gen) {
      starting = null;
      startingGen = -1;
    }
  };
  const pending = startMic(
    (frame, sampleRate) => sink?.(frame, sampleRate),
    // Loss (OS interruption / interrupted context) routes into the recovery
    // coordinator below, not straight into a re-acquire, so status and
    // debouncing live in one place.
    () => onMicLost(),
  ).then(
    (s) => {
      clearIfCurrent();
      if (gen !== generation) {
        s.stop();
        throw new MicCancelled();
      }
      session = s;
      setMicStatus("live");
      // The single choke point for mic outcome — four UI call sites route
      // through here, and a denied mic is the most common reason a tester
      // never reaches a gate at all.
      track({ type: "mic", ok: true });
      return s;
    },
    (err: unknown) => {
      clearIfCurrent();
      // MicCancelled is the player navigating away, not a failure. Counting it
      // as one would invent a permission problem out of an ordinary back tap.
      if (!(err instanceof MicCancelled)) {
        track({
          type: "mic",
          ok: false,
          reason: err instanceof MicError ? err.kind : "unknown",
        });
      }
      throw err;
    },
  );
  starting = pending;
  startingGen = gen;
  return pending;
}

/** Thrown by `ensureMic` when the caller navigated away before it resolved. */
export class MicCancelled extends Error {
  constructor() {
    super("Microphone start was cancelled.");
    this.name = "MicCancelled";
  }
}

export function getMicSession(): MicSession | null {
  return session;
}

/**
 * True while the mic is *deliberately* released for a cue. The recovery
 * coordinator reads `!hasStream()` to spot a dead mic, but a cue release makes
 * that true by design — this flag tells the two apart, so a visibility change
 * mid-cue can't trigger a "recovery" that re-acquires the mic while the cue is
 * still audible (which on iOS flips the route straight back to the earpiece).
 */
let cueReleaseActive = false;

/**
 * Releases the current session's mic stream (keeping its context alive) so iOS
 * reverts the output route to the loud speaker for a reference cue. No-op if no
 * session is open. See `docs/flappytone-SPEC-ios-audio-routing.md`.
 */
export function releaseMicStream(): void {
  cueReleaseActive = true;
  session?.releaseStream();
}

/**
 * Re-acquires the current session's mic stream after a cue (or after an OS
 * interruption killed it). Resolves silently if there is no session or the
 * stream is already live; swallows failures so a re-acquire can never throw
 * into the run loop — a caller that needs the outcome checks
 * `getMicSession()?.hasStream()`.
 */
export async function acquireMicStream(): Promise<void> {
  const s = session;
  if (!s) {
    cueReleaseActive = false;
    return;
  }
  try {
    await s.acquireStream();
  } catch (err) {
    if (!(err instanceof MicError)) throw err;
    // A re-acquire that fails (e.g. the OS still holds the mic after a cue)
    // leaves the game deaf. Mark it lost so the UI shows it and the
    // visibility/gesture retry (Fix B) can recover.
    setMicStatus("lost");
  } finally {
    // The cue release is resolved either way — the coordinator may treat a
    // still-missing stream as a real loss again from here.
    cueReleaseActive = false;
  }
}

/** Installs (or clears) the consumer of analysis frames. */
export function setFrameSink(fn: FrameSink | null): void {
  sink = fn;
}

export function stopMic(): void {
  generation += 1;
  sink = null;
  cueReleaseActive = false;
  session?.stop();
  session = null;
  setMicStatus("idle");
}

// --------------------------------------------------------- mic health / recovery
//
// Fix B of docs/flappytone-SPEC-ios-audio-routing.md. An OS interruption (a
// call, Siri, another app) can leave the mic track dead or the AudioContext
// `interrupted`, and on iOS the matching `unmute` frequently never fires — so
// recovery is proactive: stop the dead stream and re-acquire, rather than
// waiting. The UI subscribes to the status so a deaf mic is never invisible;
// per hard rule 8 the game reads neutral, not failed, while the mic is down.

/**
 * "idle": no session. "live": capturing. "lost": interrupted and not yet
 * recovered (the UI should tell the player). "recovering": a re-acquire is in
 * flight.
 */
export type MicStatus = "idle" | "live" | "lost" | "recovering";

let micStatus: MicStatus = "idle";
const statusListeners = new Set<(s: MicStatus) => void>();

function setMicStatus(next: MicStatus): void {
  if (next === micStatus) return;
  micStatus = next;
  for (const cb of statusListeners) cb(next);
}

export function getMicStatus(): MicStatus {
  return micStatus;
}

/** Subscribe to mic-status changes. Returns an unsubscribe function. */
export function subscribeMicStatus(cb: (s: MicStatus) => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

let recovering = false;

function onMicLost(): void {
  // Ignore a loss reported after the session was already torn down.
  if (!session) return;
  setMicStatus("lost");
  void recoverMic();
}

/**
 * Proactively re-acquires a lost mic: drop the dead stream, get a fresh one,
 * and resume the context. Never throws. Guarded against re-entry. A failure
 * leaves status "lost" so the UI can prompt and a later visibility/gesture can
 * retry. When the context stays `interrupted` even after `resume()` (a reported
 * iOS dead-end), the session is rebuilt from scratch on the next `ensureMic`.
 */
export async function recoverMic(): Promise<void> {
  const s = session;
  // Never recover mid-cue: the missing stream is deliberate, and re-acquiring
  // now would flip the route back to the earpiece while the cue plays.
  if (!s || recovering || cueReleaseActive) return;
  recovering = true;
  setMicStatus("recovering");
  try {
    s.releaseStream();
    await s.acquireStream();
    if (s.ctx.state === "suspended" || s.ctx.state === "interrupted") {
      try {
        await s.ctx.resume();
      } catch {
        // resume can reject on iOS without a gesture; the visibility/gesture
        // retry below covers it.
      }
    }
    setMicStatus(s.hasStream() && s.ctx.state === "running" ? "live" : "lost");
  } catch {
    setMicStatus("lost");
  } finally {
    recovering = false;
  }
}

// Returning to the foreground is the most reliable moment to retry: it fires on
// iOS, and it often coincides with the interruption clearing. Retry only when
// something is actually wrong, so a normal resume costs nothing.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!session || cueReleaseActive) return;
    if (micStatus === "lost" || !session.hasStream()) void recoverMic();
  });
}
