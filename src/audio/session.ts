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
  const pending = startMic((frame, sampleRate) => sink?.(frame, sampleRate)).then(
    (s) => {
      clearIfCurrent();
      if (gen !== generation) {
        s.stop();
        throw new MicCancelled();
      }
      session = s;
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

/** Installs (or clears) the consumer of analysis frames. */
export function setFrameSink(fn: FrameSink | null): void {
  sink = fn;
}

export function stopMic(): void {
  generation += 1;
  sink = null;
  session?.stop();
  session = null;
}
