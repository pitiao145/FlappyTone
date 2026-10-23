/**
 * The tone visualizer's words and its analytics reporter — pure, no audio, so
 * the page's initial chunk can import it and tests run without a DOM.
 */

import type { AnalyticsEvent } from "../../analytics/session.ts";
import type { Tone } from "../../game/gates.ts";
import { toneName } from "../toneNames.ts";

export interface AttemptView {
  /** Whole percent, or null for "couldn't hear that". */
  percent: number | null;
  headline: string;
  /** The tone read in plain words, or null when there is none to give. */
  read: string | null;
  tier: "good" | "ok" | "bad" | "unclear";
}

/** The same 85 % / 60 % cut points as the game and the in-app visualiser. */
function tierOf(acc: number): "good" | "ok" | "bad" {
  return acc >= 0.85 ? "good" : acc >= 0.6 ? "ok" : "bad";
}

/**
 * What one attempt says to the visitor. An unclear signal is never a score
 * (hard rule 8): no percentage, no tone read, just "try again".
 */
export function attemptView(
  result: {
    accuracy: number | null;
    read: { tone: Tone | "none"; confidence: number } | null;
    syllables?: (Tone | "none" | null)[] | null;
  },
  target: Tone,
  syllables: number,
): AttemptView {
  if (result.accuracy === null) {
    return {
      percent: null,
      headline: "Couldn't hear that, try again",
      read: null,
      tier: "unclear",
    };
  }
  const percent = Math.round(result.accuracy * 100);
  const tier = tierOf(result.accuracy);
  const headline =
    tier === "good" ? "That's the shape" : tier === "ok" ? "Close" : "Not quite yet";
  let read: string | null = null;
  if (syllables === 1 && result.read) {
    const r = result.read;
    read =
      r.tone === "none"
        ? `Didn't sound like one clear tone. Target: ${toneName(target)}.`
        : r.tone === target
          ? `Sounded like a ${toneName(r.tone)}, the target.`
          : `Sounded like a ${toneName(r.tone)}. Target: ${toneName(target)}.`;
  }
  if (syllables > 1 && result.syllables) {
    // Describes what was heard, without judging it against the target: the
    // per-syllable read is new, and a wrong "wrong" is worse than none.
    const s = result.syllables;
    read =
      s.length !== syllables || s.some((t) => t === null || t === "none")
        ? "Couldn't detect both tones."
        : `Sounded like ${s.map((t) => `a ${toneName(t as Tone)}`).join(", then ")}.`;
  }
  return { percent, headline, read, tier };
}

type CheckerAction = Extract<
  AnalyticsEvent,
  { type: "tool_used"; tool: "tone-visualizer" }
>["action"];

export interface CheckerReporter {
  /** Each action at most once per page load. */
  action(a: CheckerAction): void;
  /** One scored or unclear attempt, on a target (tone/pair) id. */
  attempt(targetId: string): void;
  /** Once, on `pagehide`; nothing if the visualizer was never started. */
  summary(): void;
}

/**
 * The `tool_used` / `tool_summary` reporter. Carries only fixed action names
 * and counts: never an accuracy, a pitch, the tone picked or anything typed.
 */
export function makeCheckerReporter(
  send: (e: AnalyticsEvent) => void,
): CheckerReporter {
  const sent = new Set<CheckerAction>();
  const targets = new Set<string>();
  let attempts = 0;
  let summarised = false;
  const safe = (e: AnalyticsEvent) => {
    try {
      send(e);
    } catch {
      // Analytics never breaks the page.
    }
  };
  const action = (a: CheckerAction) => {
    if (sent.has(a)) return;
    sent.add(a);
    safe({ type: "tool_used", tool: "tone-visualizer", action: a });
  };
  return {
    action,
    attempt(targetId) {
      attempts += 1;
      targets.add(targetId);
      action("first_attempt");
    },
    summary() {
      if (summarised || !sent.has("started")) return;
      summarised = true;
      safe({
        type: "tool_summary",
        tool: "tone-visualizer",
        attempts,
        targets: targets.size,
      });
    },
  };
}
