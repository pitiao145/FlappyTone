// The last mic request's failure in this page load, for the blocked-mic help
// panel (brief 32): which error, which kind of refusal, and how fast. Written
// by `ensureMic` (`src/audio/session.ts`), read by `src/ui/MicHelp.tsx`. No
// audio code here, so site pages can load it up front (hard rule 13). Never
// throws (hard rule 10 spirit: help copy never breaks the mic step).
import type { MicDenial, MicErrorName } from "../audio/mic.ts";

export interface MicFailureInfo {
  errorName: MicErrorName;
  /** A `NotAllowedError`'s kind from the browser's message (`other` on Safari). */
  denial: MicDenial;
  /** Tap → refusal, not rounded. Under ~1 s means no prompt was shown. */
  ms: number;
}

let last: MicFailureInfo | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // a listener never breaks the mic step
    }
  }
}

/** Records a failed mic request; `null` clears it (a request worked). */
export function recordMicFailure(info: MicFailureInfo | null): void {
  last = info;
  emit();
}

export function lastMicFailure(): MicFailureInfo | null {
  return last;
}

/** For `useSyncExternalStore`. */
export function subscribeMicFailure(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
