/**
 * The clip inventory, as the game sees it.
 *
 * A word is everything a gate needs: the corridor's shape and length, the audio
 * to cue it with, and the label to put in the HUD. PRD §6 makes "demo length
 * == gate length == polyline timeline" an invariant; with more than one
 * syllable in the inventory, carrying them together on one object is what
 * holds it.
 *
 * The source is the `words` table's catalog rows, shaped by
 * `src/data/catalogRows.ts`'s `CatalogRow`/`CATALOG_SELECT` — `wordsFromCatalog`
 * below takes `unknown` and validates field-by-field rather than importing
 * that type, so this module drags no `src/data/` value into the
 * landing-page chunk. The old `public/ref/manifest.json` adapter
 * (`loadWords`/`manifestToRows`) was removed in Task 13 (Sep 2026) —
 * `wordsFromCatalog` is the only entry point now.
 *
 * Pure: parsing and selection only, no fetch. The fetch lives in `src/data/`.
 */

import type { Polyline } from "./tuning.ts";
import type { Tone } from "./gates.ts";
import { tierLimits, type Proficiency, type Tier, type TocflLevel } from "./tiers.ts";
import type { RunMode } from "./run.ts";

/**
 * A TOCFL level, or "mix" (every level this tier/proficiency allows). Mirrors
 * `src/game/settings.ts`'s `LevelChoice` — redefined rather than imported, to
 * avoid a value-level import cycle (`settings.ts` imports from `run.ts`,
 * which imports this file).
 */
export type LevelChoice = TocflLevel | "mix";

export interface Word {
  /** The catalog row's id, and the key everything else is looked up by. */
  id: string;
  hanzi: string;
  pinyin: string;
  /**
   * Which speaker's recording this word's audio and geometry come from.
   * Part of the cache key everywhere a clip is stored, because a cached entry
   * keyed on id alone serves the wrong voice with no error.
   */
  speakerId: string;
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
   * Worker enforces at `/clip/:speaker/:id`, so the pool and the clip route agree.
   * Distinct from the visualiser's `wordsPerTone` practice depth.
   */
  minTier: "free" | "pro";
  updatedAt: string;
  /**
   * TOCFL/HSK/sampler `lists.id` membership (e.g. `"tocfl1"`, `"sampler-beginner"`),
   * via `word_lists`. Empty for a row from before this field existed — never a
   * reason to drop the word, only to exclude it from any list-scoped pool.
   */
  listIds: string[];
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
      typeof r.speaker_id !== "string" ||
      r.speaker_id === "" ||
      typeof r.status !== "string" ||
      r.status !== "published" ||
      typeof r.clip_key !== "string" ||
      (r.min_tier !== "free" && r.min_tier !== "pro") ||
      typeof r.duration_s !== "number" ||
      !Number.isFinite(r.duration_s) ||
      r.duration_s <= 0 ||
      r.duration_s > MAX_DURATION_S ||
      typeof r.tone !== "number" ||
      ![0, 1, 2, 3, 4].includes(r.tone) ||
      !isPolyline(r.polyline) ||
      seen.has(r.id)
    ) {
      continue;
    }
    seen.add(r.id);
    const clipS = readClipS(r.clip_s, r.duration_s);
    const onsetS = readOnsetS(r.onset_s, clipS ?? r.duration_s);
    const tone = r.tone as Tone;
    // 0 (neutral tone) is kept here even though it's never a valid `tone`
    // value above — `isMulti` reads it off `tones` to exclude a neutral-tone
    // word from the multi-syllable pool, so filtering it out here would hide
    // the exact word that gate exists to catch.
    const tones = Array.isArray(r.tones)
      ? (r.tones.filter((t): t is Tone => [0, 1, 2, 3, 4].includes(t as number)) as Tone[])
      : [tone];
    const position = typeof r.position === "number" && Number.isFinite(r.position) ? r.position : 0;
    entries.push({
      position,
      word: {
        id: r.id,
        hanzi: r.hanzi,
        pinyin: r.pinyin,
        speakerId: r.speaker_id,
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
        listIds: Array.isArray(r.lists) ? r.lists.filter((l): l is string => typeof l === "string") : [],
      },
    });
  }
  return entries.sort((a, b) => a.position - b.position).map((e) => e.word);
}

/**
 * The words a given tier's GAME may use — the run's pool, and the visualiser's
 * clip access. Pro gets everything the catalog shipped; free and guest both
 * stop at `minTier: "free"` (guest reads the same slice as free: Gate 2 is
 * depth and content, not run quantity).
 *
 * This is the client's half of the same gate the clips Worker enforces at
 * `/clip/:speaker/:id`, so a word a tier can fly is a word whose clip it can fetch.
 * Nothing in the shipped catalog is `"pro"` today, so every tier gets all 120.
 * Not to be confused with `wordsOfTone`'s `limit` — a COUNT, and the
 * visualiser's practice depth only.
 */
export function wordsForTier(words: Word[], tier: Tier): Word[] {
  return tier === "pro" ? words : words.filter((w) => w.minTier === "free");
}

/**
 * Narrows a (tier-filtered) pool to one or more TOCFL levels, or to the
 * fixed guest sampler — AND to the proficiency's own syllable range.
 *
 * Beginner is single-syllable only (`isSingle`); Intermediate is additive,
 * not a separate pool — single OR two-syllable (`isSingle(w) || isMulti(w)`,
 * i.e. every word the game currently knows how to fly at all). It is not
 * "no filter": the catalog already holds 15 three- and 2 four-syllable rows
 * (imported ahead of a mode for them), and `isMulti` itself is deliberately
 * `syllables === 2`, not `>= 2` (see its own doc comment) — Intermediate has
 * to stay in step with that cap rather than reopening it by omission.
 *
 * The syllable filter is unconditional, not just a property the sampler
 * lists happen to have. A real bug shipped from skipping this: the concrete-
 * level branch only filtered by TOCFL tag, so "Intermediate + TOCFL 1" could
 * leak a 3+-syllable tocfl1 word into a pool meant to stop at two — invisible
 * today only because almost no recorded word past two syllables currently
 * carries a `tocfl*` tag, not because the filter was correct. `isSingle`/
 * `isMulti` apply the same way regardless of whether `levels` is a concrete
 * set or `null` (the sampler case), so this stays correct as more content
 * gets tagged into real TOCFL levels.
 *
 * `levels: null` means "no level access" — resolves to the sampler list for
 * the given proficiency instead of an empty pool, since a guest's pre-game
 * screen never offers a level choice at all (see `tiers.ts`'s
 * `ProficiencyAccess`). Intermediate's sampler is the union of both sampler
 * tags (`sampler-beginner` + `sampler-intermediate`, 60 words today) rather
 * than `sampler-intermediate` alone — that tag was curated as "the 30
 * two-syllable sampler words," which is Beginner's complement, not
 * Intermediate's whole pool. Apply this AFTER `wordsForTier`, same
 * composition order `ModeSelect.tsx` already uses for `wordsForTier` →
 * tone/combo derivation.
 */
export function wordsForList(
  words: Word[],
  levels: (1 | 2 | 3)[] | null,
  proficiency: "beginner" | "intermediate",
): Word[] {
  const bySyllables = words.filter((w) => (proficiency === "beginner" ? isSingle(w) : isSingle(w) || isMulti(w)));
  if (levels === null) {
    if (proficiency === "beginner") {
      return bySyllables.filter((w) => w.listIds.includes("sampler-beginner"));
    }
    return bySyllables.filter(
      (w) => w.listIds.includes("sampler-beginner") || w.listIds.includes("sampler-intermediate"),
    );
  }
  const listIds = new Set(levels.map((level) => `tocfl${level}`));
  return bySyllables.filter((w) => w.listIds.some((id) => listIds.has(id)));
}

/**
 * Turns the pre-game screen's choice into the concrete level set to filter
 * on. `null` (this tier/proficiency has no level choice — guest) always wins,
 * regardless of `choice`: the picker is never shown, so there is nothing to
 * honour. `"mix"`/`null` choice means every level this tier/proficiency
 * allows; a specific level outside that set (a stale saved choice after a
 * downgrade, or a tampered value) falls back to the full allowed set rather
 * than an empty pool.
 */
export function resolveLevels(
  tier: Tier,
  proficiency: Proficiency,
  choice: LevelChoice | null,
): TocflLevel[] | null {
  const allowed = tierLimits()[tier][proficiency].levels;
  if (allowed === null) return null;
  if (choice === null || choice === "mix") return allowed;
  return allowed.includes(choice) ? [choice] : allowed;
}

/**
 * The full pool a `Run` of `mode` should draw from: tier → TOCFL
 * level/sampler → tone-pairs-per-combo cap, in that order.
 *
 * Only `"game"` and `"pairs"` read `proficiency`/`levelChoice` — `"learn"`
 * and `"tutorial"` pick by tone/fixed set already and are unaffected by the
 * level picker (there is no picker screen for them yet). `"game"` gets the
 * level filter because that's the mode the pre-game screen gates; `"pairs"`
 * skips it (no picker for pure Tone Pairs yet) but still gets the per-combo
 * cap, since that's a content-quantity rule independent of which screen led
 * there. `"drill"` is single-tone, single-syllable by nature, so it always
 * reads as Beginner proficiency at "mix" (every TOCFL level the tier's
 * Beginner access allows — sampler for guest, docs/Tiers.csv's own table).
 */
export function resolvedPool(
  words: Word[],
  tier: Tier,
  mode: RunMode,
  proficiency: Proficiency,
  levelChoice: LevelChoice | null,
): Word[] {
  const tiered = wordsForTier(words, tier);
  if (mode === "drill") {
    return wordsForList(tiered, resolveLevels(tier, "beginner", "mix"), "beginner");
  }
  if (mode === "game") {
    // No `capWordsPerCombo` here: `pairWordsPerCombo` is the TONE PAIRS MODE's
    // own cap (docs/Tiers.csv row 9, "Modes limits"), not a classic-mode
    // Intermediate-proficiency restriction — every tier, guest included, may
    // choose Intermediate and fly whatever its TOCFL level/sampler list
    // allows. Applying the cap here once zeroed guest's entire
    // sampler-intermediate pool (guest.pairWordsPerCombo === 0, meaning "no
    // Tone Pairs mode access"), which silently emptied every Intermediate
    // gate to the generic per-tone placeholder instead of the real recorded
    // pair words guest is supposed to see. Found via a live playtest.
    const levels = resolveLevels(tier, proficiency, levelChoice);
    // wordsForList itself enforces the proficiency's syllable count now
    // (both the sampler branch and the concrete-level branch), so no
    // extra filtering is needed here.
    return wordsForList(tiered, levels, proficiency);
  }
  if (mode === "pairs") {
    return capWordsPerCombo(tiered, tierLimits()[tier].pairWordsPerCombo);
  }
  return tiered;
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
  const pool = words.filter((w) => isSingle(w) && w.tone === tone);
  return Number.isFinite(limit) ? pool.slice(0, Math.max(0, limit)) : pool;
}

/**
 * Narrows `pool` to the words not yet drawn since the last time this group
 * cycled through fully, resetting (falling back to the whole group) once
 * every word in it has been drawn. `groupKey` scopes both the pool split and
 * the "already drawn" check — for a single-tone pool it is constant (every
 * word shares one group); for a shuffled multi-combo pool it is each word's
 * own combo, so one small combo emptying out doesn't force a reset on every
 * other combo's still-fresh words.
 *
 * The avoid-set is the group's own last `size - 1` plays (from `recent`,
 * which is never trimmed across a run) rather than the group's *entire*
 * history — history alone would forever contain the whole group after its
 * first cycle, permanently short-circuiting to "everything avoided, reset to
 * the whole pool" on every later draw and picking with replacement from
 * then on, never actually completing a second cycle. Sizing the window to
 * `groupSize - 1` and scoping it per group is what turns this into a real
 * shuffle-bag guarantee — a word repeats only after every other word in its
 * group has been drawn since its own last turn — where the previous
 * approach here (one fixed-size window shared across every tone/combo)
 * diluted across them and let a small pool, like the guest sampler's ~7-8
 * words per tone against a window sized for a 30-deep pool, repeat a word
 * well before the rest of its own pool had been heard.
 */
function freshPool(pool: Word[], recent: Word[], groupKey: (w: Word) => string): Word[] {
  const groups = new Map<string, Word[]>();
  for (const w of pool) {
    const k = groupKey(w);
    const g = groups.get(k);
    if (g) g.push(w);
    else groups.set(k, [w]);
  }
  const fresh: Word[] = [];
  for (const [k, groupWords] of groups) {
    const windowSize = groupWords.length - 1;
    // A single-word group can never avoid anything — `.slice(-0)` would
    // otherwise return the whole array (JS treats `-0` as `0`), permanently
    // "avoiding" the group's only word.
    const avoid =
      windowSize > 0
        ? new Set(
            recent
              .filter((w) => groupKey(w) === k)
              .slice(-windowSize)
              .map((w) => w.id),
          )
        : new Set<string>();
    const groupFresh = groupWords.filter((w) => !avoid.has(w.id));
    fresh.push(...(groupFresh.length > 0 ? groupFresh : groupWords));
  }
  return fresh;
}

/** Picks a word of `tone`, never repeating one until every word of that tone has played. */
export function pickWord(
  words: Word[],
  tone: Tone,
  recent: Word[],
  rand: () => number,
): Word | null {
  const pool = wordsOfTone(words, tone);
  if (pool.length === 0) return null;
  const from = freshPool(pool, recent, () => String(tone));
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}

/** Every tone the inventory can actually build a gate for. */
export function availableTones(words: Word[]): Tone[] {
  return ([1, 2, 3, 4] as Tone[]).filter((t) => words.some((w) => isSingle(w) && w.tone === t));
}

/** A word the classic single-syllable pool may draw from. */
export function isSingle(w: Word): boolean {
  return w.syllables === 1;
}

/**
 * A word the multi-syllable ("pairs") pool may draw from.
 *
 * Exactly two syllables — not "more than one" — because the catalog can now
 * hold 3+-syllable words (imported for later, not built for yet): capping
 * here keeps them inert in the DB until a mode is built for them, rather
 * than silently reaching the live pairs pool the moment `min_tier` allows
 * it. A neutral tone (0) inside the pair is allowed, unlike before: the
 * corridor is measured from the speaker's own recording (`shapeForWord`,
 * never a tone-keyed lookup), so a real word's natural neutral syllable
 * doesn't need excluding. No guard against "both syllables neutral" is
 * needed here — `wordsFromCatalog` already only ever produces a `Word`
 * whose `tone` is a real 1-4 value, and that value always comes from one of
 * `tones`' own entries, so a `Word` with no real tone anywhere cannot exist.
 * See docs/DECISIONS.md.
 */
export function isMulti(w: Word): boolean {
  return w.syllables === 2;
}

/** Every multi-syllable word in the inventory. */
export function multiWords(words: Word[]): Word[] {
  return words.filter(isMulti);
}

/** A stable, human-legible key for a tone combo, e.g. `"3-2"`. */
export function toneComboKey(tones: Tone[]): string {
  return tones.join("-");
}

/** Every distinct tone combo the multi-syllable inventory can build a gate for, sorted. */
export function availableToneCombos(words: Word[]): Tone[][] {
  const seen = new Map<string, Tone[]>();
  for (const w of multiWords(words)) {
    const key = toneComboKey(w.tones);
    if (!seen.has(key)) seen.set(key, w.tones);
  }
  return [...seen.values()].sort((a, b) => toneComboKey(a).localeCompare(toneComboKey(b)));
}

/**
 * The multi-syllable words matching one exact tone combo, in inventory order.
 *
 * `limit` slices to the first `limit` words of THIS combo — mirrors
 * `wordsOfTone`'s per-tone limit, but per-combo, for the free tier's
 * tone-pairs cap (`tierLimits().free.pairWordsPerCombo`). Unlike
 * `wordsOfTone`'s limit (visualiser depth only, gameplay never passes it),
 * this one IS meant to reach gameplay — Tone Pairs mode is real, scored play
 * for every tier that can reach it, so the cap has to apply where the
 * combo's pool is actually drawn from, not just a practice surface. Callers
 * compose this the same way `Game.tsx` already composes `wordsForTier`
 * before `run.setWords`.
 */
export function wordsOfCombo(words: Word[], tones: Tone[], limit: number = Infinity): Word[] {
  const key = toneComboKey(tones);
  const pool = multiWords(words).filter((w) => toneComboKey(w.tones) === key);
  return Number.isFinite(limit) ? pool.slice(0, Math.max(0, limit)) : pool;
}

/**
 * Caps EVERY combo in the inventory to `limit` words each, in one pass —
 * the shape `Game.tsx` needs when assembling a tier-capped pairs pool
 * up front (rather than per-draw), since `pickMultiWord`'s `combo: null`
 * shuffle draws across every combo from a single flat pool.
 */
export function capWordsPerCombo(words: Word[], limit: number): Word[] {
  if (!Number.isFinite(limit)) return words;
  const singles = words.filter((w) => !isMulti(w));
  const capped = availableToneCombos(words).flatMap((combo) => wordsOfCombo(words, combo, limit));
  return [...singles, ...capped];
}

/**
 * Picks a multi-syllable word, never repeating one until every word of its
 * combo has played. Mirrors `pickWord`/`freshPool`. `combo === null` shuffles
 * across every combo the inventory has — grouped per-combo, so one small
 * combo emptying out doesn't force a reset on every other combo's still-fresh
 * words; a combo narrows to an exact match (drill), a single group.
 */
export function pickMultiWord(
  words: Word[],
  combo: Tone[] | null,
  recent: Word[],
  rand: () => number,
): Word | null {
  const pool = combo ? wordsOfCombo(words, combo) : multiWords(words);
  if (pool.length === 0) return null;
  const from = freshPool(pool, recent, (w) => toneComboKey(w.tones));
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}
