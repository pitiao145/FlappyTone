import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGate, newRunStats } from "../../game/scoring.ts";
import { DEFAULT_TIER_LIMITS } from "../../game/tiers.ts";
import { DemoGameOver } from "./DemoGameOver.tsx";

const html = (stats = newRunStats()) =>
  renderToStaticMarkup(<DemoGameOver stats={stats} onSignup={() => {}} onRetry={() => {}} />);

describe("DemoGameOver", () => {
  it("score, then the card (title, perks, button), the quote, then One more round", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [1], "good", 0.9);
    stats = applyGate(stats, [4], "collision", 0.4);
    stats = applyGate(stats, [4], "ok", 0.4);
    const out = html(stats);
    expect(out).toContain("Tone 4: 40%. Keep it climbing.");
    expect(out).toContain(`Free, ${DEFAULT_TIER_LIMITS.free.runsPerDay} runs a day, no card`);
    const order = ["go-score", "Keep it climbing", "go-demo-perks", "Save my scores", "go-demo-quote", "One more round"].map(
      (s) => out.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("names the worst tone of the run, even one flown only once", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "good", 0.9);
    stats = applyGate(stats, [3], "good", 0.88);
    stats = applyGate(stats, [2], "ok", 0.55);
    stats = applyGate(stats, [1], "good", 0.8);
    expect(html(stats)).toContain("Tone 2: 55%. Keep it climbing.");
  });

  it("praises a strong run: the lowest tone at 80% or more", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "good", 0.89);
    stats = applyGate(stats, [1], "perfect", 0.95);
    expect(html(stats)).toContain("Strong start! Tone 3 is your lowest at 89%.");
  });

  it("never promises to save this run (the demo writes nothing)", () => {
    const out = html().toLowerCase();
    expect(out).not.toContain("save this run");
    expect(out).not.toContain("save my score<");
  });

  it("has no share, leaderboard, recalibration, XP, personal best or tone breakdown", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "perfect", 0.95);
    const out = html(stats).toLowerCase();
    for (const s of ["share", "leaderboard", "board", "calibration", "xp", "personal best", "best ", "tone accuracy", "too easy"]) {
      expect(out).not.toContain(s);
    }
  });

  it("keeps an unheard gate neutral: it is never the weakest tone", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "unheard", null);
    stats = applyGate(stats, [3], "unheard", null);
    stats = applyGate(stats, [1], "ok", 0.7);
    const out = html(stats);
    expect(out).toContain("Tone 1: 70%. Keep it climbing.");
    expect(out).not.toContain("Tone 3");
  });

  it("with no heard tone, a plain title", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "unheard", null);
    expect(html(stats)).toContain("Keep your tones climbing.");
  });
});
