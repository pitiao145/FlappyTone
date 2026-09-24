/**
 * Tone sandhi: the tone a word is *pronounced* with, as opposed to its
 * citation (dictionary/pinyin) tone. Pure — no Web Audio, no `src/data/`
 * import — so it can be called from the HUD without dragging anything else
 * in.
 *
 * Rules are Taiwan Mandarin's own (docs/tonepairs/taiwan-mandarin-tone-rules.md,
 * Rules A–D), not textbook Mainland sandhi — see CLAUDE.md's "All hanzi is
 * Traditional Mandarin" for why the distinction matters here.
 *
 * Deliberately narrow: this never feeds a corridor or a score. Multi-syllable
 * gate corridors are measured directly from the speaker's own recording
 * (`src/dev/clipCutMulti.ts`), not derived from rules — see DECISIONS.md's
 * "Shape-agnostic corridor for multi-syllable words". This module only
 * answers "what tone mark should the HUD show as a pronunciation clue,"
 * which is a labeling question, not a scoring one.
 */

import { parseWord } from "../record/pinyin.ts";
import type { Tone } from "./gates.ts";
import type { Word } from "./words.ts";

/**
 * A citation tone, or the half-third tone (半三聲) — the low dip with no
 * rise a 3rd tone takes when it is not followed by another 3rd tone. Not a
 * citation tone itself, so it needs its own value rather than reusing `3`.
 */
export type SandhiTone = Tone | 0 | "half3";

/**
 * The subset of `Word` this needs — callers can pass a bare-tone fallback
 * shape too. `tones` is widened to allow a runtime `0` (neutral): `Word.tones`
 * is typed `Tone[]` but a pairs gate's tones can hold a neutral syllable at
 * runtime — see `words.ts`'s `isMulti` and `Game.tsx`'s own cast for the same
 * looseness.
 */
export interface SandhiWord {
  tones: (Word["tones"][number] | 0)[];
  pinyin: Word["pinyin"];
  hanzi: Word["hanzi"];
}

/**
 * The pronounced tone for each syllable of `word`.
 *
 * A single syllable is phrase-final by definition in this game (no connected
 * speech — see CLAUDE.md's "Out of scope"), so an isolated 3rd tone keeps its
 * full dip-rise and every other syllable is returned unchanged.
 *
 * A two-syllable word only ever adjusts its *first* syllable — the second is
 * always word-final, which is exactly the position no sandhi rule here
 * reaches. Checked in this order:
 *
 * 1. 一 (yī) / 不 (bù), Rules C/D — needs both the pinyin stem+citation-tone
 *    match AND the hanzi character itself, since other words share the same
 *    stem+tone (衣/醫 are also `yi1`, 布/步 are also `bu4`) and would
 *    otherwise be mis-adjusted.
 * 2. Otherwise, 3rd-tone sandhi, Rules A/B: `3+3 → 2`, `3+anything else →
 *    half3`.
 * 3. Otherwise unchanged.
 *
 * Known simplification: Rule C's exceptions (standalone counting, ordinals,
 * a reduplicated-verb sandwich, e.g. 看一看) aren't derivable from tone/hanzi
 * alone and are not handled — see the rules doc §Rule C.
 */
export function sandhiTones(word: SandhiWord): SandhiTone[] {
  const tones: SandhiTone[] = [...word.tones];
  if (tones.length !== 2) return tones;

  const [first, second] = tones;
  const yiBu = firstSyllableYiBu(word, second);
  if (yiBu !== null) {
    tones[0] = yiBu;
  } else if (first === 3) {
    tones[0] = second === 3 ? 2 : "half3";
  }
  return tones;
}

/**
 * Applies Rule C (一) / Rule D (不) to the first syllable, if it qualifies.
 * Returns null when it doesn't, so the caller falls through to the 3rd-tone
 * rule.
 */
function firstSyllableYiBu(word: SandhiWord, nextTone: SandhiTone): SandhiTone | null {
  const firstHanzi = [...word.hanzi][0];
  if (firstHanzi !== "一" && firstHanzi !== "不") return null;

  let stem: string;
  let citationTone: number;
  try {
    const syllables = parseWord(word.pinyin);
    if (syllables.length < 1) return null;
    stem = syllables[0].stem;
    citationTone = syllables[0].tone;
  } catch {
    return null;
  }

  if (firstHanzi === "一" && stem === "yi" && citationTone === 1) {
    return nextTone === 4 ? 2 : 4;
  }
  if (firstHanzi === "不" && stem === "bu" && citationTone === 4) {
    return nextTone === 4 ? 2 : 4;
  }
  return null;
}
