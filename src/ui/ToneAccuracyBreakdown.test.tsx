import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Tone } from "../game/gates.ts";
import { applyGate, newRunStats, type RunStats } from "../game/scoring.ts";
import { hasToneAccuracy, ToneAccuracyBreakdown } from "./ToneAccuracyBreakdown.tsx";

const html = (stats: RunStats) => renderToStaticMarkup(<ToneAccuracyBreakdown stats={stats} />);
const labels = (out: string) => [...out.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);

describe("ToneAccuracyBreakdown", () => {
  it("renders nothing when no gate was measured", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "unheard", null);
    expect(hasToneAccuracy(stats)).toBe(false);
    expect(html(stats)).toBe("");
  });

  it("shows only the tones played this run, with no dash for the rest", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "good", 0.72);
    stats = applyGate(stats, [1], "collision", 0.9);
    const out = html(stats);
    expect(labels(out)).toEqual(["Tone 1: 90% tone accuracy", "Tone 3: 72% tone accuracy"]);
    expect(out).not.toContain("—");
    expect(out).toContain("tone accuracy");
    // Only one group, so no group headings.
    expect(out).not.toContain("Tone pairs");
  });

  it("lists pair combos weakest first, capped at 4 with a show-all toggle", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "good", 0.8);
    const combos: [Tone, Tone, number][] = [
      [1, 4, 0.9],
      [3, 2, 0.4],
      [2, 2, 0.7],
      [4, 1, 0.55],
      [3, 3, 0.65],
    ];
    for (const [a, b, acc] of combos) stats = applyGate(stats, [a, b], "ok", acc);
    const out = html(stats);
    expect(out).toContain("Tones");
    expect(out).toContain("Tone pairs");
    expect(labels(out).filter((l) => l.includes("then"))).toEqual([
      "Tone 3 then tone 2: 40% tone accuracy",
      "Tone 4 then tone 1: 55% tone accuracy",
      "Tone 3 then tone 3: 65% tone accuracy",
      "Tone 2 then tone 2: 70% tone accuracy",
    ]);
    expect(out).toContain("Show all 5");
  });
});
