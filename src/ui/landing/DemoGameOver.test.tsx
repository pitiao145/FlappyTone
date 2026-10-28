import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGate, newRunStats } from "../../game/scoring.ts";
import { DemoGameOver } from "./DemoGameOver.tsx";

const html = (stats = newRunStats()) =>
  renderToStaticMarkup(<DemoGameOver stats={stats} onSignup={() => {}} onRetry={() => {}} />);

describe("DemoGameOver", () => {
  it("shows the score and this run's tone accuracy", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [1], "good", 0.9);
    stats = applyGate(stats, [4], "collision", 0.4);
    const out = html(stats);
    expect(out).toContain("go-score");
    expect(out).toContain("Tone 1: 90% tone accuracy");
    expect(out).toContain("Tone 4: 40% tone accuracy");
    expect(out).toContain("Track your progress, choose your level, speech style and more.");
    expect(out).toContain("Sign up free");
    expect(out).toContain("One more round");
  });

  it("has no share, leaderboard, recalibration, XP or personal best", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "perfect", 0.95);
    const out = html(stats).toLowerCase();
    for (const s of ["share", "leaderboard", "board", "calibration", "xp", "personal best", "best "]) {
      expect(out).not.toContain(s);
    }
  });

  it("keeps an unheard gate neutral: no tone accuracy drawn for it", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "unheard", null);
    stats = applyGate(stats, [1], "ok", 0.7);
    const out = html(stats);
    expect(out).toContain("Tone 1: 70% tone accuracy");
    expect(out).not.toContain("Tone 3");
  });
});
