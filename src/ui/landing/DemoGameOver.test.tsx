import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGate, newRunStats } from "../../game/scoring.ts";
import { DEFAULT_TIER_LIMITS } from "../../game/tiers.ts";
import { DemoGameOver } from "./DemoGameOver.tsx";
import { TESTIMONIALS, nextQuoteIndex } from "../testimonials.ts";

// The title renders one sentence per <span>; join them back for text checks.
const html = (stats = newRunStats()) =>
  renderToStaticMarkup(<DemoGameOver stats={stats} onSignup={() => {}} onRetry={() => {}} />).replaceAll(
    "</span><span>",
    " ",
  );

describe("DemoGameOver", () => {
  it("score, then the card (title, perks, button), the quote, then One more round", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [1], "good", 0.9);
    stats = applyGate(stats, [4], "collision", 0.4);
    stats = applyGate(stats, [4], "ok", 0.4);
    const out = html(stats);
    expect(out).toContain("Fourth tone: 40% accuracy. Keep it climbing.");
    expect(out).toContain(`Free, ${DEFAULT_TIER_LIMITS.free.runsPerDay} runs a day, no card`);
    const order = ["go-score", "Keep it climbing", "go-demo-perks", "Save my progress, improve my tones", "go-demo-quote", "One more round"].map(
      (s) => out.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows each heard tone's accuracy in the score card, never an unheard one", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [1], "good", 0.9);
    stats = applyGate(stats, [4], "ok", 0.4);
    stats = applyGate(stats, [3], "unheard", null);
    const out = html(stats);
    const card = out.slice(out.indexOf("go-header"), out.indexOf("go-demo-pitch"));
    expect(card).toContain("First tone: 90% tone accuracy");
    expect(card).toContain("Fourth tone: 40% tone accuracy");
    expect(card).not.toContain("Third tone");
  });

  it("rotates the landing page's quotes, one per end screen", () => {
    const first = nextQuoteIndex();
    const second = nextQuoteIndex();
    expect(second).toBe((first + 1) % TESTIMONIALS.length);
    for (const [i, q] of TESTIMONIALS.entries()) {
      const out = renderToStaticMarkup(<DemoGameOver stats={newRunStats()} quote={i} onSignup={() => {}} onRetry={() => {}} />);
      expect(out).toContain("sky-testimonial");
      expect(out).toContain(`/lp/birds/${q.bird}.webp`);
    }
  });

  it("names the worst tone of the run, even one flown only once", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "good", 0.9);
    stats = applyGate(stats, [3], "good", 0.88);
    stats = applyGate(stats, [2], "ok", 0.55);
    stats = applyGate(stats, [1], "good", 0.8);
    expect(html(stats)).toContain("Second tone: 55% accuracy. Keep it climbing.");
  });

  it("praises a strong run: the lowest tone at 80% or more", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "good", 0.89);
    stats = applyGate(stats, [1], "perfect", 0.95);
    expect(html(stats)).toContain("Strong start! Your lowest is the third tone, at 89% accuracy.");
  });

  it("round 1: the weakest-tone title and One more round", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "ok", 0.6);
    const out = html(stats);
    expect(out).toContain("Second tone: 60% accuracy.");
    expect(out).toContain("One more round");
    expect(out).toContain("Save my progress, improve my tones");
  });

  it("round 3: the player's rounds and best, signup first, One last round", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "ok", 0.6);
    const out = renderToStaticMarkup(
      <DemoGameOver stats={stats} round={3} best={1240} onSignup={() => {}} onRetry={() => {}} onClose={() => {}} />,
    ).replaceAll("</span><span>", " ");
    expect(out).toContain("3 rounds, best 1,240. Keep them: sign up free.");
    expect(out).not.toContain("Second tone: 60% accuracy.");
    expect(out).toContain("One last round");
    expect(out).not.toContain("One more round");
    expect(out).not.toContain(">Close<");
    expect(out.indexOf("Save my progress")).toBeLessThan(out.indexOf("One last round"));
  });

  it("round 5: no retry, Sign up to keep playing, and Close", () => {
    const out = renderToStaticMarkup(
      <DemoGameOver stats={newRunStats()} round={5} best={900} onSignup={() => {}} onRetry={() => {}} onClose={() => {}} />,
    ).replaceAll("</span><span>", " ");
    expect(out).toContain("5 rounds, best 900. Keep them: sign up free.");
    expect(out).toContain("Sign up to keep playing");
    expect(out).not.toContain("round</button>");
    expect(out).not.toContain("One last round");
    expect(out).not.toContain("One more round");
    expect(out).toContain(">Close<");
  });

  it("with nothing scored, the title skips the best score", () => {
    const out = renderToStaticMarkup(
      <DemoGameOver stats={newRunStats()} round={3} best={0} onSignup={() => {}} onRetry={() => {}} />,
    ).replaceAll("</span><span>", " ");
    expect(out).toContain("3 rounds. Keep them: sign up free.");
  });

  it("past round 5 the title speaks of the last 5 rounds", () => {
    const out = renderToStaticMarkup(
      <DemoGameOver stats={newRunStats()} round={7} best={900} onSignup={() => {}} onRetry={() => {}} />,
    ).replaceAll("</span><span>", " ");
    expect(out).toContain("Your last 5 rounds, best 900.");
  });

  it("has no share, leaderboard, recalibration, XP, personal best or tone breakdown", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "perfect", 0.95);
    const out = html(stats).toLowerCase();
    for (const s of ["share", "leaderboard", "board", "calibration", "xp", "personal best", "best ", "too easy"]) {
      expect(out).not.toContain(s);
    }
  });

  it("keeps an unheard gate neutral: it is never the weakest tone", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [3], "unheard", null);
    stats = applyGate(stats, [3], "unheard", null);
    stats = applyGate(stats, [1], "ok", 0.7);
    const out = html(stats);
    expect(out).toContain("First tone: 70% accuracy. Keep it climbing.");
    expect(out).not.toContain("third tone");
    expect(out).not.toMatch(/Tone [1-4]/);
  });

  it("with no heard tone, a plain title", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [2], "unheard", null);
    expect(html(stats)).toContain("Keep your tones climbing.");
  });
});
