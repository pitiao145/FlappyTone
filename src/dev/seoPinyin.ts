/**
 * The SEO pinyin check (`npm run seo:check-pinyin`), as pure functions so the
 * extractor can be tested on a fixture string. No file or network access here.
 *
 * It finds hanzi/pinyin pairs in page source, then checks each syllable
 * against the word catalog and CC-CEDICT. It reports, it never fixes.
 */

import { syllablesOf, toZhuyin, type PinyinSyllable } from "../site/zhuyin.ts";

export interface Pair {
  file: string;
  line: number;
  hanzi: string;
  pinyin: string;
  kind: "field" | "tuple" | "prose";
}

export interface ZhuyinClaim {
  file: string;
  line: number;
  pinyin: string;
  zhuyin: string;
}

const HAN = "\\u3400-\\u4dbf\\u4e00-\\u9fff";
const PY = "a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü'";

const lineAt = (src: string, index: number) => src.slice(0, index).split("\n").length;
const hanCount = (s: string) => [...s].length;

/** True when `text` is only pinyin syllables (and spaces/apostrophes). */
function pinyinOnly(text: string): PinyinSyllable[] | null {
  const syl = syllablesOf(text);
  const rebuilt = text.replace(/[\s']/g, "");
  if (!syl.length) return null;
  // Every letter must belong to a syllable: compare letter counts.
  const letters = syl.reduce((n, s) => n + s.base.length, 0);
  const plain = rebuilt.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "v");
  return letters === plain.length ? syl : null;
}

export function extractPairs(file: string, src: string): Pair[] {
  const out: Pair[] = [];
  const seen = new Set<string>();
  const push = (p: Pair) => {
    const k = `${p.line}|${p.hanzi}|${p.pinyin}`;
    if (seen.has(k)) return;
    const syl = pinyinOnly(p.pinyin);
    if (!syl) return;
    // Prose matches are noisy: keep them only when the counts line up.
    if (p.kind === "prose" && syl.length !== hanCount(p.hanzi)) return;
    // …and only with a tone mark, so English like "注音 Zhuyin" is skipped.
    if (p.kind === "prose" && !/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(p.pinyin)) return;
    seen.add(k);
    out.push(p);
  };

  // 1. Object fields: hanzi: "…", … pinyin: "…" (no other hanzi: between).
  for (const m of src.matchAll(/hanzi:\s*"([^"]+)"((?:(?!hanzi:)[\s\S]){0,300}?)pinyin:\s*"([^"]+)"/g)) {
    push({ file, line: lineAt(src, m.index), hanzi: m[1], pinyin: m[3], kind: "field" });
  }
  // 2. Tuples: "謝謝", "xiè xie" (two string literals in a row).
  for (const m of src.matchAll(new RegExp(`"([${HAN}]+)",\\s*"([${PY} ]+)"`, "g"))) {
    push({ file, line: lineAt(src, m.index), hanzi: m[1], pinyin: m[2], kind: "tuple" });
  }
  // 3. Prose: 謝謝 (xièxie, …) or 謝謝 xièxie.
  for (const m of src.matchAll(new RegExp(`([${HAN}]+)\\s?[（(]?([${PY}]+(?: [${PY}]+)*)`, "g"))) {
    push({ file, line: lineAt(src, m.index), hanzi: m[1], pinyin: m[2], kind: "prose" });
  }
  return out;
}

/** "… written xièxie in pinyin and ㄒㄧㄝˋ ˙ㄒㄧㄝ in 注音 …" */
export function extractZhuyinClaims(file: string, src: string): ZhuyinClaim[] {
  const re = new RegExp(`(?:written )?([${PY}]+(?: [${PY}]+)*) in pinyin and ([ㄅ-ㄩˊˇˋ˙ ]+?) in 注音`, "g");
  return [...src.matchAll(re)].map((m) => ({
    file,
    line: lineAt(src, m.index),
    pinyin: m[1],
    zhuyin: m[2].trim(),
  }));
}

export const zhuyinMatches = (c: ZhuyinClaim) => toZhuyin(c.pinyin) === c.zhuyin;

// ------------------------------------------------------------- dictionary

/** Readings as "base+tone" strings, e.g. "xie4", ü as v, neutral as 0. */
export type Dict = Map<string, Set<string>>;

const key = (s: PinyinSyllable) => `${s.base}${s.tone}`;

/** Parse CC-CEDICT text into Traditional headword → readings ("xie4 xie0"), "also pr." variants included. */
export function parseCedict(text: string): Dict {
  const dict: Dict = new Map();
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) continue;
    const m = /^(\S+) \S+ \[([^\]]+)\]/.exec(line);
    if (!m) continue;
    const set = dict.get(m[1]) ?? new Set<string>();
    set.add(syllablesOf(m[2]).map(key).join(" "));
    // Variant readings live in the definition: "/also pr. [bai1 bai1]/".
    for (const v of line.matchAll(/also pr\. \[([^\]]+)\]/g)) {
      set.add(syllablesOf(v[1]).map(key).join(" "));
    }
    dict.set(m[1], set);
  }
  return dict;
}

export type Verdict =
  | { ok: true; note?: string }
  | { ok: false; reason: string };

/**
 * Accepts: the catalog's own reading, a CC-CEDICT word reading, or per
 * syllable a CC-CEDICT reading of that character, a neutral tone on a known
 * base, 不/一 tone change, and 3+3 → 2+3. Anything accepted only by a
 * sandhi or neutral rule carries a note, so the reviewer can look.
 */
export function checkPair(p: Pair, dict: Dict, catalog: Map<string, Set<string>>): Verdict {
  const syl = syllablesOf(p.pinyin);
  const chars = [...p.hanzi];
  const reading = syl.map(key).join(" ");
  const cat = catalog.get(p.hanzi);
  if (cat && cat.size) {
    if (cat.has(reading)) return { ok: true };
    if (syl.length === 1) return { ok: false, reason: `catalog says ${[...cat].join("/")}` };
  }
  if (dict.get(p.hanzi)?.has(reading)) return { ok: true };
  if (syl.length !== chars.length) {
    return { ok: false, reason: `${chars.length} hanzi but ${syl.length} syllables` };
  }
  const notes: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const s = syl[i];
    const readings = dict.get(chars[i]);
    if (!readings) return { ok: false, reason: `${chars[i]} not in CC-CEDICT` };
    if (readings.has(key(s))) continue;
    const bases = new Set([...readings].map((r) => r.replace(/\d$/, "")));
    const next = syl[i + 1];
    if (s.tone === 0 && bases.has(s.base)) { notes.push(`${chars[i]} neutral`); continue; }
    if (chars[i] === "不" && s.base === "bu" && s.tone === 2) { notes.push("不 sandhi"); continue; }
    if (chars[i] === "一" && s.base === "yi" && (s.tone === 2 || s.tone === 4)) { notes.push("一 sandhi"); continue; }
    if (s.tone === 2 && next?.tone === 3 && readings.has(`${s.base}3`)) { notes.push(`${chars[i]} 3+3 sandhi`); continue; }
    return { ok: false, reason: `${chars[i]} read ${key(s)}; CC-CEDICT has ${[...readings].join("/")}` };
  }
  return { ok: true, note: notes.join(", ") || undefined };
}

export const readingKey = (pinyin: string) => syllablesOf(pinyin).map(key).join(" ");
