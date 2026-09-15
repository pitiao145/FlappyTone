/**
 * The clip inventory, as the game sees it.
 *
 * A word is everything a gate needs: the corridor's shape and length, the audio
 * to cue it with, and the label to put in the HUD. PRD §6 makes "demo length
 * == gate length == polyline timeline" an invariant; with more than one
 * syllable in the inventory, carrying them together on one object is what
 * holds it.
 *
 * The source is the `words` table's catalog rows (`CatalogRow`, imported
 * type-only from `src/data/catalogRows.ts` so this module drags no
 * `src/data/` value into the landing-page chunk). `loadWords(manifest)`
 * remains as a thin adapter over the old `public/ref/manifest.json` shape,
 * for the Lab and older tests, until Task 13 removes it.
 *
 * Pure: parsing and selection only, no fetch. The fetch lives in `src/data/`.
 */

import type { Polyline } from "./tuning.ts";
import type { Tone } from "./gates.ts";
import type { CatalogRow } from "../data/catalogRows.ts";
import type { Tier } from "./tiers.ts";

export interface Word {
  /** The catalog row's id, and the key everything else is looked up by. */
  id: string;
  hanzi: string;
  pinyin: string;
  /**
   * English gloss, or "" when the glossary has no entry yet. Optional on the
   * wire and never a reason to drop a word: a missing translation costs one
   * line of HUD, a dropped word costs the whole gate.
   */
  english: string;
  tone: Tone;
  tones: Tone[];
  syllables: number;
  /** Object-storage key for the clip, under `public/ref/` until Task 7. */
  clipKey: string;
  /**
   * The tone window — the gate lasts exactly as long as the tone does.
   *
   * Not the length of the audio file: the clip is the whole take, which also
   * carries the consonant in front of the tone and whatever follows it. See
   * `clipS`. Three clocks, deliberately not folded together.
   */
  durationS: number;
  /**
   * Seconds of audio in front of the tone, inside the same file — the lead-in
   * and the consonant.
   *
   * The clip plays from 0 so the player hears the whole syllable; the corridor
   * and the demo dot start `onsetS` later, so the tone still begins at gate
   * t=0. 0 for any row that predates the field.
   */
  onsetS: number;
  /**
   * The whole file, in seconds — how long the cue is actually audible.
   *
   * What freezes the world during "listen", and what `isCueAudible` counts
   * down. Falls back to `onsetS + durationS` for a row written before the
   * clips became the raw takes, which is exactly what those clips were.
   */
  clipS: number;
  /** The measured contour, simplified to corridor vertices. */
  polyline: Polyline;
  /**
   * Game access: which tier's run may fly this word. The same value the clips
   * Worker enforces at `/clip/:id`, so the pool and the clip route agree.
   * Distinct from the visualiser's `wordsPerTone` practice depth.
   */
  minTier: "free" | "pro";
  updatedAt: string;
}

/** Longest a clip may be and still be a gate, in seconds. */
const MAX_DURATION_S = 3;

/**
 * A bad onset costs the consonant; a dropped clip costs the whole word. So
 * unlike every other field here, a nonsense value defaults rather than
 * rejecting — falling back to 0 is exactly the pre-onset behaviour, which was
 * wrong but playable.
 */
function readOnsetS(value: unknown, limitS: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < limitS
    ? value
    : 0;
}

/**
 * The file's length, and the bound the onset is checked against.
 *
 * A clip is the whole take now, so the onset can legitimately be longer than
 * the tone window it precedes — a T3 with 250ms of lead-in in front of a 350ms
 * tone is ordinary. Checking the onset against `durationS`, as this did when
 * the clip *was* the tone window, would silently zero exactly those.
 *
 * Absent, it means a manifest from before the clips became the takes. There
 * `onsetS + durationS` was the whole file by construction, so that is both the
 * right length and the right bound.
 */
function readClipS(value: unknown, durationS: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_DURATION_S
    ? Math.max(value, durationS)
    : null;
}

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
 * Reads catalog rows (the `words` table's shape) into words, dropping
 * anything malformed rather than throwing.
 *
 * A bad row is one missing word; a throw is a blank screen. The fetch that
 * produces these rows can return something stale, half-written, or from a
 * draft entry, so every field is checked — a corridor built from `undefined`
 * is an invisible wall the player collides with. Result is sorted by
 * `position`, the catalog's own ordering.
 */
export function wordsFromCatalog(rows: unknown): Word[] {
  if (!Array.isArray(rows)) return [];

  const entries: Array<{ word: Word; position: number }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    if (
      typeof r.id !== "string" ||
      typeof r.hanzi !== "string" ||
      typeof r.pinyin !== "string" ||
      typeof r.status !== "string" ||
      r.status !== "published" ||
      typeof r.clip_key !== "string" ||
      (r.min_tier !== "free" && r.min_tier !== "pro") ||
      typeof r.duration_s !== "number" ||
      !Number.isFinite(r.duration_s) ||
      r.duration_s <= 0 ||
      r.duration_s > MAX_DURATION_S ||
      typeof r.tone !== "number" ||
      ![1, 2, 3, 4].includes(r.tone) ||
      !isPolyline(r.polyline) ||
      seen.has(r.id)
    ) {
      continue;
    }
    seen.add(r.id);
    const clipS = readClipS(r.clip_s, r.duration_s);
    const onsetS = readOnsetS(r.onset_s, clipS ?? r.duration_s);
    const tone = r.tone as Tone;
    const tones = Array.isArray(r.tones)
      ? (r.tones.filter((t): t is Tone => [1, 2, 3, 4].includes(t as number)) as Tone[])
      : [tone];
    const position = typeof r.position === "number" && Number.isFinite(r.position) ? r.position : 0;
    entries.push({
      position,
      word: {
        id: r.id,
        hanzi: r.hanzi,
        pinyin: r.pinyin,
        english: typeof r.english === "string" ? r.english : "",
        tone,
        tones: tones.length > 0 ? tones : [tone],
        syllables: typeof r.syllables === "number" && Number.isFinite(r.syllables) ? r.syllables : 1,
        clipKey: r.clip_key,
        durationS: r.duration_s,
        onsetS,
        clipS: clipS ?? onsetS + r.duration_s,
        polyline: r.polyline,
        minTier: r.min_tier,
        updatedAt: typeof r.updated_at === "string" ? r.updated_at : "",
      },
    });
  }
  return entries.sort((a, b) => a.position - b.position).map((e) => e.word);
}

/**
 * Adapts the old `public/ref/manifest.json` shape into catalog rows, so
 * `loadWords` can stay a thin wrapper over `wordsFromCatalog` while the Lab
 * and older tests still speak the manifest shape. Removed in Task 13.
 */
function manifestToRows(manifest: unknown): CatalogRow[] {
  if (typeof manifest !== "object" || manifest === null) return [];
  const clips = (manifest as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) return [];
  return clips.map((clip, index) => {
    const c = (typeof clip === "object" && clip !== null ? clip : {}) as Record<string, unknown>;
    return {
      id: c.id as string,
      hanzi: c.hanzi as string,
      pinyin: c.pinyin as string,
      english: (c.english as string | undefined) ?? "",
      tone: c.tone as number,
      tones: [c.tone as number],
      syllables: 1,
      position: index,
      status: "published",
      min_tier: "free",
      clip_key: (c.file as string | undefined) ?? null,
      duration_s: c.durationS as number,
      onset_s: (c.onsetS as number | undefined) ?? null,
      clip_s: (c.clipS as number | undefined) ?? null,
      polyline: c.polyline,
      updated_at: "",
    } as CatalogRow;
  });
}

/**
 * Reads a manifest into words — a thin adapter over `wordsFromCatalog`, kept
 * for the Lab and older tests until Task 13 removes the manifest path
 * entirely. See `manifestToRows`.
 */
export function loadWords(manifest: unknown): Word[] {
  return wordsFromCatalog(manifestToRows(manifest));
}

/**
 * The words a given tier's GAME may use — the run's pool, and the visualiser's
 * clip access. Pro gets everything the catalog shipped; free and guest both
 * stop at `minTier: "free"` (guest reads the same slice as free: Gate 2 is
 * depth and content, not run quantity).
 *
 * This is the client's half of the same gate the clips Worker enforces at
 * `/clip/:id`, so a word a tier can fly is a word whose clip it can fetch.
 * Nothing in the shipped catalog is `"pro"` today, so every tier gets all 120.
 * Not to be confused with `wordsOfTone`'s `limit` — a COUNT, and the
 * visualiser's practice depth only.
 */
export function wordsForTier(words: Word[], tier: Tier): Word[] {
  return tier === "pro" ? words : words.filter((w) => w.minTier === "free");
}

/**
 * The words of one tone, in inventory order.
 *
 * `limit` slices to the first `limit` words in inventory order — fixed and
 * deterministic, so a free player sees the same words every session. Default
 * `Infinity` (no slice): gameplay callers (`pickWord`, feeding the scored
 * game/drill/learn) must never run out of words for a gated tier, so they
 * keep the unrestricted call. Only the practice/selection surface (the
 * Visualiser's per-tone word list) passes a tier's `wordsPerTone` limit.
 */
export function wordsOfTone(words: Word[], tone: Tone, limit: number = Infinity): Word[] {
  const pool = words.filter((w) => w.tone === tone);
  return Number.isFinite(limit) ? pool.slice(0, Math.max(0, limit)) : pool;
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
