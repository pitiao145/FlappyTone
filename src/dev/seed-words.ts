/**
 * One-time seed: writes the 120 shipped words into the `words`/`lists`/
 * `word_lists` tables, from the three flat sources that were the only
 * inventory before this migration:
 *
 *   - `src/record/wordlist.ts`  — id/hanzi/pinyin/tone, in `position` order
 *   - `src/record/glossary.ts`  — english gloss, keyed by id
 *   - `public/ref/manifest.json` — durations/onset/polyline/contour per clip,
 *     plus the recording session(s) each clip's pitch reference was measured
 *     against
 *
 *   npm run seed-words -- --dry-run   # prints the rows, writes nothing
 *   npm run seed-words                # upserts words + lists + word_lists
 *
 * Idempotent: both upserts use `onConflict: "id"` (and the composite PK for
 * `word_lists`), so re-running after a manifest update just refreshes rows.
 *
 * `min_tier` follows the tiers spec: for each tone, in `position` order, the
 * first `TIER_LIMITS.free.wordsPerTone` words are `free`, the rest `pro` —
 * read from `src/game/tiers.ts` rather than hardcoded, so a tuning change
 * there doesn't silently desync this script.
 */

import { readFileSync } from "node:fs";

import { GLOSSARY } from "../record/glossary.ts";
import { WORDS } from "../record/wordlist.ts";
import { TIER_LIMITS } from "../game/tiers.ts";
import { serviceClient } from "./serviceClient.ts";
import type { Database } from "../data/database.types.ts";

const root = new URL("../../", import.meta.url).pathname;

interface ManifestSession {
  session: string;
  f0Center: number;
  rangeSemitones: number;
}

interface ManifestClip {
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  tone: 1 | 2 | 3 | 4;
  file: string;
  durationS: number;
  onsetS: number;
  clipS: number;
  polyline: [number, number][];
  contour: [number, number][];
}

interface Manifest {
  version: number;
  speaker: string;
  sessions: ManifestSession[];
  clips: ManifestClip[];
}

type WordRow = Database["public"]["Tables"]["words"]["Insert"];
type ListRow = Database["public"]["Tables"]["lists"]["Insert"];
type WordListRow = Database["public"]["Tables"]["word_lists"]["Insert"];

const dryRun = process.argv.includes("--dry-run");

const manifest: Manifest = JSON.parse(readFileSync(`${root}public/ref/manifest.json`, "utf8"));

// Ruling 2: manifest clips carry no `session` field of their own, and there is
// exactly one session in this manifest today. Fail loudly rather than guess
// which session a clip belongs to if that ever stops being true.
if (manifest.sessions.length !== 1) {
  throw new Error(
    `Expected exactly one manifest session, found ${manifest.sessions.length}. ` +
      `seed-words assumes every clip's pitch reference is manifest.sessions[0] — ` +
      `update this script before seeding a multi-session manifest.`,
  );
}
const sessionRef = manifest.sessions[0];

const clipsById = new Map(manifest.clips.map((clip) => [clip.id, clip]));

const freeWordsPerTone = TIER_LIMITS.free.wordsPerTone;

// Track how many words of each tone have already been assigned `free`, in
// `position` order, so the first N per tone are free and the rest are pro.
const freeCountByTone: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

const wordRows: WordRow[] = WORDS.map((word, position) => {
  const clip = clipsById.get(word.id);

  let minTier: "free" | "pro";
  if (freeCountByTone[word.tone] < freeWordsPerTone) {
    minTier = "free";
    freeCountByTone[word.tone] += 1;
  } else {
    minTier = "pro";
  }

  const row: WordRow = {
    id: word.id,
    hanzi: word.hanzi,
    pinyin: word.pinyin,
    english: GLOSSARY[word.id] ?? "",
    tone: word.tone,
    tones: [],
    syllables: 1,
    position,
    status: clip ? "published" : "pending",
    min_tier: minTier,
    clip_key: clip ? `${word.id}.wav` : null,
    duration_s: clip ? clip.durationS : null,
    onset_s: clip ? clip.onsetS : null,
    clip_s: clip ? clip.clipS : null,
    polyline: clip ? clip.polyline : null,
    contour: clip ? clip.contour : null,
    meta: { reference: { ...sessionRef } },
  };
  return row;
});

const listRow: ListRow = { id: "core-120", name: "Core 120", source: "custom" };

const wordListRows: WordListRow[] = wordRows.map((row) => ({
  word_id: row.id,
  list_id: listRow.id,
}));

function summarize(rows: WordRow[]) {
  const byStatus = new Map<string, number>();
  const byToneTier = new Map<string, number>();
  for (const row of rows) {
    byStatus.set(row.status!, (byStatus.get(row.status!) ?? 0) + 1);
    const key = `tone ${row.tone} / ${row.min_tier}`;
    byToneTier.set(key, (byToneTier.get(key) ?? 0) + 1);
  }
  console.log("By status:", Object.fromEntries(byStatus));
  console.log("By tone/tier:", Object.fromEntries([...byToneTier].sort()));
}

if (dryRun) {
  console.log(`--dry-run: ${wordRows.length} words, list "${listRow.id}", ${wordListRows.length} word_lists rows.`);
  console.log("Sample row:", JSON.stringify(wordRows[0], null, 2));
  summarize(wordRows);
  process.exit(0);
}

const supabase = serviceClient();

const { error: wordsError } = await supabase.from("words").upsert(wordRows, { onConflict: "id" });
if (wordsError) throw new Error(`words upsert failed: ${wordsError.message}`);

const { error: listError } = await supabase.from("lists").upsert(listRow, { onConflict: "id" });
if (listError) throw new Error(`lists upsert failed: ${listError.message}`);

const { error: wordListsError } = await supabase
  .from("word_lists")
  .upsert(wordListRows, { onConflict: "word_id,list_id" });
if (wordListsError) throw new Error(`word_lists upsert failed: ${wordListsError.message}`);

console.log(`Seeded ${wordRows.length} words, 1 list, ${wordListRows.length} word_lists rows.`);
summarize(wordRows);
