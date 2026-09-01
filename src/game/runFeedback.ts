/**
 * Post-run feedback prompt's "already asked today" gate — localStorage only.
 *
 * Stores just the local calendar date the prompt was last shown (answered or
 * dismissed, either counts), so `GameOver` shows it at most once per day. See
 * docs/flappytone-SPEC-run-feedback.md.
 *
 * Deliberately NOT a daily-reset store like `dailyLimit.ts`/`streak.ts`:
 * `load()` here must return the stored date as-is, even on a new day —
 * `hasShownFeedbackToday()` is what compares it against `today()`. Resetting
 * the stored value on a day change would defeat the whole point of the field.
 */

const KEY = "toneflap.runFeedback.v1";

interface FeedbackState {
  lastShownDate: string; // YYYY-MM-DD, local; "" means never shown
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Small non-cryptographic checksum — deters casual edits, nothing more. */
function checksum(state: FeedbackState): string {
  let h = 0;
  const s = `${state.lastShownDate}:ft-feedback`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function fresh(): FeedbackState {
  return { lastShownDate: "" };
}

function load(): FeedbackState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as { lastShownDate?: unknown; chk?: unknown };
    if (typeof parsed.lastShownDate !== "string" || typeof parsed.chk !== "string") {
      return fresh();
    }
    const state: FeedbackState = { lastShownDate: parsed.lastShownDate };
    if (parsed.chk !== checksum(state)) return fresh();
    return state;
  } catch {
    return fresh();
  }
}

function save(state: FeedbackState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, chk: checksum(state) }));
  } catch {
    // ignore
  }
}

/** True once the prompt has already been shown (answered or dismissed) today. */
export function hasShownFeedbackToday(): boolean {
  return load().lastShownDate === today();
}

/** Call as soon as the card is dismissed or answered — "shown" is what suppresses the re-nag, not "answered". */
export function markFeedbackShown(): void {
  save({ lastShownDate: today() });
}
