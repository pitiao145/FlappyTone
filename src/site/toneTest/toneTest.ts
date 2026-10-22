/**
 * The /tools/tone-test listening game, minus React: its word list, the round
 * builder, scoring, the swipe → corner hit test and the analytics reporter.
 * Pure (no DOM, no audio), so all of it is unit-tested.
 *
 * Every word is single-syllable, published in both styles for the default
 * speaker, and guest-playable (toneTest.test.ts checks the catalog and the
 * Worker's guest rule). Copied, not read from wordsFallback.json, so the page
 * does not ship the catalog.
 */

import type { AnalyticsEvent } from "../../analytics/session.ts";

export type Tone = 1 | 2 | 3 | 4;
export const TONES: readonly Tone[] = [1, 2, 3, 4];

export interface TestWord {
  id: string;
  hanzi: string;
  /** Written pinyin with its tone mark. */
  pinyin: string;
  tone: Tone;
  english: string;
}

export const TEST_WORDS: readonly TestWord[] = [
  { id: "ma1b", hanzi: "媽", pinyin: "mā", tone: 1, english: "mother" },
  { id: "ba1", hanzi: "八", pinyin: "bā", tone: 1, english: "eight" },
  { id: "san1", hanzi: "三", pinyin: "sān", tone: 1, english: "three" },
  { id: "tian1", hanzi: "天", pinyin: "tiān", tone: 1, english: "sky, day" },
  { id: "hua1", hanzi: "花", pinyin: "huā", tone: 1, english: "flower" },
  { id: "shu1", hanzi: "書", pinyin: "shū", tone: 1, english: "book" },
  { id: "kai1", hanzi: "開", pinyin: "kāi", tone: 1, english: "to open" },
  { id: "mao1", hanzi: "貓", pinyin: "māo", tone: 1, english: "cat" },
  { id: "gao1", hanzi: "高", pinyin: "gāo", tone: 1, english: "tall" },
  { id: "fei1", hanzi: "飛", pinyin: "fēi", tone: 1, english: "to fly" },
  { id: "ma2", hanzi: "麻", pinyin: "má", tone: 2, english: "hemp" },
  { id: "shi2", hanzi: "十", pinyin: "shí", tone: 2, english: "ten" },
  { id: "ren2", hanzi: "人", pinyin: "rén", tone: 2, english: "person" },
  { id: "lai2", hanzi: "來", pinyin: "lái", tone: 2, english: "to come" },
  { id: "qian2", hanzi: "錢", pinyin: "qián", tone: 2, english: "money" },
  { id: "xue2", hanzi: "學", pinyin: "xué", tone: 2, english: "to study" },
  { id: "hong2", hanzi: "紅", pinyin: "hóng", tone: 2, english: "red" },
  { id: "bai2", hanzi: "白", pinyin: "bái", tone: 2, english: "white" },
  { id: "niu2", hanzi: "牛", pinyin: "niú", tone: 2, english: "cow" },
  { id: "nian2", hanzi: "年", pinyin: "nián", tone: 2, english: "year" },
  { id: "ma3b", hanzi: "馬", pinyin: "mǎ", tone: 3, english: "horse" },
  { id: "wu3", hanzi: "五", pinyin: "wǔ", tone: 3, english: "five" },
  { id: "jiu3", hanzi: "九", pinyin: "jiǔ", tone: 3, english: "nine" },
  { id: "wo3", hanzi: "我", pinyin: "wǒ", tone: 3, english: "I, me" },
  { id: "ni3", hanzi: "你", pinyin: "nǐ", tone: 3, english: "you" },
  { id: "hao3", hanzi: "好", pinyin: "hǎo", tone: 3, english: "good" },
  { id: "shou3", hanzi: "手", pinyin: "shǒu", tone: 3, english: "hand" },
  { id: "kou3", hanzi: "口", pinyin: "kǒu", tone: 3, english: "mouth" },
  { id: "zao3", hanzi: "早", pinyin: "zǎo", tone: 3, english: "early" },
  { id: "lao3", hanzi: "老", pinyin: "lǎo", tone: 3, english: "old" },
  { id: "ma4b", hanzi: "罵", pinyin: "mà", tone: 4, english: "to scold" },
  { id: "si4", hanzi: "四", pinyin: "sì", tone: 4, english: "four" },
  { id: "liu4", hanzi: "六", pinyin: "liù", tone: 4, english: "six" },
  { id: "er4", hanzi: "二", pinyin: "èr", tone: 4, english: "two" },
  { id: "da4", hanzi: "大", pinyin: "dà", tone: 4, english: "big" },
  { id: "shi4", hanzi: "是", pinyin: "shì", tone: 4, english: "to be" },
  { id: "dui4", hanzi: "對", pinyin: "duì", tone: 4, english: "correct" },
  { id: "kuai4", hanzi: "快", pinyin: "kuài", tone: 4, english: "fast" },
  { id: "hua4", hanzi: "話", pinyin: "huà", tone: 4, english: "speech" },
  { id: "dian4", hanzi: "電", pinyin: "diàn", tone: 4, english: "electricity" },
];

export const ROUND_SIZE = 10;

/** "Standard" = the textbook recordings, "spoken" = the natural ones. */
export type TestStyle = "standard" | "spoken";

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A round of `ROUND_SIZE` words: every tone at least twice (two tones get a
 * third card), no word twice, shuffled. Also returns the unused words, the
 * spares a failed clip is replaced from (same tone first).
 */
export function buildRound(
  rand: () => number = Math.random,
  words: readonly TestWord[] = TEST_WORDS,
  /** Ids from the last round: drawn only if a tone runs out of fresh words. */
  avoid: ReadonlySet<string> = new Set(),
): { cards: TestWord[]; spares: TestWord[] } {
  const per = Math.floor(ROUND_SIZE / TONES.length);
  const extra = shuffle([...TONES], rand).slice(0, ROUND_SIZE - per * TONES.length);
  const cards: TestWord[] = [];
  const spares: TestWord[] = [];
  for (const t of TONES) {
    const ofTone = words.filter((w) => w.tone === t);
    const pool = [
      ...shuffle(ofTone.filter((w) => !avoid.has(w.id)), rand),
      ...shuffle(ofTone.filter((w) => avoid.has(w.id)), rand),
    ];
    const n = per + (extra.includes(t) ? 1 : 0);
    cards.push(...pool.slice(0, n));
    spares.push(...pool.slice(n));
  }
  return { cards: shuffle(cards, rand), spares };
}

const LAST_KEY = "flappytone.tonetest.last.v1";

/** The last round's word ids on this device (empty if storage is blocked). */
export function loadLastRound(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveLastRound(ids: readonly string[]): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(ids));
  } catch {
    // A convenience only.
  }
}

/** A replacement for a card whose clip failed: same tone if possible. Removes it from `spares`. */
export function takeSpare(spares: TestWord[], tone: Tone): TestWord | null {
  let i = spares.findIndex((w) => w.tone === tone);
  if (i < 0) i = spares.length ? 0 : -1;
  if (i < 0) return null;
  return spares.splice(i, 1)[0];
}

export interface Answer {
  tone: Tone;
  picked: Tone;
}

export interface RoundResult {
  correct: number;
  total: number;
  /** Per tone: cards heard and matched. */
  perTone: Record<Tone, { cards: number; correct: number }>;
  /** The two tones most often confused with each other (≥ 2 misses between them), or null. */
  mixUp: [Tone, Tone] | null;
  /** The tone to practise next: lowest share right, then most misses; null on a perfect round. */
  weakest: Tone | null;
}

export function scoreRound(answers: readonly Answer[]): RoundResult {
  const perTone = { 1: z(), 2: z(), 3: z(), 4: z() } as RoundResult["perTone"];
  const pair = new Map<string, number>();
  let correct = 0;
  for (const a of answers) {
    perTone[a.tone].cards += 1;
    if (a.picked === a.tone) {
      perTone[a.tone].correct += 1;
      correct += 1;
    } else {
      const k = [a.tone, a.picked].sort().join("-");
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }
  }
  let mixUp: [Tone, Tone] | null = null;
  let best = 1;
  for (const [k, n] of [...pair].sort()) {
    if (n > best) {
      best = n;
      mixUp = k.split("-").map(Number) as [Tone, Tone];
    }
  }
  let weakest: Tone | null = null;
  let worst = { share: 2, misses: -1 };
  for (const t of TONES) {
    const p = perTone[t];
    if (!p.cards || p.correct === p.cards) continue;
    const share = p.correct / p.cards;
    const misses = p.cards - p.correct;
    if (share < worst.share || (share === worst.share && misses > worst.misses)) {
      worst = { share, misses };
      weakest = t;
    }
  }
  return { correct, total: answers.length, perTone, mixUp, weakest };
}

function z() {
  return { cards: 0, correct: 0 };
}

/**
 * The corner each tone sits in, shaped like its mark: the two that end high
 * on top (1 level, 2 rising), the dip and the fall below (3, 4).
 */
export const CORNER: Record<Tone, { x: -1 | 1; y: -1 | 1 }> = {
  1: { x: -1, y: -1 },
  2: { x: 1, y: -1 },
  3: { x: -1, y: 1 },
  4: { x: 1, y: 1 },
};

/** Drag tuning. `commitShare` is of `reach` (the card centre → corner distance). */
export const SWIPE = {
  /** Below this the card points at no corner (px). */
  deadZonePx: 24,
  /** Each axis must carry at least this share of the drag, or it is too straight to pick a side. */
  minAxisShare: 0.2,
  /** Released past this share of the way to a corner → it commits. */
  commitShare: 0.3,
  /** A flick: released moving at least this fast (px/ms) and past the dead zone. */
  flickPxPerMs: 0.6,
} as const;

/** The corner a drag points at, or null (too short, or too straight up/down/sideways). */
export function cornerFor(dx: number, dy: number): Tone | null {
  const d = Math.hypot(dx, dy);
  if (d < SWIPE.deadZonePx) return null;
  if (Math.abs(dx) < d * SWIPE.minAxisShare || Math.abs(dy) < d * SWIPE.minAxisShare) {
    return null;
  }
  const x = dx < 0 ? -1 : 1;
  const y = dy < 0 ? -1 : 1;
  return TONES.find((t) => CORNER[t].x === x && CORNER[t].y === y) ?? null;
}

/** On release: the tone the card commits to, or null (it springs back). */
export function releaseTone(
  dx: number,
  dy: number,
  reach: number,
  speedPxPerMs: number,
): Tone | null {
  const t = cornerFor(dx, dy);
  if (t === null) return null;
  const far = Math.hypot(dx, dy) >= reach * SWIPE.commitShare;
  return far || speedPxPerMs >= SWIPE.flickPxPerMs ? t : null;
}

/** Keyboard: 1–4 answer; arrows move a ring between corners (Enter answers it). */
export function keyTone(key: string): Tone | null {
  return key === "1" || key === "2" || key === "3" || key === "4"
    ? (Number(key) as Tone)
    : null;
}

export function moveRing(from: Tone | null, key: string): Tone | null {
  const c = from ? CORNER[from] : { x: -1, y: -1 };
  let { x, y } = c;
  if (key === "ArrowLeft") x = -1;
  else if (key === "ArrowRight") x = 1;
  else if (key === "ArrowUp") y = -1;
  else if (key === "ArrowDown") y = 1;
  else return from;
  return TONES.find((t) => CORNER[t].x === x && CORNER[t].y === y) ?? null;
}

/** The text shared from the end screen. */
export function shareLine(correct: number, total: number, style: TestStyle): string {
  return `I matched ${correct}/${total} Mandarin tones by ear${style === "spoken" ? " (spoken speed)" : ""}. Can you beat it?`;
}

export interface ToneTestReporter {
  started(): void;
  answered(a: Answer): void;
  roundDone(): void;
  style(s: TestStyle): void;
  /** Once, on `pagehide`; nothing if no round was started. */
  summary(): void;
}

/**
 * `tool_used` (`started` / `round_done`, once per round) and one
 * `tool_summary` per visit. Counts and a closed style only: no word, no text.
 */
export function makeToneTestReporter(send: (e: AnalyticsEvent) => void): ToneTestReporter {
  const safe = (e: AnalyticsEvent) => {
    try {
      send(e);
    } catch {
      // Analytics never breaks the page.
    }
  };
  let rounds = 0;
  let cards = 0;
  let correct = 0;
  const per = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Tone, number>;
  const styles = new Set<TestStyle>();
  let inRound = false;
  let summarised = false;
  let current: TestStyle = "standard";
  return {
    style(s) {
      current = s;
    },
    started() {
      if (inRound) return;
      inRound = true;
      rounds += 1;
      styles.add(current);
      safe({ type: "tool_used", tool: "tone-test", action: "started" });
    },
    answered(a) {
      cards += 1;
      if (a.picked === a.tone) {
        correct += 1;
        per[a.tone] += 1;
      }
    },
    roundDone() {
      if (!inRound) return;
      inRound = false;
      safe({ type: "tool_used", tool: "tone-test", action: "round_done" });
    },
    summary() {
      if (summarised || !rounds) return;
      summarised = true;
      safe({
        type: "tool_summary",
        tool: "tone-test",
        rounds,
        cards,
        correct,
        t1Correct: per[1],
        t2Correct: per[2],
        t3Correct: per[3],
        t4Correct: per[4],
        style: styles.size > 1 ? "mixed" : current,
      });
    },
  };
}
