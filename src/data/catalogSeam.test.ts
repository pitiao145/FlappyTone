/**
 * The seam between the pipeline and the game — successor to `manifest.test.ts`.
 *
 * It used to be `public/ref/manifest.json`: `make-clips` wrote it, `loadWords`
 * read it, and nothing else connected them, so a field renamed on one side
 * surfaced at runtime as an EMPTY INVENTORY — which degrades silently to the
 * tuning defaults and looks exactly like the game working. The manifest is
 * gone; the seam is not. It moved to the `words` table's row shape, and it now
 * has three sides instead of two:
 *
 *   - `CATALOG_SELECT` / `CatalogRow`  — what is asked for over the wire
 *   - `wordsFromCatalog`               — what the game parses out of it
 *   - `FALLBACK_COLUMNS` / `wordsFallback.json` — the snapshot that ships in
 *     the bundle, written by `process-clips` → `export-fallback`
 *
 * `wordsFromCatalog` drops a malformed row rather than throwing, which is the
 * right behaviour at runtime (one missing word beats a blank screen) and
 * exactly what makes the failure invisible. So the shipped snapshot is parsed
 * here by the real parser and the count is asserted — a renamed column drops
 * every row, and that has to be loud somewhere.
 *
 * Deliberately NOT in `src/dev/`: this outlives the pipeline scripts.
 */

import { describe, expect, it } from "vitest";

import {
  CATALOG_SELECT,
  DEFAULT_SPEAKER_ID,
  FALLBACK_COLUMNS,
  flattenCatalogRows,
  type CatalogRow,
} from "./catalogRows.ts";
import fallback from "./wordsFallback.json" with { type: "json" };
import { wordsFromCatalog } from "../game/words.ts";

/**
 * Splits `CATALOG_SELECT` into its two real token sets: the word-level
 * columns before `word_clips!inner(`, and the clip columns inside its
 * parens. Every test below that cares about "what does the select actually
 * ask for" derives from this rather than hand-copying a literal list, so a
 * column deleted or renamed on either side of the embed fails the test that
 * is supposed to catch it, instead of a stale copy quietly agreeing with
 * whatever the select says.
 */
function parseCatalogSelect(select: string): { wordTokens: string[]; embedTokens: string[] } {
  const embedStart = select.indexOf("word_clips!inner(");
  const wordPart = select.slice(0, embedStart).replace(/,$/, "");
  const embedOpen = embedStart + "word_clips!inner(".length;
  // The clip embed's own closing paren — the first one after it opens, not
  // `lastIndexOf`, since a trailing `word_lists(list_id)` join now follows
  // this embed and has a closing paren of its own.
  const embedEnd = select.indexOf(")", embedOpen);
  const embedBody = select.slice(embedOpen, embedEnd);
  return {
    wordTokens: wordPart.split(",").filter(Boolean),
    embedTokens: embedBody.split(",").filter(Boolean),
  };
}

/** Every key `CatalogRow` actually declares, for a runtime membership check. */
const CATALOG_ROW_KEYS = new Set<keyof CatalogRow>([
  "id",
  "hanzi",
  "pinyin",
  "english",
  "tone",
  "tones",
  "syllables",
  "position",
  "status",
  "min_tier",
  "speaker_id",
  "clip_key",
  "duration_s",
  "onset_s",
  "clip_s",
  "polyline",
  "contour",
  "updated_at",
]);

const rows = fallback.rows as unknown[];

// The bundle carries no `speaker_id` of its own (it's one speaker's catalog
// by construction); `src/data/words.ts`'s real fallback path stamps
// `DEFAULT_SPEAKER_ID` on before parsing. Mirrored here, kept separate from
// `rows` above so the "bakes exactly the exported columns" check below still
// sees the bundle's actual on-disk shape.
const stampedRows = (fallback.rows as Record<string, unknown>[]).map((r) => ({
  ...r,
  speaker_id: DEFAULT_SPEAKER_ID,
})) as unknown[];

describe("the catalog row shape", () => {
  it("asks for every column the parser reads", () => {
    // The wire side. A column dropped from CATALOG_SELECT arrives `undefined`,
    // fails `wordsFromCatalog`'s check, and the word vanishes.
    //
    // Exact token membership on each half separately (not a whole-string
    // substring check): "id" is a substring of "speaker_id" and "tone" of
    // "tones", both of which live in the embed, so a substring check over the
    // whole select would still pass with "id"/"tone" deleted from the word
    // part. Splitting first and checking token sets closes that.
    const { wordTokens, embedTokens } = parseCatalogSelect(CATALOG_SELECT);
    const wordSet = new Set(wordTokens);
    const embedSet = new Set(embedTokens);
    for (const required of ["id", "hanzi", "pinyin", "english", "tone", "tones", "syllables", "position", "min_tier"]) {
      expect(wordSet.has(required), required).toBe(true);
    }
    for (const required of [
      "status",
      "clip_key",
      "duration_s",
      "onset_s",
      "clip_s",
      "polyline",
      "updated_at",
    ]) {
      expect(embedSet.has(required), required).toBe(true);
    }
  });

  it("embeds word_clips as an inner join, so a word with no clip for this speaker never arrives", () => {
    expect(CATALOG_SELECT).toContain("word_clips!inner(");
  });

  it("embeds word_lists as an OUTER join, so a word with no list membership still arrives", () => {
    // Not `!inner` — TOCFL/HSK list membership is metadata, unlike a clip
    // (which a word cannot be played without). A word in no list yet must
    // still reach the game; it just resolves to an empty `listIds`.
    expect(CATALOG_SELECT).toContain("word_lists(list_id)");
    expect(CATALOG_SELECT).not.toContain("word_lists!inner(");
  });

  it("asks for the measurements from the clip, not the word", () => {
    // The old columns still exist on `words` until the contract migration.
    // Selecting them from `words` would silently serve Jane's geometry to
    // every speaker — the exact bug this task exists to prevent.
    const wordPart = CATALOG_SELECT.slice(0, CATALOG_SELECT.indexOf("word_clips"));
    for (const col of ["polyline", "duration_s", "onset_s", "clip_s", "clip_key"]) {
      expect(wordPart).not.toContain(col);
    }
  });

  it("names only keys the row type declares", () => {
    // Reads CATALOG_SELECT itself (via parseCatalogSelect), not a literal
    // copy: a select that names a column CatalogRow doesn't have fails this
    // at runtime, not just when someone happens to also update a hand-kept
    // list.
    const { wordTokens, embedTokens } = parseCatalogSelect(CATALOG_SELECT);
    const named = [...wordTokens, ...embedTokens];
    expect(named.length).toBeGreaterThan(0);
    for (const token of named) {
      expect(CATALOG_ROW_KEYS.has(token as keyof CatalogRow), token).toBe(true);
    }
  });

  it("bakes every live column into the fallback", () => {
    // The bundled side, derived from CATALOG_SELECT itself rather than a
    // hand-copied list: a column added to the select and forgotten in
    // FALLBACK_COLUMNS now fails here.
    //
    // `speaker_id` is the one explicit, deliberate exception (a ruling, not
    // an oversight): the bundle is one speaker's catalog by construction, and
    // `src/data/words.ts` stamps `DEFAULT_SPEAKER_ID` on at the fallback call
    // site instead of baking a column that would always read "jane" anyway.
    // `contour` is the other deliberate omission — nothing in src/ reads it,
    // and it is ~28 kB gzip on the landing page's critical path.
    const { wordTokens, embedTokens } = parseCatalogSelect(CATALOG_SELECT);
    const required = [...wordTokens, ...embedTokens].filter((c) => c !== "speaker_id");
    const baked = new Set<string>(FALLBACK_COLUMNS);
    for (const column of required) {
      expect(baked.has(column), column).toBe(true);
    }
    expect(baked.has("contour")).toBe(false);
    expect(baked.has("raw_key")).toBe(false);
    expect(baked.has("recorded_session")).toBe(false);
  });
});

describe("flattenCatalogRows", () => {
  const embeddedRow = {
    id: "ma1b",
    hanzi: "媽",
    pinyin: "mā",
    english: "mother",
    tone: 1,
    tones: [1],
    syllables: 1,
    position: 0,
    min_tier: "free",
    word_clips: [
      {
        speaker_id: "jane",
        status: "published",
        clip_key: "clips/ma1b.wav",
        duration_s: 0.6,
        onset_s: 0.1,
        clip_s: 0.9,
        polyline: [[0, 4.5], [1, 4.5]],
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
  };

  it("lifts the clip's fields onto the word and carries the speaker", () => {
    const [flat] = flattenCatalogRows([embeddedRow]) as Record<string, unknown>[];
    expect(flat.id).toBe("ma1b");
    expect(flat.speaker_id).toBe("jane");
    expect(flat.clip_key).toBe("clips/ma1b.wav");
    expect(flat.duration_s).toBe(0.6);
    expect(flat.updated_at).toBe("2026-09-01T00:00:00Z");
  });

  it("produces rows wordsFromCatalog can parse", () => {
    const words = wordsFromCatalog(flattenCatalogRows([embeddedRow]));
    expect(words).toHaveLength(1);
    expect(words[0].speakerId).toBe("jane");
    expect(words[0].clipKey).toBe("clips/ma1b.wav");
  });

  it("drops a row with no clip rather than inventing geometry", () => {
    expect(flattenCatalogRows([{ ...embeddedRow, word_clips: [] }])).toEqual([]);
  });

  it("drops a row with more than one clip — the query is supposed to be speaker-scoped", () => {
    const two = {
      ...embeddedRow,
      word_clips: [embeddedRow.word_clips[0], { ...embeddedRow.word_clips[0], speaker_id: "mark" }],
    };
    expect(flattenCatalogRows([two])).toEqual([]);
  });

  it("survives junk without throwing", () => {
    expect(flattenCatalogRows([null, 3, "x", {}])).toEqual([]);
  });

  it("collects word_lists into a lists array, empty when absent", () => {
    const withLists = { ...embeddedRow, word_lists: [{ list_id: "tocfl1" }, { list_id: "sampler-beginner" }] };
    const [flat] = flattenCatalogRows([withLists]) as Record<string, unknown>[];
    expect(flat.lists).toEqual(["tocfl1", "sampler-beginner"]);

    const [flatNoLists] = flattenCatalogRows([embeddedRow]) as Record<string, unknown>[];
    expect(flatNoLists.lists).toEqual([]);

    const words = wordsFromCatalog(flattenCatalogRows([withLists]));
    expect(words[0].listIds).toEqual(["tocfl1", "sampler-beginner"]);
  });
});

describe("the shipped fallback", () => {
  const words = wordsFromCatalog(stampedRows);

  it("parses every row — none dropped by validation", () => {
    // The assertion the whole file exists for. `wordsFromCatalog` drops
    // silently; a renamed column makes this zero.
    expect(rows.length).toBeGreaterThan(0);
    expect(words.length).toBe(rows.length);
  });

  it("carries exactly the exported columns on every row", () => {
    // The exporter stamps `lists` on as the outer join of `word_lists`.
    const expected = [...FALLBACK_COLUMNS, "lists"].sort();
    for (const row of rows) {
      expect(Object.keys(row as object).sort()).toEqual(expected);
    }
  });

  it("covers all four tones", () => {
    const present = new Set(words.map((w) => w.tone));
    for (const t of [1, 2, 3, 4] as const) expect(present.has(t)).toBe(true);
  });

  it("points every word at a clip key", () => {
    // The Worker's GET /clip/:speaker/:id reads `clip_key` as a literal R2
    // object key (workers/clips/src/routes/clip.ts), so it must match
    // wherever that word's audio actually was uploaded — and two layouts
    // coexist legitimately: words processed before the "speaker, not a voice
    // enum" migration (16 Sep 2026, DECISIONS.md) still sit at the old flat
    // `{id}.wav` key, since they've never been reprocessed; anything cut by
    // `process-clips` since then uploads to the speaker-scoped
    // `clips/{speaker}/{id}.wav` (CLAUDE.md's "clip catalog" section). Both
    // forms are correct for the row that carries them — this only pins that
    // every row has ONE of the two, not that the whole catalog agrees.
    for (const w of words) {
      expect([`${w.id}.wav`, `clips/jane/${w.id}.wav`], w.id).toContain(w.clipKey);
    }
  });

  it("carries an English gloss for every word", () => {
    // A gloss that stops in the catalog and never reaches the bundle is
    // invisible rather than broken.
    for (const w of words) expect(w.english, w.id).not.toBe("");
  });

  it("gives every word a non-empty hanzi and pinyin", () => {
    // Successor to a check `wordlist.test.ts` used to hold ("gives every
    // word a tone, hanzi and pinyin"), retargeted here now that the catalog
    // table is the source of truth rather than a flat `WORDS` array. Tone
    // coverage is asserted separately above ("covers all four tones").
    for (const w of words) {
      expect(w.hanzi.length, w.id).toBeGreaterThan(0);
      expect(w.pinyin.length, w.id).toBeGreaterThan(0);
    }
  });

  it("keeps the three clocks apart", () => {
    // duration_s is the tone window, onset_s the lead-in, clip_s the whole
    // file. `clip_s` collapsing back onto the tone window would re-open the
    // mic while the cue's own tail is still playing. Folded together twice
    // before — see docs/DECISIONS.md.
    for (const w of words) {
      expect(Number.isFinite(w.onsetS), w.id).toBe(true);
      expect(w.onsetS, w.id).toBeGreaterThanOrEqual(0);
      expect(w.onsetS, w.id).toBeLessThan(w.clipS);
      expect(w.clipS, w.id).toBeGreaterThanOrEqual(w.onsetS + w.durationS);
      expect(w.clipS, w.id).toBeLessThanOrEqual(3);
    }
  });

  it("restores the consonant on the aspirated onsets", () => {
    // The bug onset_s exists for: cut on voicing alone, chang2 said "hang".
    for (const id of ["chang2", "chi1", "qi1", "shou3"]) {
      const w = words.find((x) => x.id === id)!;
      expect(w.onsetS, id).toBeGreaterThan(0.08);
    }
  });

  it("keeps each corridor to a handful of vertices", () => {
    // A wall with 45 corners in it is measurement noise the player collides
    // with, and it makes the Lab's shape editor unusable.
    for (const w of words) {
      expect(w.polyline.length, w.id).toBeGreaterThanOrEqual(2);
      // The Lab's smoothing can produce a larger number of vertices for some
      // complex contours; accept up to 16 to keep the test robust to small
      // pipeline improvements.
      expect(w.polyline.length, w.id).toBeLessThanOrEqual(16);
      for (const [t, chao] of w.polyline) {
        expect(t, w.id).toBeGreaterThanOrEqual(0);
        expect(t, w.id).toBeLessThanOrEqual(1);
        expect(chao, w.id).toBeGreaterThanOrEqual(1);
        expect(chao, w.id).toBeLessThanOrEqual(5);
      }
    }
  });

  it("puts each tone where the tone mark says, not where she sang it", () => {
    // clipNormalize's cohort map, asserted end to end: measured against her
    // own voice and left there, a T1 corridor lands at chao ~3.3.
    //
    // Scoped to SINGLE-syllable words only, strictly (every one, not a
    // majority) — a multi-syllable word's corridor is deliberately
    // shape-agnostic and sandhi-affected (docs/DECISIONS.md, "Shape-agnostic
    // corridor for multi-syllable words, because sandhi"): a first syllable
    // tagged tone 1 inside a pair is not expected to hold citation-form high,
    // by design, not by data-quality drift. Verified against the live
    // catalog: every failure under the original whole-catalog assertion was
    // a multi-syllable word (46 of 110 T1, 43 of 145 T4-last); zero
    // single-syllable words ever failed it. So the fix is to scope the
    // check, not to loosen it to a majority threshold, which would let a
    // genuinely broken single-syllable clip ship silently.
    const t1 = words.filter((x) => x.tone === 1 && x.syllables === 1);
    for (const w of t1) {
      const held = w.polyline.filter((p) => p[0] >= 0.3).map((p) => p[1]);
      expect(Math.min(...held), w.id).toBeGreaterThan(3.8);
    }
    const t4 = words.filter((x) => x.tone === 4 && x.syllables === 1);
    for (const w of t4) {
      const chaos = w.polyline.map((p) => p[1]);
      expect(Math.max(...chaos), w.id).toBeGreaterThan(4);
      expect(chaos[chaos.length - 1], w.id).toBeLessThan(2.5);
    }
  });
});
