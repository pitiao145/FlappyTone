/**
 * Remembers which words are already recorded, so closing the tab is not a
 * setback.
 *
 * Jane will not do a hundred words in one sitting. If reopening the page put
 * her back at word one she would either re-record everything or give up, so
 * progress survives in `localStorage` alongside the session id — the same id
 * the blobs are filed under, so a resumed session lands in the same folder.
 */

const KEY = "flaptone.record.progress.v1";

export interface Progress {
  sessionId: string;
  /** Word ids the server has confirmed. */
  done: string[];
}

function newSessionId(): string {
  // Date-first so a folder listing sorts chronologically; the suffix only has
  // to separate two sessions started the same day.
  const day = new Date().toISOString().slice(0, 10);
  return `${day}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadProgress(storage: Storage = localStorage): Progress {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      if (typeof parsed.sessionId === "string" && Array.isArray(parsed.done)) {
        return { sessionId: parsed.sessionId, done: parsed.done.filter((d) => typeof d === "string") };
      }
    }
  } catch {
    // Corrupt or unavailable storage is not worth failing over: she can record
    // from the top, which is annoying, rather than see a blank page.
  }
  return { sessionId: newSessionId(), done: [] };
}

export function saveProgress(progress: Progress, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Private browsing, quota, a blocked origin — none of which should stop
    // her recording. She just loses resume.
  }
}

/** Forgets everything, for "start over". */
export function clearProgress(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* see above */
  }
}
