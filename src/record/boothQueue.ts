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

/**
 * The words the recording screen steps through with its arrows and shows in
 * its strip: the fixed `order`, plus the word she opened on when it is not
 * in it (a redo of an already-recorded word), placed first.
 */
export function buildSequence(order: string[], startId: string | null): string[] {
  return startId !== null && !order.includes(startId) ? [startId, ...order] : order;
}

/** The neighbour of `currentId` in `sequence` (-1 back, +1 forward), or `null` at an end. */
export function stepId(sequence: string[], currentId: string | null, dir: -1 | 1): string | null {
  if (currentId === null) return null;
  const idx = sequence.indexOf(currentId);
  if (idx === -1) return null;
  return sequence[idx + dir] ?? null;
}

/**
 * The slice of `sequence` the strip shows: `before` words behind the current
 * one and `after` ahead. Near either end the window stays the same size where
 * the sequence allows, so the strip doesn't shrink on the first word.
 */
export function stripWindow(sequence: string[], currentId: string | null, before = 1, after = 4): string[] {
  const size = before + 1 + after;
  const idx = currentId === null ? -1 : sequence.indexOf(currentId);
  if (idx === -1) return sequence.slice(0, size);
  let start = Math.max(0, idx - before);
  start = Math.max(0, Math.min(start, sequence.length - size));
  return sequence.slice(start, start + size);
}
