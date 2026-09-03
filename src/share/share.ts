/**
 * The share payload + fallback chain — see docs/flappytone-SPEC-share.md
 * "Part 2". Kept separate from GameOver.tsx's click handler so the
 * navigator.share/canShare/clipboard branching lives in one place.
 */

import { toneBreakdown, type RunStats } from "../game/scoring.ts";
import { APP_PATH } from "../ui/appLink.ts";

const SITE_URL = "https://flappytone.com";
const SHARE_TEXT = "I'm improving my tones with FlappyTone, can you beat me?";

/** Per-tone shape, for the copied-text fallback's Wordle-style block. */
const TONE_EMOJI: Record<number, string> = {
  1: "➡️",
  2: "↗️",
  3: "↘️",
  4: "↙️",
};

/**
 * `?c=<score>` is only ever read by GameApp.tsx, which mounts at `/app` —
 * the marketing landing page at `/` has no idea what `c` means (see
 * CLAUDE.md's "Three entries" split). A link to `/` would silently drop the
 * challenge the moment someone opens it, so the clickable `url` has to point
 * at `/app` even though the card's own printed pill stays the clean
 * `flappytone.com` (see renderCard.ts — that text is not a link).
 */
function challengeUrl(score: number): string {
  return `${SITE_URL}${APP_PATH}?ref=share&c=${score}`;
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

  try {
    const file = new File([pngBlob], "flappytone-result.png", { type: "image/png" });

    if (navigator.canShare?.({ files: [file] })) {
      // The link is folded into `text` here rather than passed as a
      // separate `url` field: with an image already attached, a standalone
      // `url` field lets some share targets' rich-paste path (notably
      // Notes.app via the OS share sheet's own "Copy" action) additionally
      // unfurl the link into its own preview card — which fetches the
      // site's OG image and pastes as a second, different-looking image
      // alongside the card. Embedding the link as plain characters inside
      // `text` avoids that second fetch while still reading fine as a link
      // in every target that matters here.
      await navigator.share({
        title: "FlappyTone",
        text: `${SHARE_TEXT} ${url}`,
        files: [file],
      });
      return "shared";
    }

    if (navigator.share) {
      // No image attached — `url` stays a separate field here, since some
      // targets only read `url` and others only read `text`; that
      // duplication risk only exists once a file is also on the clipboard.
      await navigator.share({ title: "FlappyTone", text: SHARE_TEXT, url });
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
