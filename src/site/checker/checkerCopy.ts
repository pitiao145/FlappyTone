/**
 * The tone visualizer's analytics reporter — pure, no audio, so the page's
 * initial chunk can import it and tests run without a DOM. (Its own attempt
 * copy went with brief 53: the page now runs the app's Visualiser.)
 */

import type { AnalyticsEvent } from "../../analytics/session.ts";

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
