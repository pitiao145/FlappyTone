/**
 * One microphone session for the whole app, with a swappable frame sink.
 *
 * Why a singleton: iOS Safari only grants `getUserMedia` / `AudioContext.resume`
 * inside a user gesture, so the mic must be opened in the click handler that
 * navigates to a screen — not in that screen's mount effect, which runs outside
 * the gesture. The screen then claims the already-open session by installing
 * its own frame sink.
 */
import { startMic, type MicSession } from "./mic.ts";

export type FrameSink = (frame: Float32Array, sampleRate: number) => void;

let session: MicSession | null = null;
let sink: FrameSink | null = null;
let starting: Promise<MicSession> | null = null;
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
  const gen = generation;
  starting ??= startMic((frame, sampleRate) => sink?.(frame, sampleRate))
    .then((s) => {
      starting = null;
      if (gen !== generation) {
        s.stop();
        throw new MicCancelled();
      }
      session = s;
      return s;
    })
    .catch((err) => {
      starting = null;
      throw err;
    });
  return starting;
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
