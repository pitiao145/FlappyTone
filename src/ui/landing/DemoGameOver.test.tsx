import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGate, newRunStats } from "../../game/scoring.ts";
import { DemoGameOver } from "./DemoGameOver.tsx";

const html = (stats = newRunStats()) =>
  renderToStaticMarkup(<DemoGameOver stats={stats} onSignup={() => {}} onRetry={() => {}} />);

describe("DemoGameOver", () => {
  it("shows the score, the signup card with the weakest tone, then One more round", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [1], "good", 0.9);
    stats = applyGate(stats, [4], "collision", 0.4);
    stats = applyGate(stats, [4], "ok", 0.4);
    const out = html(stats);
    expect(out).toContain("go-score");
    expect(out).toContain("Your Tone 4 is at 40%");
    const order = ["go-score", "Sign up free", "One more round"].map((s) => out.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("names the worst tone of the run, even one flown only once", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "good", 0.9);
    stats = applyGate(stats, [3], "good", 0.88);
    stats = applyGate(stats, [2], "ok", 0.55);
    stats = applyGate(stats, [1], "good", 0.8);
    const out = html(stats);
    expect(out).toContain("Your Tone 2 is at 55%");
    expect(out).toContain("go-demo-weak");
  });

  it("drops the per-tone breakdown, the coach card and the harder round", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [1], "good", 0.9);
    stats = applyGate(stats, [4], "ok", 0.4);
    const out = html(stats);
    expect(out).not.toContain("tone accuracy");
    expect(out).not.toContain("go-tones");
    expect(out).not.toContain("Too easy");
  });

  it("has no share, leaderboard, recalibration, XP or personal best", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "perfect", 0.95);
    const out = html(stats).toLowerCase();
    for (const s of ["share", "leaderboard", "board", "calibration", "xp", "personal best", "best "]) {
      expect(out).not.toContain(s);
    }
  });

  it("keeps an unheard gate neutral: it is never the weakest tone", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "unheard", null);
    stats = applyGate(stats, [3], "unheard", null);
    stats = applyGate(stats, [1], "ok", 0.7);
    const out = html(stats);
    expect(out).toContain("Your Tone 1 is at 70%");
    expect(out).not.toContain("Tone 3");
  });
});
