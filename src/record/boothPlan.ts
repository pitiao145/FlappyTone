/**
 * The booth's "how big is the job" arithmetic, as pure functions.
 *
 * Kept out of `Overview.tsx` and `Recorder.tsx` so the numbers a volunteer
 * reads first ("12 of 120 done, about 8 min left") are testable without
 * mounting either screen, and so both screens count the same way.
 */
import { statusFor, type BoothStyle, type BoothWord, type BoothWordStatus } from "./boothWords.ts";

/**
 * Average time one word costs in the bulk pass: say it, the detector hears
 * the end, "got it", next word. A rough planning number, not a measurement —
 * change it here and every "min left" in the booth follows.
 */
export const SECONDS_PER_WORD = 4;

export interface ListProgress {
  /** Recorded or published, for this style. */
  done: number;
  total: number;
  /** Still to record, for this style. */
  pending: number;
}

/** Words in `listId` (every given word when `null`). */
export function wordsInList(words: BoothWord[], listId: string | null): BoothWord[] {
  return listId === null ? words : words.filter((w) => w.lists?.includes(listId));
}

/** Done / total / pending for one list (or all, when `null`) in one style. */
export function listProgress(words: BoothWord[], listId: string | null, style: BoothStyle): ListProgress {
  const inList = wordsInList(words, listId);
  const pending = inList.filter((w) => statusFor(w, style) === "pending").length;
  return { done: inList.length - pending, total: inList.length, pending };
}

/** Whole minutes to record `pendingCount` words, rounded up. 0 only when nothing is left. */
export function minutesLeft(pendingCount: number): number {
  if (pendingCount <= 0) return 0;
  return Math.ceil((pendingCount * SECONDS_PER_WORD) / 60);
}

/** "about 8 min left", "under a minute left", or "nothing left". */
export function timeLeftLabel(pendingCount: number): string {
  if (pendingCount <= 0) return "nothing left";
  if (pendingCount * SECONDS_PER_WORD < 60) return "under a minute left";
  return `about ${minutesLeft(pendingCount)} min left`;
}

/** Share done, 0–100, for a progress bar. An empty list counts as done. */
export function percentDone(p: ListProgress): number {
  return p.total === 0 ? 100 : Math.round((p.done / p.total) * 100);
}

/** The English gloss, or "–" when the Worker sent none (older deploy, empty catalog value). */
export function englishOf(word: BoothWord): string {
  const e = typeof word.english === "string" ? word.english.trim() : "";
  return e || "–";
}

export type WordFilter = "all" | "todo" | "done";

/** The word-card filter, for one style. "done" is recorded or published. */
export function filterWords(words: BoothWord[], filter: WordFilter, style: BoothStyle): BoothWord[] {
  if (filter === "all") return words;
  const wantPending = filter === "todo";
  return words.filter((w) => (statusFor(w, style) === "pending") === wantPending);
}

/** Chip text and the one-line explanation behind it. */
export const STATUS_COPY: Record<BoothWordStatus, { chip: string; explain: string }> = {
  pending: { chip: "to record", explain: "Not recorded yet." },
  recorded: { chip: "recorded", explain: "Saved. Goes live after Pierre publishes it." },
  published: { chip: "published", explain: "Live in the game." },
};

/** The one-line reminder of how each style should sound. */
export const STYLE_COPY: Record<BoothStyle, { name: string; reminder: string }> = {
  textbook: { name: "Textbook", reminder: "Slow and clear. Say the full tone." },
  natural: { name: "Natural", reminder: "Everyday speed, like talking to a friend." },
};
