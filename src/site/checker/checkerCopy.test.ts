import { describe, expect, it } from "vitest";
import type { AnalyticsEvent } from "../../analytics/session.ts";
import { eventTier } from "../../analytics/session.ts";
import { attemptView, makeCheckerReporter } from "./checkerCopy.ts";

describe("attemptView", () => {
  it("an unclear attempt is never a score or a tone read (hard rule 8)", () => {
    const v = attemptView({ accuracy: null, read: { tone: 2, confidence: 1 } }, 3, 1);
    expect(v.percent).toBeNull();
    expect(v.read).toBeNull();
    expect(v.headline).toMatch(/couldn't hear/i);
  });

  it("names the read tone against the target", () => {
    const v = attemptView({ accuracy: 0.5, read: { tone: 2, confidence: 0.8 } }, 3, 1);
    expect(v.percent).toBe(50);
    expect(v.read).toBe("Sounded like Tone 2. Target: Tone 3.");
    expect(attemptView({ accuracy: 0.9, read: { tone: 3, confidence: 1 } }, 3, 1).tier).toBe("good");
  });

  it("gives no tone read for a two-syllable word", () => {
    expect(attemptView({ accuracy: 0.7, read: null }, 3, 2).read).toBeNull();
  });
});

describe("tone visualizer analytics", () => {
  const ALLOWED_KEYS = new Set(["type", "tool", "action", "attempts", "targets"]);

  it("sends each action once, then counts only, all global tier", () => {
    const sent: AnalyticsEvent[] = [];
    const r = makeCheckerReporter((e) => sent.push(e));
    r.summary(); // never started: nothing
    r.action("started");
    r.action("started");
    r.action("calibrated");
    r.attempt("3");
    r.attempt("3");
    r.attempt("3-3");
    r.summary();
    r.summary();
    expect(sent).toEqual([
      { type: "tool_used", tool: "tone-visualizer", action: "started" },
      { type: "tool_used", tool: "tone-visualizer", action: "calibrated" },
      { type: "tool_used", tool: "tone-visualizer", action: "first_attempt" },
      { type: "tool_summary", tool: "tone-visualizer", attempts: 3, targets: 2 },
    ]);
    for (const e of sent) {
      expect(eventTier(e.type)).toBe("global");
      // No accuracy, pitch, word id or text: only the closed keys, and every
      // string value is from the fixed vocabulary.
      for (const [k, v] of Object.entries(e)) {
        expect(ALLOWED_KEYS.has(k), k).toBe(true);
        if (typeof v === "string") {
          expect(["tool_used", "tool_summary", "tone-visualizer", "started", "mic_denied", "calibrated", "first_attempt"]).toContain(v);
        }
      }
    }
  });

  it("a throwing sender never breaks the page", () => {
    const r = makeCheckerReporter(() => {
      throw new Error("blocked");
    });
    expect(() => {
      r.action("started");
      r.summary();
    }).not.toThrow();
  });
});
