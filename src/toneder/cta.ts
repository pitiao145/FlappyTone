/**
 * The public page's funnel CTA: after a round, the pair of tones the player
 * confused most, and a link into the game. Pure.
 *
 * The game cannot start filtered to a tone pair from a URL (yet), so the link
 * opens the plain game; `weak` rides along for `app_open` attribution only.
 */
import { appHref } from "../ui/appLink.ts";
import type { Answer, Tone } from "./toneTest.ts";

/** The two tones most confused in a round (any miss counts), lower first; null if no miss. */
export function weakPair(answers: readonly Answer[]): [Tone, Tone] | null {
  const n = new Map<string, number>();
  for (const a of answers) {
    if (a.picked === a.tone) continue;
    const k = [a.tone, a.picked].sort().join("-");
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [k, c] of [...n].sort()) if (!best || c > n.get(best)!) best = k;
  return best ? (best.split("-").map(Number) as [Tone, Tone]) : null;
}

/** `"2-3"`, or `"none"` for a perfect round. */
export function pairKey(pair: readonly [Tone, Tone] | null): string {
  return pair ? `${pair[0]}-${pair[1]}` : "none";
}

/** Parses `?weak=` back; null unless two different tones, lower first. */
export function parsePairKey(v: string | null): string | null {
  const m = v?.match(/^([1-4])-([1-4])$/);
  return m && m[1] < m[2] ? `${m[1]}-${m[2]}` : null;
}

/** The game link from the tone test, carrying the weak pair for attribution. */
export function gameHref(pagePath: string, pair: readonly [Tone, Tone] | null): string {
  const base = appHref(undefined, pagePath);
  return pair ? `${base}&weak=${pairKey(pair)}` : base;
}
