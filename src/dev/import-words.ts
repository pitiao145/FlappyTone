/**
 * Turns a plain word list into `src/record/wordlist.ts`.
 *
 *   npm run import-words                      # reads fixtures/wordlist.tsv
 *   npm run import-words path/to/list.tsv
 *
 * Input is two columns, tab- or comma-separated, one word per line:
 *
 *   妈	mā
 *   好	hǎo
 *   谢谢	xiè xie
 *
 * A third column, if present, is kept as a note and shown to nobody — it is
 * there so you can annotate the source list without the importer choking.
 * Lines starting with `#` and blank lines are ignored.
 *
 * Everything else is derived: `id` and `tone` come from the pinyin, so the list
 * only carries what a person can type without making mistakes. Hand-written ids
 * are where duplicates come from, and a duplicate id silently overwrites a
 * finished recording at the same blob key.
 *
 * Refuses to write anything if the list has a problem. A word list is entered
 * once and recorded against for weeks; a bad row caught here costs a retype,
 * and caught later costs a recording session.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { AmbiguousPinyinError, disambiguate, idFor, parseWord } from "../record/pinyin.ts";

const root = new URL("../../", import.meta.url).pathname;
const input = process.argv[2] ?? `${root}fixtures/wordlist.tsv`;

if (!existsSync(input)) {
  console.error(`No word list at ${input}.

Save one as fixtures/wordlist.tsv — two columns, hanzi then pinyin:

  妈\tmā
  好\thǎo
  谢谢\txiè xie

Multi-syllable words need a space or numeric pinyin ("nǐ hǎo" or "ni3hao3").`);
  process.exit(1);
}

interface Row {
  line: number;
  hanzi: string;
  pinyin: string;
}

const rows: Row[] = [];
const errors: string[] = [];

readFileSync(input, "utf8")
  .split(/\r?\n/)
  .forEach((raw, i) => {
    const line = i + 1;
    const text = raw.trim();
    if (!text || text.startsWith("#")) return;

    const cells = text.split(/\t|,/).map((c) => c.trim());
    const [hanzi, pinyin] = cells;
    if (!hanzi || !pinyin) {
      errors.push(`line ${line}: need two columns (hanzi, pinyin), got "${text}"`);
      return;
    }
    rows.push({ line, hanzi, pinyin });
  });

if (rows.length === 0 && errors.length === 0) {
  console.error(`${input} has no words in it.`);
  process.exit(1);
}

interface Parsed extends Row {
  id: string;
  tone: number;
  syllables: number;
}

const parsed: Parsed[] = [];
for (const row of rows) {
  try {
    const syllables = parseWord(row.pinyin);
    const toned = syllables.filter((s) => s.tone !== 0);
    if (toned.length === 0) {
      // Every syllable neutral: nothing for a corridor to be shaped from.
      errors.push(`line ${row.line}: "${row.pinyin}" has no tone mark — neutral tone only`);
      continue;
    }
    parsed.push({
      ...row,
      id: idFor(row.pinyin),
      // A multi-syllable word has several; the first is what a single gate
      // could ever be built from. Phase 3 decides whether it is used at all.
      tone: toned[0].tone,
      syllables: syllables.length,
    });
  } catch (err) {
    errors.push(
      `line ${row.line}: ${err instanceof AmbiguousPinyinError ? err.message : String(err)}`,
    );
  }
}

if (errors.length) {
  console.error(`${errors.length} problem(s) — nothing written:\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// Homophones are normal in a real list: 是 and 事 are both shì.
const ids = disambiguate(parsed.map((p) => p.id));
parsed.forEach((p, i) => (p.id = ids[i]));

const quote = (s: string) => JSON.stringify(s);
const body = parsed
  .map(
    (p) =>
      `  { id: ${quote(p.id)}, hanzi: ${quote(p.hanzi)}, pinyin: ${quote(p.pinyin)}, tone: ${p.tone} },`,
  )
  .join("\n");

const out = `${root}src/record/wordlist.ts`;
const source = readFileSync(out, "utf8");
// Replace only the array, keeping the file's documentation and types intact.
const replaced = source.replace(
  /export const WORDS: WordItem\[\] = \[[\s\S]*?\n\];/,
  `export const WORDS: WordItem[] = [\n${body}\n];`,
);
if (replaced === source) {
  console.error(`Could not find the WORDS array in ${out} — has it been restructured?`);
  process.exit(1);
}
writeFileSync(out, replaced);

const multi = parsed.filter((p) => p.syllables > 1);
const byTone = [1, 2, 3, 4].map((t) => `T${t} ${parsed.filter((p) => p.tone === t).length}`);

console.log(`${parsed.length} word(s) -> src/record/wordlist.ts`);
console.log(`  by first tone: ${byTone.join("  ")}`);
if (multi.length) {
  console.log(
    `  ${multi.length} multi-syllable (recorded, but not usable as gates until Phase 3): ` +
      multi
        .slice(0, 8)
        .map((p) => p.pinyin)
        .join(", ") +
      (multi.length > 8 ? ", …" : ""),
  );
}
const suffixed = parsed.filter((p) => /[a-z]$/.test(p.id));
if (suffixed.length) {
  console.log(
    `  ${suffixed.length} homophone(s) got a suffix: ` +
      suffixed.map((p) => `${p.hanzi} ${p.id}`).join(", "),
  );
}
console.log(`\nRun \`npm test\` to confirm, then the booth will serve them in this order.`);
