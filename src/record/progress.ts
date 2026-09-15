/**
 * Remembers the session id across a reload, so a resumed session's uploads
 * land in the same folder instead of scattering across two.
 *
 * Which words are done used to live here too, but the server (`GET
 * /booth/words`) is the truth for that now — a locally-remembered `done` set
 * could drift from what's actually in the database (another device, a
 * dropped upload that later succeeded after the tab closed) and show Jane a
 * list that doesn't match reality. `Recorder.tsx` gets pending/recorded from
 * `fetchBoothWords` on every load instead.
 */

const KEY = "flaptone.record.progress.v1";

export interface Progress {
  sessionId: string;
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
      if (typeof parsed.sessionId === "string") {
        return { sessionId: parsed.sessionId };
      }
    }
  } catch {
    // Corrupt or unavailable storage is not worth failing over: she can record
    // from the top, which is annoying, rather than see a blank page.
  }
  return { sessionId: newSessionId() };
}

/** Forgets everything, for "start over". */
export function clearProgress(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* see above */
  }
}

export function saveProgress(progress: Progress, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Private browsing, quota, a blocked origin — none of which should stop
    // her recording. She just loses resume.
  }
}
