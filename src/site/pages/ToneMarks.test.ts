import { describe, expect, it } from "vitest";
import { makeToolUsedReporter } from "./ToneMarks.tsx";
import { routeFor } from "../routes.ts";
import { pageViewProps } from "../pageAnalytics.ts";

describe("tool_used", () => {
  it("fires once per page load, with the direction and never the text", () => {
    const sent: object[] = [];
    const report = makeToolUsedReporter((e) => sent.push(e));
    report("   ");
    report("nǐ hǎo secret");
    report("ni3 hao3");
    expect(sent).toEqual([{ type: "tool_used", tool: "tone-marks", direction: "to-numbers" }]);
    expect(JSON.stringify(sent)).not.toContain("secret");
  });

  it("numbered input reads as to-marks", () => {
    const sent: { direction: string }[] = [];
    makeToolUsedReporter((e) => sent.push(e))("lv4");
    expect(sent[0].direction).toBe("to-marks");
  });
});

describe("page views", () => {
  it("hub and tool carry their page type", () => {
    expect(pageViewProps(routeFor("/chinese-tones")!)).toEqual({
      page_type: "hub", lang: "en", angle: "learner", page_path: "/chinese-tones",
    });
    expect(pageViewProps(routeFor("/tools/tone-marks")!).page_type).toBe("tool");
  });
});
