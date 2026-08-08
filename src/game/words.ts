/**
 * The clip inventory, as the game sees it.
 *
 * A word is everything a gate needs: the corridor's shape and length, the audio
 * to cue it with, and the label to put in the HUD — all measured from one take
 * by `npm run make-clips`, which writes `public/ref/manifest.json`. PRD §6 makes
 * "demo length == gate length == polyline timeline" an invariant; with more than
 * one syllable in the inventory, carrying them together on one object is what
 * holds it.
 *
 * Pure: parsing and selection only, no fetch. The fetch lives in `src/ui/`.
 */

import type { Polyline } from "./tuning.ts";
import type { Tone } from "./gates.ts";

export interface Word {
  /** Filename stem, and the key everything else is looked up by. */
  id: string;
  hanzi: string;
  pinyin: string;
  tone: Tone;
  /** Filename under `public/ref/`. */
  file: string;
  /** The clip's own length — the gate lasts exactly as long as the demo. */
  durationS: number;
  /** The measured contour, simplified to corridor vertices. */
  polyline: Polyline;
}

/** Longest a clip may be and still be a gate, in seconds. */
const MAX_DURATION_S = 3;

function isPolyline(value: unknown): value is Polyline {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        typeof p[0] === "number" &&
        typeof p[1] === "number" &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]),
    )
  );
}

/**
 * Reads a manifest into words, dropping anything malformed rather than throwing.
 *
 * A bad entry is one missing word; a throw is a blank screen. The manifest is
 * fetched at runtime and can be stale, half-written, or from an older cutter, so
 * every field is checked — a corridor built from `undefined` is an invisible
 * wall the player collides with.
 */
export function loadWords(manifest: unknown): Word[] {
  if (typeof manifest !== "object" || manifest === null) return [];
  const clips = (manifest as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) return [];

  const words: Word[] = [];
  const seen = new Set<string>();
  for (const clip of clips) {
    if (typeof clip !== "object" || clip === null) continue;
    const c = clip as Record<string, unknown>;
    if (
      typeof c.id !== "string" ||
      typeof c.hanzi !== "string" ||
      typeof c.pinyin !== "string" ||
      typeof c.file !== "string" ||
      typeof c.durationS !== "number" ||
      !Number.isFinite(c.durationS) ||
      c.durationS <= 0 ||
      c.durationS > MAX_DURATION_S ||
      typeof c.tone !== "number" ||
      ![1, 2, 3, 4].includes(c.tone) ||
      !isPolyline(c.polyline) ||
      seen.has(c.id)
    ) {
      continue;
    }
    seen.add(c.id);
    words.push({
      id: c.id,
      hanzi: c.hanzi,
      pinyin: c.pinyin,
      tone: c.tone as Tone,
      file: c.file,
      durationS: c.durationS,
      polyline: c.polyline,
    });
  }
  return words;
}

/** The words of one tone, in inventory order. */
export function wordsOfTone(words: Word[], tone: Tone): Word[] {
  return words.filter((w) => w.tone === tone);
}

/**
 * Picks a word of `tone`, avoiding the ones most recently played.
 *
 * The avoidance is a soft window rather than a shuffle bag: a run is short and
 * the pool is 30 deep, so what matters is not hearing the same syllable twice in
 * a minute, and a bag would add ordering state for no audible gain. Falls back
 * to the whole pool when the window has eaten it, which is what happens in the
 * tutorial and in tests with a small injected inventory.
 */
const RECENT_WINDOW = 6;

export function pickWord(
  words: Word[],
  tone: Tone,
  recent: Word[],
  rand: () => number,
): Word | null {
  const pool = wordsOfTone(words, tone);
  if (pool.length === 0) return null;
  const avoid = new Set(recent.slice(-RECENT_WINDOW).map((w) => w.id));
  const fresh = pool.filter((w) => !avoid.has(w.id));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}

/** Every tone the inventory can actually build a gate for. */
export function availableTones(words: Word[]): Tone[] {
  return ([1, 2, 3, 4] as Tone[]).filter((t) => words.some((w) => w.tone === t));
}
