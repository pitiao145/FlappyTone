/**
 * When the booth's microphone is allowed to be listening.
 *
 * Pulled out as three pure predicates rather than left inline in
 * `Recorder.tsx`, for the same reason `boothQueue.ts` was: this is the logic
 * that, when it was implicit, let a published take be overwritten by accident.
 * On 16 Sep 2026 the all-done screen's "Redo a word" button jumped straight to
 * the first recorded word with the microphone already live; the next sound in
 * the room replaced Jane's published 媽 with someone else's voice, and the row
 * had to be repaired by hand in SQL and in R2.
 *
 * The rule that follows: the microphone arms itself only on the path Jane
 * actually walks all session (working down the pending list). Every other way
 * of reaching a word — a redo, a take that just replaced a published clip —
 * lands paused, so re-recording something costs a deliberate tap.
 */
import type { BoothWordStatus } from "./boothWords.ts";

/** How the recording screen was entered. */
export type BoothEntry =
  /** "Start recording" — work down the pending list. */
  | "bulk"
  /** "Record this one" — a single word, chosen deliberately. */
  | "redo";

/**
 * Whether the microphone is live the moment the recording screen appears.
 *
 * Bulk arms: that is the booth's whole reason to exist, and making Jane press
 * a second button per session would cost more than it protects. A redo does
 * not: she has landed on one specific word, and the only sound that should
 * reach the detector is the one she means to record.
 */
export function initialArmed(entry: BoothEntry): boolean {
  return entry === "bulk";
}

/**
 * Whether choosing this word for a redo needs a confirmation first.
 *
 * `published` means the clip is live in the game right now — re-recording it
 * replaces audio players are already hearing. `recorded` means uploaded but
 * not yet through `process-clips`, so nothing downstream has consumed it and
 * a replacement costs nothing.
 */
export function needsRedoConfirm(status: BoothWordStatus): boolean {
  return status === "published";
}

/**
 * What happens after a take is captured for a word with this status.
 *
 * Hands-free advance is preserved for the ordinary case. A take that just
 * replaced a published clip stops instead: without this, a redo runs straight
 * on into the next word with the microphone still live, which is the same
 * accident in a different costume.
 */
export function afterTake(status: BoothWordStatus): { advance: boolean; armed: boolean } {
  return status === "published" ? { advance: false, armed: false } : { advance: true, armed: true };
}
