/**
 * The share payload + fallback chain — see docs/flappytone-SPEC-share.md
 * "Part 2". Kept separate from GameOver.tsx's click handler so the
 * navigator.share/canShare/clipboard branching lives in one place.
 */

import { toneBreakdown, type RunStats } from "../game/scoring.ts";

const SITE_URL = "https://flappytone.com";
const SHARE_TEXT = "I'm improving my tones with FlappyTone, can you beat me?";

/** Per-tone shape, for the copied-text fallback's Wordle-style block. */
const TONE_EMOJI: Record<number, string> = {
  1: "➡️",
  2: "↗️",
  3: "↘️",
  4: "↙️",
};

function challengeUrl(score: number): string {
  return `${SITE_URL}/?ref=share&c=${score}`;
}

/** Wordle-style block for the copy-to-clipboard fallback — the paste has to look like something on its own. */
function clipboardBlock(stats: RunStats, url: string): string {
  const squares = toneBreakdown(stats)
    .map((b) => TONE_EMOJI[b.tone])
    .join(" ");
  return `FlappyTone — I scored ${stats.score.toLocaleString()}\n${squares}\n${url}`;
}

export type ShareOutcome = "shared" | "shared_no_image" | "copied" | "cancelled" | "failed";

/**
 * Shares this run's result: image + tracked link via the Web Share API when
 * available, degrading through progressively simpler fallbacks. Never throws
 * — a share failure must never look like a crash (same rule analytics
 * follows, see src/analytics/session.ts's own doc comment).
 */
export async function shareRunResult(
  stats: RunStats,
  pngBlob: Blob,
): Promise<ShareOutcome> {
  const url = challengeUrl(stats.score);
  // The link goes in `url` only, not repeated inside `text` — most share
  // targets (Messages, Mail, Notes) append `url` to the shared text
  // themselves, so folding it into `text` too showed it twice in practice.
  const text = SHARE_TEXT;

  try {
    const file = new File([pngBlob], "flappytone-result.png", { type: "image/png" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: "FlappyTone", text, url, files: [file] });
      return "shared";
    }

    if (navigator.share) {
      await navigator.share({ title: "FlappyTone", text, url });
      return "shared_no_image";
    }
  } catch (err) {
    // AbortError: the player closed the share sheet — not a failure, just
    // stop here rather than falling through to a clipboard copy they didn't
    // ask for.
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // Any other navigator.share error falls through to the clipboard path.
  }

  try {
    await navigator.clipboard.writeText(clipboardBlock(stats, url));
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * Desktop nicety alongside the clipboard fallback: hands the player the PNG
 * directly, since desktop share sheets are weak or absent. Caller owns the
 * blob's lifetime — this only creates and revokes its own object URL.
 */
export function downloadShareCard(pngBlob: Blob, score: number): void {
  const url = URL.createObjectURL(pngBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flappytone-${score}.png`;
  a.click();
  URL.revokeObjectURL(url);
}
