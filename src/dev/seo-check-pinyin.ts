/**
 * `npm run seo:check-pinyin`: every hanzi/pinyin pair (and every "X in pinyin
 * and Z in 注音" claim) on the SEO pages, checked against the word catalog and
 * CC-CEDICT (docs/seo-review/data). Prints mismatches and a summary; exits 1
 * on any mismatch. Read-only. Used by the seo-content-reviewer agent.
 */

import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  checkPair, extractPairs, extractZhuyinClaims, parseCedict, readingKey, zhuyinMatches,
} from "./seoPinyin.ts";

const FILES = [
  ...readdirSync("src/site/pages").filter((f) => f.endsWith(".tsx")).map((f) => `src/site/pages/${f}`),
  "src/site/sayWords.ts",
  "src/site/routes.ts",
  "src/site/toneTest/toneTest.ts",
];

const dict = parseCedict(
  gunzipSync(readFileSync("docs/seo-review/data/cedict_1_0_ts_utf-8_mdbg.txt.gz")).toString("utf8"),
);

const catalog = new Map<string, Set<string>>();
const rows = (JSON.parse(readFileSync("src/data/wordsFallback.json", "utf8")) as {
  rows: { hanzi: string; pinyin: string }[];
}).rows;
for (const r of rows) {
  const set = catalog.get(r.hanzi) ?? new Set<string>();
  set.add(readingKey(r.pinyin));
  catalog.set(r.hanzi, set);
}

let pairs = 0, bad = 0, noted = 0, claims = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  for (const p of extractPairs(file, src)) {
    pairs++;
    const v = checkPair(p, dict, catalog);
    if (!v.ok) {
      bad++;
      console.log(`MISMATCH ${p.file}:${p.line}  ${p.hanzi} ${p.pinyin}  (${p.kind}) — ${v.reason}`);
    } else if (v.note) {
      noted++;
      if (process.argv.includes("--notes")) console.log(`note     ${p.file}:${p.line}  ${p.hanzi} ${p.pinyin} — ${v.note}`);
    }
  }
  for (const c of extractZhuyinClaims(file, src)) {
    claims++;
    if (!zhuyinMatches(c)) {
      bad++;
      console.log(`MISMATCH ${c.file}:${c.line}  注音 "${c.zhuyin}" does not match pinyin ${c.pinyin}`);
    }
  }
}

console.log(
  `\n${FILES.length} files, ${pairs} hanzi/pinyin pairs, ${claims} 注音 claims, ` +
  `${bad} mismatches, ${noted} accepted by a sandhi/neutral rule (--notes lists them). ` +
  `Catalog ${rows.length} rows, CC-CEDICT ${dict.size} headwords.`,
);
process.exit(bad ? 1 : 0);
