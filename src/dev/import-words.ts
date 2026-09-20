/**
 * Imports a word list into the `words` catalog.
 *
 *   npm run import-words path/to/list.csv
 *   npm run import-words path/to/list.csv -- --dry-run
 *
 * Input is a CSV (or TSV) with a REQUIRED header row naming its columns:
 *
 *   hanzi,pinyin,english,lists
 *   媽,mā,mother,core-120
 *   學校,xué xiào,school,core-120;hsk1
 *
 * `hanzi` and `pinyin` are required; `english` and `lists` are optional, and
 * `lists` is a `;`-separated set of list ids the word belongs to. Blank lines
 * and lines starting with `#` are ignored. Columns may appear in any order —
 * the header is what names them, not their position, because a list edited in
 * a spreadsheet gets its columns moved.
 *
 * This used to rewrite `src/record/wordlist.ts`. It writes the database now:
 * `words`, `lists` and `word_lists`, upserted by primary key so re-running an
 * edited file refreshes rather than duplicates. The booth reads `words`
 * directly, so a word is recordable the moment this finishes.
 *
 * Everything else is derived, so the list only carries what a person can type
 * without making mistakes:
 *
 *   - `id`      via `assignIds` against every row already in the table
 *   - `tone`    the first TONED syllable — what a single gate is built from
 *   - `tones`   every syllable's tone, in order, 0 for neutral
 *   - `syllables` how many there are
 *
 * **Ids never move.** `assignIds` is given the existing rows of EVERY status,
 * retired included, so an id that has ever been handed out stays reserved. An
 * id is the R2 object key for both the raw take and the cut clip; reusing one
 * relabels audio that is already recorded. See `wordIds.ts`.
 *
 * **Refuses the whole file** on any parse error, any Simplified character
 * (hard rule 9 — see `simplified.ts`), the same word twice in one file, or a
 * MULTI-syllable word with no tone mark on any syllable (nothing for a
 * corridor to be shaped from). A word list is entered once and recorded
 * against for weeks: a bad row caught here costs a retype, and caught later
 * costs a recording session.
 *
 * **A fully-neutral SINGLE syllable** (的, 了, ...) is accepted, not refused —
 * stored with `tone: 0`, the same sentinel `tones[]` already uses for a
 * neutral syllable inside a multi-syllable word. `wordsFromCatalog` already
 * excludes `tone: 0` from every gameplay pool, so these are recordable and
 * catalogued but never shown in the game (see docs/DECISIONS.md).
 *
 * **What an existing row keeps.** Only `hanzi`, `pinyin`, `english`, `tone`,
 * `tones`, `syllables` and its list memberships are refreshed. `status`,
 * `position`, `min_tier`, and every measurement field (`clip_key`,
 * `duration_s`, `onset_s`, `clip_s`, `polyline`, `contour`, `raw_key`,
 * `recorded_session`, `meta`) are left exactly as they are — a re-import must
 * never un-publish a word or discard a measurement. New words land as
 * `status='pending'`, `min_tier='free'` (open by default — see
 * docs/DECISIONS.md's "Two tier gates, two meanings" entry), at the end of
 * `position` order, in file order.
 */

import { existsSync, readFileSync } from "node:fs";

import { AmbiguousPinyinError, parseWord } from "../record/pinyin.ts";
import { assignIds } from "../record/wordIds.ts";
import { hasSimplified, simplifiedIn } from "./simplified.ts";
import { serviceClient } from "./serviceClient.ts";
import type { Database } from "../data/database.types.ts";

type WordInsert = Database["public"]["Tables"]["words"]["Insert"];
type ListInsert = Database["public"]["Tables"]["lists"]["Insert"];
type WordListInsert = Database["public"]["Tables"]["word_lists"]["Insert"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const input = args.find((a) => !a.startsWith("--"));

if (!input) {
  console.error(`Usage: npm run import-words path/to/list.csv [-- --dry-run]

The file needs a header row naming its columns:

  hanzi,pinyin,english,lists
  媽,mā,mother,core-120

Multi-syllable words need a space or numeric pinyin ("nǐ hǎo" or "ni3hao3").`);
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`No word list at ${input}.`);
  process.exit(1);
}

// ---------------------------------------------------------------- parsing

/**
 * One line of CSV/TSV, honouring double-quoted fields.
 *
 * Minimal on purpose — an English gloss with a comma in it ("only, just") is
 * the one thing a split on `,` gets wrong, and that is common enough in a
 * hand-edited list to be worth fifteen lines. `""` inside a quoted field is a
 * literal quote, as in every spreadsheet's export.
 */
function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (c === delimiter) {
      cells.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

const rawLines = readFileSync(input, "utf8").split(/\r?\n/);
const lines: Array<{ line: number; text: string }> = [];
rawLines.forEach((raw, i) => {
  const text = raw.trim();
  if (!text || text.startsWith("#")) return;
  lines.push({ line: i + 1, text });
});

if (lines.length === 0) {
  console.error(`${input} is empty.`);
  process.exit(1);
}

// Tab beats comma when both are present: a TSV whose gloss contains a comma is
// still a TSV, and guessing per line would split one file two ways.
const delimiter = lines[0].text.includes("\t") ? "\t" : ",";
const header = splitRow(lines[0].text, delimiter).map((h) => h.toLowerCase());
const col = {
  hanzi: header.indexOf("hanzi"),
  pinyin: header.indexOf("pinyin"),
  english: header.indexOf("english"),
  lists: header.indexOf("lists"),
};
if (col.hanzi === -1 || col.pinyin === -1) {
  console.error(
    `${input} line ${lines[0].line}: the header row must name at least "hanzi" and "pinyin" ` +
      `(found: ${header.join(", ") || "nothing"}).\n\n` +
      `A header is required so columns can move without silently swapping meanings.`,
  );
  process.exit(1);
}

interface Parsed {
  line: number;
  hanzi: string;
  pinyin: string;
  english: string;
  lists: string[];
  tone: number;
  tones: number[];
  syllables: number;
}

const errors: string[] = [];
const parsed: Parsed[] = [];
let numNeutral = 0;
/** `hanzi\tpinyin` — the same identity `assignIds` uses. */
const seen = new Map<string, number>();

for (const { line, text } of lines.slice(1)) {
  const cells = splitRow(text, delimiter);
  const hanzi = cells[col.hanzi] ?? "";
  const pinyin = cells[col.pinyin] ?? "";
  const english = (col.english === -1 ? "" : cells[col.english]) ?? "";
  const listCell = (col.lists === -1 ? "" : cells[col.lists]) ?? "";

  if (!hanzi || !pinyin) {
    errors.push(`line ${line}: needs both a hanzi and a pinyin, got "${text}"`);
    continue;
  }
  if (hasSimplified(hanzi)) {
    errors.push(
      `line ${line}: "${hanzi}" contains Simplified character(s) ${simplifiedIn(hanzi).join(" ")} — ` +
        `everything here is Traditional (CLAUDE.md hard rule 9). Note the screen is a curated ` +
        `set, not a complete one: check the rest of the file against a Traditional reference too.`,
    );
    continue;
  }

  const key = `${hanzi.trim()}\t${pinyin.normalize("NFC").trim().toLowerCase()}`;
  const first = seen.get(key);
  if (first !== undefined) {
    errors.push(`line ${line}: "${hanzi} ${pinyin}" is already on line ${first}`);
    continue;
  }
  seen.set(key, line);

  try {
    const syllables = parseWord(pinyin);
    const toned = syllables.filter((s) => s.tone !== 0);
    if (toned.length === 0 && syllables.length > 1) {
      // Every syllable neutral on a MULTI-syllable word: no tone anywhere to
      // key a corridor or a label off, single or multi. A single neutral
      // syllable is handled below instead (tone: 0) — see docs/DECISIONS.md.
      errors.push(
        `line ${line}: "${pinyin}" has no tone mark on any syllable — nothing for a corridor to be shaped from`,
      );
      continue;
    }
    // A genuinely neutral single syllable (的, 了, ...): stored with tone 0,
    // the same sentinel `tones[]` already uses for a neutral syllable inside
    // a multi-syllable word. `wordsFromCatalog` already excludes tone 0 from
    // every gameplay pool, so this is "recordable, never shown" for free.
    const tone = toned.length > 0 ? toned[0].tone : 0;
    numNeutral += toned.length === 0 ? 1 : 0;
    parsed.push({
      line,
      hanzi,
      pinyin,
      english,
      lists: listCell
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
      tone,
      tones: syllables.map((s) => s.tone),
      syllables: syllables.length,
    });
  } catch (err) {
    errors.push(`line ${line}: ${err instanceof AmbiguousPinyinError ? err.message : String(err)}`);
  }
}

if (errors.length) {
  console.error(`${errors.length} problem(s) — nothing written:\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
if (parsed.length === 0) {
  console.error(`${input} has a header but no words.`);
  process.exit(1);
}

// ---------------------------------------------------------------- the table

const supabase = serviceClient();

// Every status, retired included: an id the registry ever handed out stays
// reserved, because its R2 objects may still exist. See wordIds.ts.
const { data: existingRows, error: existingError } = await supabase
  .from("words")
  .select("id,hanzi,pinyin,position,english,tone,tones,syllables")
  .order("position", { ascending: true });
if (existingError) throw new Error(`words select failed: ${existingError.message}`);

const existing = existingRows ?? [];
const existingById = new Map(existing.map((r) => [r.id, r]));
const assigned = assignIds(
  existing.map((r) => ({ id: r.id, hanzi: r.hanzi, pinyin: r.pinyin })),
  parsed,
);

// `assignIds` preserves input order, and it never drops a row we did not
// already deduplicate ourselves, so the two lists line up one to one.
if (assigned.words.length !== parsed.length) {
  throw new Error(
    `assignIds returned ${assigned.words.length} words for ${parsed.length} rows — ` +
      `the file has a duplicate the importer did not catch.`,
  );
}

let nextPosition = existing.reduce((max, r) => Math.max(max, r.position), -1) + 1;

/**
 * An INSERT for a genuinely new word and a narrow UPDATE for one that exists,
 * deliberately NOT one mixed upsert.
 *
 * PostgREST's upsert unions the keys of every object in the batch and fills
 * the ones an object is missing with the column default. So an existing row
 * sent without `status` in the same call as a new row that carries
 * `status: 'pending'` comes back 'pending' — a re-import would silently
 * un-publish the whole catalog and null out its measurements. Two statements,
 * each saying only what it means.
 */
type TypedFields = Pick<Parsed, "hanzi" | "pinyin" | "english" | "tone" | "tones" | "syllables">;

const inserts: WordInsert[] = [];
const updates: Array<{ id: string; fields: TypedFields }> = [];
let unchanged = 0;

for (let i = 0; i < parsed.length; i++) {
  const row = parsed[i];
  const id = assigned.words[i].id;
  const previous = existingById.get(id);
  const fields: TypedFields = {
    hanzi: row.hanzi,
    pinyin: row.pinyin,
    english: row.english,
    tone: row.tone,
    tones: row.tones,
    syllables: row.syllables,
  };

  if (previous) {
    const same =
      previous.hanzi === fields.hanzi &&
      previous.pinyin === fields.pinyin &&
      previous.english === fields.english &&
      previous.tone === fields.tone &&
      previous.syllables === fields.syllables &&
      previous.tones.length === fields.tones.length &&
      previous.tones.every((t, k) => t === fields.tones[k]);
    // A no-op UPDATE still fires `words_touch_updated_at`, and `updated_at` is
    // what the client's catalog cache invalidates on. Skipping it keeps a
    // re-import of an unchanged file from re-downloading the catalog for
    // every player.
    if (same) unchanged++;
    else updates.push({ id, fields });
  } else {
    inserts.push({
      ...fields,
      id,
      position: nextPosition++,
      status: "pending",
      // Open by default. `min_tier` is the GAME gate, not the visualiser's
      // practice depth — see docs/DECISIONS.md.
      min_tier: "free",
    });
  }
}

// A list id is the cell itself, and its name defaults to the same string. An
// existing list keeps the name it has — renaming one is a deliberate act, not
// a side effect of re-importing a CSV that happens to mention it.
const listIds = [...new Set(parsed.flatMap((p) => p.lists))].sort();
const { data: existingLists, error: listsSelectError } = await supabase.from("lists").select("id,name");
if (listsSelectError) throw new Error(`lists select failed: ${listsSelectError.message}`);
const namedAlready = new Set((existingLists ?? []).map((l) => l.id));
const listRows: ListInsert[] = listIds
  .filter((id) => !namedAlready.has(id))
  .map((id) => ({ id, name: id, source: "import" }));

const wordListRows: WordListInsert[] = [];
for (let i = 0; i < parsed.length; i++) {
  for (const listId of parsed[i].lists) {
    wordListRows.push({ word_id: assigned.words[i].id, list_id: listId });
  }
}

// ---------------------------------------------------------------- report

const byTone = [1, 2, 3, 4].map((t) => `T${t} ${parsed.filter((p) => p.tone === t).length}`);
const multi = parsed.filter((p) => p.syllables > 1);

console.log(`${parsed.length} word(s) read from ${input}`);
console.log(
  `  by first tone: ${byTone.join("  ")}` + (numNeutral ? `  neutral(0) ${numNeutral}` : ""),
);
console.log(
  `  ${unchanged + updates.length} already in the catalog ` +
    `(${updates.length} refreshed, ${unchanged} identical; ids, status and measurements untouched)`,
);
if (assigned.added.length) {
  console.log(
    `  ${assigned.added.length} new, status 'pending': ` +
      assigned.added
        .slice(0, 10)
        .map((p) => `${p.hanzi} ${p.id}`)
        .join(", ") +
      (assigned.added.length > 10 ? ", …" : ""),
  );
}
if (listIds.length) {
  console.log(`  lists: ${listIds.join(", ")}${listRows.length ? ` (${listRows.length} new)` : ""}`);
}
if (assigned.dropped.length) {
  // Loud, because these may already have audio in R2. Nothing is deleted here:
  // retiring a word is a deliberate status change, not the absence of a line.
  console.log(
    `\n  ⚠ ${assigned.dropped.length} catalog word(s) are not in this file:\n    ` +
      assigned.dropped.map((p) => `${p.hanzi} (${p.id})`).join(", ") +
      `\n    Left untouched — their ids stay reserved and their clips stay published.` +
      `\n    Set status='retired' yourself if you mean to drop them.`,
  );
}
if (multi.length) {
  console.log(
    `\n  ${multi.length} multi-syllable (recorded, but a gate is built from the first tone): ` +
      multi
        .slice(0, 8)
        .map((p) => p.pinyin)
        .join(", ") +
      (multi.length > 8 ? ", …" : ""),
  );
}

if (dryRun) {
  console.log(
    `\n--dry-run: nothing written. Would insert ${inserts.length} word(s), ` +
      `update ${updates.length}, add ${listRows.length} list(s) and ` +
      `${wordListRows.length} membership(s).`,
  );
  if (inserts.length) console.log("Sample new row:", JSON.stringify(inserts[0], null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- write

// Lists first: `word_lists` has a foreign key onto both sides, so a list id
// that does not exist yet would fail the membership upsert.
if (listRows.length) {
  const { error } = await supabase.from("lists").upsert(listRows, { onConflict: "id" });
  if (error) throw new Error(`lists upsert failed: ${error.message}`);
}

if (inserts.length) {
  const { error } = await supabase.from("words").insert(inserts);
  if (error) throw new Error(`words insert failed: ${error.message}`);
}

// One statement per word rather than a batch: a batched update in PostgREST is
// an upsert, which is the thing this deliberately is not. There are never many
// of these — a re-import only updates what a human actually retyped.
for (const { id, fields } of updates) {
  const { error } = await supabase.from("words").update(fields).eq("id", id);
  if (error) throw new Error(`words update failed for ${id}: ${error.message}`);
}

if (wordListRows.length) {
  const { error } = await supabase
    .from("word_lists")
    .upsert(wordListRows, { onConflict: "word_id,list_id" });
  if (error) throw new Error(`word_lists upsert failed: ${error.message}`);
}

console.log(
  `\nInserted ${inserts.length} word(s), updated ${updates.length}, ` +
    `added ${listRows.length} new list(s) and ${wordListRows.length} membership(s).`,
);
if (assigned.added.length) {
  console.log(`The booth will serve the ${assigned.added.length} pending word(s) next.`);
}
