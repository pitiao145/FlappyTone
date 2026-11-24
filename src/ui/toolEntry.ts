/**
 * Brief 52: the tone visualizer tool's way into the app. Its signup CTAs send
 * `/app?intent=visualiser&src=/tools/tone-visualizer&tone=<id>&cta=<which>`
 * (`toolHref` in ToneVisualizer.tsx). The auth screen reads it to show the
 * word the visitor was on (`toolEntry`), and GameApp reads `tone` to open the
 * in-app Visualiser on that tone or pair (`arrivalTarget`). Pure: no React,
 * no Web Audio, so both sides and the tests share it.
 */
import type { Tone } from "../game/gates.ts";
import { tierLimits } from "../game/tiers.ts";
import { TONE_REFS, type ToneRef } from "../site/checker/toneRefs.ts";

export const TOOL_VISUALIZER_PATH = "/tools/tone-visualizer";

/**
 * Which tool CTA was clicked: `hear` = "Want to hear it first?",
 * `result` = the good-result link, `more` = the page's closing card.
 */
export type ToolCta = "hear" | "result" | "more";
const TOOL_CTAS: readonly ToolCta[] = ["hear", "result", "more"];

/** The tool's tone or pair for an id (`"3"`, `"3-3"`); null for anything else. Never a fallback. */
export function toneTarget(id: string | null | undefined): ToneRef | null {
  return TONE_REFS.find((r) => r.id === id) ?? null;
}

/** "mǎ 馬" → { pinyin: "mǎ", hanzi: "馬" }; "nǐ hǎo 你好" → { pinyin: "nǐ hǎo", hanzi: "你好" }. */
export function splitExample(example: string): { pinyin: string; hanzi: string } {
  const i = example.lastIndexOf(" ");
  return i < 0 ? { pinyin: "", hanzi: example } : { pinyin: example.slice(0, i), hanzi: example.slice(i + 1) };
}

export interface ToolEntry {
  /** The tone or pair the visitor was on; null when the link carried none or an unknown one. */
  ref: ToneRef | null;
  /** The CTA they clicked; null when unknown (the screen then uses the generic tool headline). */
  cta: ToolCta | null;
}

/**
 * Whether `/app` was opened from the tone visualizer tool's signup CTAs:
 * `src` is the tool and `intent` is the visualiser. Null for every other
 * entry, which keeps today's auth screen.
 */
export function toolEntry(search: string): ToolEntry | null {
  const q = new URLSearchParams(search);
  if (q.get("src") !== TOOL_VISUALIZER_PATH || q.get("intent") !== "visualiser") return null;
  const cta = q.get("cta");
  return {
    ref: toneTarget(q.get("tone")),
    cta: TOOL_CTAS.includes(cta as ToolCta) ? (cta as ToolCta) : null,
  };
}

/** What the in-app Visualiser should open on. */
export type ArrivalTarget = {
  /** The tool's id, for analytics (`"3"`, `"3-3"`). */
  id: string;
  /** The example word's hanzi, selected if the player's list has it. */
  hanzi: string;
} & ({ tone: Tone } | { combo: Tone[] });

/**
 * `?intent=visualiser&tone=<id>`: the tone or pair to open the Visualiser on.
 * Null without the visualiser intent, or for a missing or unknown id (the
 * Visualiser then opens on its home, the Free tab).
 */
export function arrivalTarget(search: string): ArrivalTarget | null {
  const q = new URLSearchParams(search);
  if (q.get("intent") !== "visualiser") return null;
  const ref = toneTarget(q.get("tone"));
  if (!ref) return null;
  const { hanzi } = splitExample(ref.example);
  return ref.tones.length === 1
    ? { id: ref.id, hanzi, tone: ref.tones[0] }
    : { id: ref.id, hanzi, combo: [...ref.tones] };
}

/** The analytics props for a tool entry (`toolTarget`, `toolCta`); empty for any other entry. */
export function toolEntryProps(search: string): { toolTarget?: string; toolCta?: ToolCta } {
  const e = toolEntry(search);
  if (!e) return {};
  return {
    ...(e.ref ? { toolTarget: e.ref.id } : {}),
    ...(e.cta ? { toolCta: e.cta } : {}),
  };
}

/** The tool-user signup screen's words (brief 52): a headline for the CTA, and what free gives. */
export interface ToolSignupCopy {
  title: string;
  sub: string;
  perks: string[];
}

/**
 * No game pitch and no bird: the visitor came for the visualizer. The
 * perks read the free tier's own limits, so they stay true if the limits move.
 */
export function toolSignupCopy(entry: ToolEntry): ToolSignupCopy {
  const free = tierLimits().free;
  const ref = entry.ref;
  const pair = ref !== null && ref.tones.length > 1;
  // Real words of that tone or pair, never the example itself: a free list
  // may not hold it (the single-tone examples are not in its first five).
  const words = ref === null ? "real words" : pair ? `real ${ref.label} words` : `real ${ref.label.toLowerCase()} words`;
  const perks = [
    "Hear our native speaker say every practice word",
    `${free.wordsPerTone} practice words per tone, ${free.pairWordsPerCombo} per tone pair`,
    "Free account, no card needed",
  ];
  switch (entry.cta) {
    case "hear":
      return {
        title: "Hear it from a native speaker",
        sub: `Sign up free to hear our native speaker say ${words}, then say them back.`,
        perks,
      };
    case "result":
      return {
        title: "Nice one. Keep going",
        sub: `Sign up free to practise ${words} in the full visualizer.`,
        perks,
      };
    default:
      return {
        title: pair ? "More words for this tone pair" : "More words for this tone",
        sub: `Sign up free to practise ${words} in the full visualizer, each one said by our native speaker.`,
        perks,
      };
  }
}
