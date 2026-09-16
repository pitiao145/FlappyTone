/**
 * Picks the next word for the booth to work on.
 *
 * Pulled out of `Recorder.tsx` as a pure function, both so it's unit-testable
 * without dragging in the audio/mic graph, and so the advance logic can't
 * silently drift back to reading stale React state the way it did once
 * before (see the ref-wrapping note in `Recorder.tsx`).
 */
import type { BoothWord } from "./boothWords.ts";

/**
 * `order` is the pending-word ids as they stood at load/refresh time — fixed,
 * so a word moving out of `pending` mid-session doesn't reshuffle what
 * "next" means for everything after it. `pending`/`captured` are live.
 *
 * - `afterId` found in `order`: walk forward from just past it for the next
 *   id that's still in `pending` and not yet `captured`.
 * - `afterId` is `null` (first word) or found but nothing forward qualifies
 *   (the last word, or a redo near the end): fall back to the first
 *   still-pending, uncaptured word overall.
 * - `afterId` is *not* in `order` at all — a redo of a word that was already
 *   `recorded` before this session's snapshot was taken, so it was never in
 *   `order` to begin with. Go straight to the fallback instead of walking
 *   `order` from index 0, which used to resolve to whatever happened to sit
 *   earliest in the original list rather than wherever she'd actually
 *   gotten to.
 */
export function nextPendingId(
  order: string[],
  pending: BoothWord[],
  captured: Set<string>,
  afterId: string | null,
): string | null {
  const isQualified = (id: string) => pending.some((w) => w.id === id) && !captured.has(id);

  if (afterId === null) {
    for (const id of order) {
      if (isQualified(id)) return id;
    }
  } else {
    const idx = order.indexOf(afterId);
    if (idx !== -1) {
      for (let i = idx + 1; i < order.length; i++) {
        if (isQualified(order[i])) return order[i];
      }
    }
  }

  const fallback = pending.find((w) => !captured.has(w.id));
  return fallback?.id ?? null;
}
