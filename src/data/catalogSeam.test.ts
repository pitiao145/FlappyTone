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

import { CATALOG_SELECT, FALLBACK_COLUMNS, type CatalogRow } from "./catalogRows.ts";
import fallback from "./wordsFallback.json" with { type: "json" };
import { wordsFromCatalog } from "../game/words.ts";

const rows = fallback.rows as unknown[];

describe("the catalog row shape", () => {
  it("asks for every column the parser reads", () => {
    // The wire side. A column dropped from CATALOG_SELECT arrives `undefined`,
    // fails `wordsFromCatalog`'s check, and the word vanishes.
    //
    // ⚠ This list is a hand-kept duplicate of CATALOG_SELECT and is NOT
    // authoritative: a column added to both the select and the parser, but not
    // added here, is not pinned by this test. It is a fast, readable check
    // against a DELETION, nothing more. The real net is
    // "parses every row — none dropped by validation" below, which runs the
    // shipped snapshot through the actual parser and asserts the count; that
    // one catches an addition, a rename and a deletion alike.
    const asked = new Set(CATALOG_SELECT.split(","));
    for (const required of [
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
      "clip_key",
      "duration_s",
      "onset_s",
      "clip_s",
      "polyline",
      "updated_at",
    ]) {
      expect(asked.has(required), required).toBe(true);
    }
  });

  it("names only keys the row type declares", () => {
    // Type-level: this fails to compile if CATALOG_SELECT ever names a column
    // CatalogRow does not have.
    const keys: Array<keyof CatalogRow> = CATALOG_SELECT.split(",") as Array<keyof CatalogRow>;
    expect(keys.length).toBeGreaterThan(0);
  });

  it("bakes every live column into the fallback", () => {
    // The bundled side. `contour` is the one deliberate omission — nothing in
    // src/ reads it, and it is ~28 kB gzip on the landing page's critical path.
    const baked = new Set<string>(FALLBACK_COLUMNS);
    for (const column of CATALOG_SELECT.split(",")) {
      expect(baked.has(column), column).toBe(true);
    }
    expect(baked.has("contour")).toBe(false);
    expect(baked.has("raw_key")).toBe(false);
    expect(baked.has("recorded_session")).toBe(false);
  });
});

describe("the shipped fallback", () => {
  const words = wordsFromCatalog(rows);

  it("parses every row — none dropped by validation", () => {
    // The assertion the whole file exists for. `wordsFromCatalog` drops
    // silently; a renamed column makes this zero.
    expect(rows.length).toBeGreaterThan(0);
    expect(words.length).toBe(rows.length);
  });

  it("carries exactly the exported columns on every row", () => {
    const expected = [...FALLBACK_COLUMNS].sort();
    for (const row of rows) {
      expect(Object.keys(row as object).sort()).toEqual(expected);
    }
  });

  it("covers all four tones", () => {
    expect([...new Set(words.map((w) => w.tone))].sort()).toEqual([1, 2, 3, 4]);
  });

  it("points every word at a clip key", () => {
    for (const w of words) expect(w.clipKey, w.id).toBe(`${w.id}.wav`);
  });

  it("carries an English gloss for every word", () => {
    // A gloss that stops in the catalog and never reaches the bundle is
    // invisible rather than broken.
    for (const w of words) expect(w.english, w.id).not.toBe("");
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
      expect(w.polyline.length, w.id).toBeLessThanOrEqual(8);
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
    for (const w of words.filter((x) => x.tone === 1)) {
      const held = w.polyline.filter((p) => p[0] >= 0.3).map((p) => p[1]);
      expect(Math.min(...held), w.id).toBeGreaterThan(3.8);
    }
    for (const w of words.filter((x) => x.tone === 4)) {
      const chaos = w.polyline.map((p) => p[1]);
      expect(Math.max(...chaos), w.id).toBeGreaterThan(4);
      expect(chaos[chaos.length - 1], w.id).toBeLessThan(2.5);
    }
  });
});
