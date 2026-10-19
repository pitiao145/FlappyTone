/**
 * Pinyin text ↔ tone marks ↔ 注音 (Zhuyin / Bopomofo). Pure: no DOM, no
 * React, no audio, so the site pages (the tone-marks tool, later the zhuyin
 * chart and the zh-tw pages) and tests can share it.
 *
 * A syllable is held as `{ base, tone }`: `base` is plain ASCII pinyin with
 * ü written `v` (`lv`, `nve`), `tone` is 1–4, or 0 for neutral. Input may be
 * numbered (`ni3 hao3`, `lv4`, `ma5`/`ma0`) or marked (`nǐ hǎo`, `lǜ`), spaced
 * or not (`ni3hao3`, `nǐhǎo`): letter runs are split into real syllables by
 * the table below, longest match first with backtracking. A run that is not
 * pinyin (an English word) is left as plain text.
 *
 * Separate from `src/record/pinyin.ts` on purpose: that one derives word ids
 * for the recording pipeline and must not change shape for a web page.
 */

export type PinyinTone = 0 | 1 | 2 | 3 | 4;

export interface PinyinSyllable {
  /** ASCII pinyin, no tone, ü as `v`: `ni`, `lv`, `xue`. */
  base: string;
  tone: PinyinTone;
}

export type PinyinPiece = { syllable: PinyinSyllable } | { text: string };

// ------------------------------------------------------------------ tables

const INITIALS: Record<string, string> = {
  b: "ㄅ",
  p: "ㄆ",
  m: "ㄇ",
  f: "ㄈ",
  d: "ㄉ",
  t: "ㄊ",
  n: "ㄋ",
  l: "ㄌ",
  g: "ㄍ",
  k: "ㄎ",
  h: "ㄏ",
  j: "ㄐ",
  q: "ㄑ",
  x: "ㄒ",
  zh: "ㄓ",
  ch: "ㄔ",
  sh: "ㄕ",
  r: "ㄖ",
  z: "ㄗ",
  c: "ㄘ",
  s: "ㄙ",
};

/** Finals after an initial (ü written `v`). */
const FINALS: Record<string, string> = {
  a: "ㄚ",
  o: "ㄛ",
  e: "ㄜ",
  ai: "ㄞ",
  ei: "ㄟ",
  ao: "ㄠ",
  ou: "ㄡ",
  an: "ㄢ",
  en: "ㄣ",
  ang: "ㄤ",
  eng: "ㄥ",
  ong: "ㄨㄥ",
  i: "ㄧ",
  ia: "ㄧㄚ",
  ie: "ㄧㄝ",
  iao: "ㄧㄠ",
  iu: "ㄧㄡ",
  ian: "ㄧㄢ",
  in: "ㄧㄣ",
  iang: "ㄧㄤ",
  ing: "ㄧㄥ",
  iong: "ㄩㄥ",
  u: "ㄨ",
  ua: "ㄨㄚ",
  uo: "ㄨㄛ",
  uai: "ㄨㄞ",
  ui: "ㄨㄟ",
  uan: "ㄨㄢ",
  un: "ㄨㄣ",
  uang: "ㄨㄤ",
  v: "ㄩ",
  ve: "ㄩㄝ",
};

/** After j/q/x a written `u` is ü. */
const JQX_FINALS: Record<string, string> = {
  u: "ㄩ",
  ue: "ㄩㄝ",
  uan: "ㄩㄢ",
  un: "ㄩㄣ",
};

/** Syllables with no initial, in their y-/w- spellings. */
const ZERO_INITIAL: Record<string, string> = {
  a: "ㄚ",
  o: "ㄛ",
  e: "ㄜ",
  ai: "ㄞ",
  ei: "ㄟ",
  ao: "ㄠ",
  ou: "ㄡ",
  an: "ㄢ",
  en: "ㄣ",
  ang: "ㄤ",
  eng: "ㄥ",
  er: "ㄦ",
  yi: "ㄧ",
  ya: "ㄧㄚ",
  yo: "ㄧㄛ",
  ye: "ㄧㄝ",
  yao: "ㄧㄠ",
  you: "ㄧㄡ",
  yan: "ㄧㄢ",
  yin: "ㄧㄣ",
  yang: "ㄧㄤ",
  ying: "ㄧㄥ",
  yong: "ㄩㄥ",
  wu: "ㄨ",
  wa: "ㄨㄚ",
  wo: "ㄨㄛ",
  wai: "ㄨㄞ",
  wei: "ㄨㄟ",
  wan: "ㄨㄢ",
  wen: "ㄨㄣ",
  wang: "ㄨㄤ",
  weng: "ㄨㄥ",
  yu: "ㄩ",
  yue: "ㄩㄝ",
  yuan: "ㄩㄢ",
  yun: "ㄩㄣ",
};

const GKH = "a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang";
const JQX = "i ia ie iao iu ian in iang ing iong u ue uan un";
const ZCS = "a e ai ao ou an en ang eng ong i u uo ui uan un";

/** Every initial's legal finals: what makes a letter run real pinyin. */
const VALID_FINALS: Record<string, string> = {
  b: "a o ai ei ao an en ang eng i ie iao ian in ing u",
  p: "a o ai ei ao ou an en ang eng i ie iao ian in ing u",
  m: "a o e ai ei ao ou an en ang eng i ie iao iu ian in ing u",
  f: "a o ei ou an en ang eng u",
  d: "a e ai ei ao ou an en ang eng ong i ia ie iao iu ian ing u uo ui uan un",
  t: "a e ai ao ou an ang eng ong i ie iao ian ing u uo ui uan un",
  // `ue` is the common typed spelling of `üe` here (lue4); normalised to `ve`.
  n: "a e ai ei ao ou an en ang eng ong i ie iao iu ian in iang ing u uo uan v ve ue",
  l: "a e ai ei ao ou an ang eng ong i ia ie iao iu ian in iang ing u uo uan un v ve ue",
  g: GKH,
  k: GKH,
  h: GKH,
  j: JQX,
  q: JQX,
  x: JQX,
  zh: "a e ai ei ao ou an en ang eng ong i u ua uo uai ui uan un uang",
  ch: "a e ai ao ou an en ang eng ong i u ua uo uai ui uan un uang",
  sh: "a e ai ei ao ou an en ang eng i u ua uo uai ui uan un uang",
  r: "e ao ou an en ang eng ong i u ua uo ui uan un",
  z: "a e ai ei ao ou an en ang eng ong i u uo ui uan un",
  c: ZCS,
  s: ZCS,
};

const VALID = new Set<string>(Object.keys(ZERO_INITIAL));
for (const [ini, finals] of Object.entries(VALID_FINALS)) {
  for (const f of finals.split(" ")) VALID.add(ini + f);
}
const MAX_SYLLABLE = 6; // zhuang, chuang, shuang

export function isValidSyllable(base: string): boolean {
  return VALID.has(base);
}

const TONE_ZHUYIN = ["˙", "", "ˊ", "ˇ", "ˋ"] as const;

const MARKED: Record<string, readonly string[]> = {
  a: ["a", "ā", "á", "ǎ", "à"],
  e: ["e", "ē", "é", "ě", "è"],
  i: ["i", "ī", "í", "ǐ", "ì"],
  o: ["o", "ō", "ó", "ǒ", "ò"],
  u: ["u", "ū", "ú", "ǔ", "ù"],
  v: ["ü", "ǖ", "ǘ", "ǚ", "ǜ"],
};

/** Marked vowel → [ascii base letter, tone]. */
const UNMARK = new Map<string, [string, PinyinTone]>();
for (const [base, forms] of Object.entries(MARKED)) {
  forms.forEach((ch, tone) => UNMARK.set(ch, [base, tone as PinyinTone]));
}

// --------------------------------------------------------------- syllables

function splitInitial(base: string): [string, string] {
  const two = base.slice(0, 2);
  if (two === "zh" || two === "ch" || two === "sh") return [two, base.slice(2)];
  if (INITIALS[base[0]]) return [base[0], base.slice(1)];
  return ["", base];
}

/** 注音 for one syllable. The neutral mark ˙ goes before it, the others after. */
export function zhuyinSyllable({ base, tone }: PinyinSyllable): string {
  let body: string;
  if (ZERO_INITIAL[base] !== undefined) {
    body = ZERO_INITIAL[base];
  } else {
    const [ini, fin] = splitInitial(base);
    let rest: string | undefined;
    if ("zh ch sh r z c s".split(" ").includes(ini) && fin === "i") rest = "";
    else if ("jqx".includes(ini) && ini !== "")
      rest = JQX_FINALS[fin] ?? FINALS[fin];
    else rest = FINALS[fin];
    body = (INITIALS[ini] ?? "") + (rest ?? "");
  }
  return tone === 0 ? `˙${body}` : body + TONE_ZHUYIN[tone];
}

/**
 * Which letter of `base` carries the mark: `a` or `e` if present, `o` in
 * `ou`, otherwise the last vowel (so `iu` → u, `ui` → i).
 */
export function markIndex(base: string): number {
  const a = base.indexOf("a");
  if (a >= 0) return a;
  const e = base.indexOf("e");
  if (e >= 0) return e;
  const ou = base.indexOf("ou");
  if (ou >= 0) return ou;
  for (let i = base.length - 1; i >= 0; i--)
    if ("iouv".includes(base[i])) return i;
  return -1;
}

/** `{ni, 3}` → `nǐ`, `{lv, 4}` → `lǜ`, `{ma, 0}` → `ma`. */
export function markSyllable({ base, tone }: PinyinSyllable): string {
  const at = markIndex(base);
  let out = "";
  for (let i = 0; i < base.length; i++) {
    const ch = base[i];
    const forms = MARKED[ch];
    out += forms ? forms[i === at ? tone : 0] : ch;
  }
  return out;
}

/** `{ni, 3}` → `ni3`, `{lv, 4}` → `lü4`, neutral → `ma5`. */
export function numberSyllable({ base, tone }: PinyinSyllable): string {
  return base.replace(/v/g, "ü") + (tone === 0 ? 5 : tone);
}

// ------------------------------------------------------------------ parsing

/** Split a plain letter run into valid syllables, longest first, backtracking. */
function segment(plain: string, from = 0): number[] | null {
  if (from === plain.length) return [];
  for (let len = Math.min(MAX_SYLLABLE, plain.length - from); len > 0; len--) {
    if (!VALID.has(plain.slice(from, from + len))) continue;
    const rest = segment(plain, from + len);
    if (rest) return [len, ...rest];
  }
  return null;
}

const RUN = /([a-züà-üĀ-ǜ]+)([0-5])?/g;

/**
 * Splits text into syllables and the text between them (spaces, punctuation,
 * apostrophes, anything that is not pinyin). A tone digit applies to the
 * syllable just before it; a syllable with neither a digit nor a mark is
 * neutral. Lowercases its input.
 */
export function parsePinyin(input: string): PinyinPiece[] {
  // `u:` is the CC-CEDICT spelling of ü (nu:3 = nǚ); read it as ü.
  const text = input.normalize("NFC").toLowerCase().replace(/u:/g, "ü");
  const pieces: PinyinPiece[] = [];
  let last = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const prev = pieces[pieces.length - 1];
    if (prev && "text" in prev) prev.text += t;
    else pieces.push({ text: t });
  };
  for (const m of text.matchAll(RUN)) {
    const start = m.index ?? 0;
    pushText(text.slice(last, start));
    last = start + m[0].length;

    let plain = "";
    const marks: (PinyinTone | undefined)[] = [];
    for (const ch of m[1]) {
      const um = UNMARK.get(ch);
      plain += um ? um[0] : ch;
      marks.push(um && um[1] !== 0 ? um[1] : undefined);
    }
    const lens = /^[a-z]+$/.test(plain) ? segment(plain) : null;
    if (!lens) {
      pushText(m[0]);
      continue;
    }
    let at = 0;
    lens.forEach((len, k) => {
      const typed = plain.slice(at, at + len);
      const base = typed === "lue" || typed === "nue" ? `${typed[0]}ve` : typed;
      let tone: PinyinTone =
        marks.slice(at, at + len).find((t) => t !== undefined) ?? 0;
      if (k === lens.length - 1 && m[2] !== undefined && tone === 0) {
        tone = (m[2] === "5" ? 0 : Number(m[2])) as PinyinTone;
      }
      pieces.push({ syllable: { base, tone } });
      at += len;
    });
  }
  pushText(text.slice(last));
  return pieces;
}

export function syllablesOf(input: string): PinyinSyllable[] {
  return parsePinyin(input).flatMap((p) =>
    "syllable" in p ? [p.syllable] : [],
  );
}

function render(input: string, f: (s: PinyinSyllable) => string): string {
  return parsePinyin(input)
    .map((p) => ("syllable" in p ? f(p.syllable) : p.text))
    .join("");
}

/** `ni3 hao3` → `nǐ hǎo`. Text that is not pinyin passes through. */
export function toMarks(input: string): string {
  return render(input, markSyllable);
}

/** `nǐ hǎo` → `ni3 hao3`; unmarked syllables become neutral (`me5`). */
export function toNumbers(input: string): string {
  return render(input, numberSyllable);
}

/** `ni3 hao3` → `ㄋㄧˇ ㄏㄠˇ`: one block per syllable, space separated. */
export function toZhuyin(input: string): string {
  return syllablesOf(input).map(zhuyinSyllable).join(" ");
}

/** Marked input reads as "convert back to numbers"; anything else as numbered. */
export function inputDirection(input: string): "to-marks" | "to-numbers" {
  for (const ch of input.normalize("NFC").toLowerCase()) {
    const um = UNMARK.get(ch);
    if (um && um[1] !== 0) return "to-numbers";
  }
  return "to-marks";
}
