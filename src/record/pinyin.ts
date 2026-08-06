/**
 * Reads tone and a filename-safe stem out of pinyin.
 *
 * Exists so a word list only has to carry what a person can type without
 * mistakes — the hanzi and the pinyin — and everything the pipeline needs
 * (`id`, `tone`) is derived rather than hand-maintained. Hand-written ids are
 * where duplicates and typos come from, and a duplicate id silently overwrites
 * a finished recording at the same blob key.
 *
 * Pure: no filesystem, no Web Audio. Accepts both diacritics (`mā`) and the
 * numeric form (`ma1`), because people type both.
 */

/** Vowel → [base letter, tone] for every toned vowel in pinyin. */
const TONE_MARKS: Record<string, [string, number]> = {
  ā: ["a", 1], á: ["a", 2], ǎ: ["a", 3], à: ["a", 4],
  ē: ["e", 1], é: ["e", 2], ě: ["e", 3], è: ["e", 4],
  ī: ["i", 1], í: ["i", 2], ǐ: ["i", 3], ì: ["i", 4],
  ō: ["o", 1], ó: ["o", 2], ǒ: ["o", 3], ò: ["o", 4],
  ū: ["u", 1], ú: ["u", 2], ǔ: ["u", 3], ù: ["u", 4],
  ǖ: ["v", 1], ǘ: ["v", 2], ǚ: ["v", 3], ǜ: ["v", 4],
  // ü carries no tone of its own; it becomes `v` so the stem stays ASCII.
  ü: ["v", 0],
};

export interface ParsedSyllable {
  /** ASCII letters only, tone stripped — `mā` → `ma`, `lǜ` → `lv`. */
  stem: string;
  /** 1–4, or 0 for neutral tone / no mark. */
  tone: number;
}

/**
 * Splits one syllable into its ASCII stem and its tone.
 *
 * Neutral tone returns 0 rather than throwing: the list may legitimately
 * contain 吗 `ma`, and it is the caller's job to decide whether a toneless
 * syllable belongs in a game about tones.
 */
export function parseSyllable(pinyin: string): ParsedSyllable {
  const normalised = pinyin.normalize("NFC").trim().toLowerCase();
  let stem = "";
  let tone = 0;

  for (const ch of normalised) {
    const mark = TONE_MARKS[ch];
    if (mark) {
      stem += mark[0];
      if (mark[1] !== 0) tone = mark[1];
    } else if (ch >= "1" && ch <= "5") {
      // Numeric pinyin: `ma1`. 5 is the usual spelling of neutral tone.
      tone = ch === "5" ? 0 : Number(ch);
    } else if (ch >= "a" && ch <= "z") {
      stem += ch;
    }
    // Anything else — apostrophes, spaces, punctuation — is dropped.
  }

  return { stem, tone };
}

/** Thrown when a multi-syllable word is written in a form that cannot be split. */
export class AmbiguousPinyinError extends Error {
  constructor(pinyin: string) {
    super(
      `"${pinyin}" has more than one tone mark but no syllable break. ` +
        `Write it spaced ("nǐ hǎo") or numeric ("ni3hao3") — an unspaced ` +
        `diacritic form cannot be split without a syllable dictionary.`,
    );
    this.name = "AmbiguousPinyinError";
  }
}

/**
 * Splits a whole word into syllables.
 *
 * Spaced (`nǐ hǎo`) and numeric (`ni3hao3`) forms split reliably: the space or
 * the digit marks the boundary. An unspaced diacritic form does not — the tone
 * mark sits on the syllable's vowel, not at its end, so `hǎo` would come apart
 * as `hǎ` + `o`, and telling `xīān` from `xiān` needs a syllable dictionary.
 * Rather than mis-split silently, this throws and asks for a space.
 */
export function parseWord(pinyin: string): ParsedSyllable[] {
  const spaced = pinyin.normalize("NFC").trim().split(/[\s'·-]+/).filter(Boolean);
  if (spaced.length > 1) return spaced.flatMap(parseWord);

  const single = spaced[0] ?? "";

  // Numeric: each digit ends a syllable.
  if (/[1-5]/.test(single)) {
    const parts = single.match(/[^1-5]*[1-5]/g) ?? [single];
    const tail = single.replace(/.*[1-5]/, "");
    return [...parts, ...(tail ? [tail] : [])].map(parseSyllable);
  }

  const marks = [...single].filter((ch) => (TONE_MARKS[ch]?.[1] ?? 0) !== 0).length;
  if (marks > 1) throw new AmbiguousPinyinError(pinyin);
  return [parseSyllable(single)];
}

/**
 * The id for a word: its ASCII stems joined, with the tone numbers appended.
 * `mā` → `ma1`, `nǐ hǎo` → `nihao33`.
 *
 * Callers must still de-duplicate — 是 and 事 are both `shi4` — see
 * `disambiguate`.
 */
export function idFor(pinyin: string): string {
  const syllables = parseWord(pinyin);
  return syllables.map((s) => s.stem).join("") + syllables.map((s) => s.tone).join("");
}

/**
 * Makes ids unique in list order, appending `b`, `c`, … to later collisions.
 *
 * A letter, not a digit: `shi4` + `2` would read as a tone number. Reordering
 * the list can shift these, which is the cost of ids that stay readable.
 */
export function disambiguate(ids: string[]): string[] {
  const seen = new Map<string, number>();
  return ids.map((id) => {
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n === 0) return id;
    // b, c, … z, then za, zb, … — plenty for any realistic homophone count.
    let suffix = "";
    let k = n;
    while (k > 0) {
      suffix = String.fromCharCode(97 + ((k % 25) || 25)) + suffix;
      k = Math.floor((k - 1) / 25);
    }
    return id + suffix;
  });
}
