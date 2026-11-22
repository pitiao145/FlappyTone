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
  it("score, then the card (title, perks, button), the quote, then Play round 2", () => {
    let stats = newRunStats();
    stats = applyGate(stats, [1], "good", 0.9);
    stats = applyGate(stats, [4], "collision", 0.4);
    stats = applyGate(stats, [4], "ok", 0.4);
    const out = html(stats);
    expect(out).toContain("Fourth tone: 40% accuracy. Keep it climbing.");
    expect(out).toContain(`Free, ${DEFAULT_TIER_LIMITS.free.runsPerDay} runs a day, no card`);
    const order = ["go-score", "Keep it climbing", "go-demo-perks", "Save my progress, improve my tones", "go-demo-quote", "Play round 2"].map(
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

  const round = (score: number, ...gates: [number, number][]) => {
    let st = { ...newRunStats() };
    for (const [tone, acc] of gates) st = applyGate(st, [tone as 1 | 2 | 3 | 4], "ok", acc);
    return { ...st, score };
  };
  const render = (rounds: ReturnType<typeof round>[]) =>
    renderToStaticMarkup(
      <DemoGameOver stats={rounds[rounds.length - 1]} rounds={rounds} onSignup={() => {}} onRetry={() => {}} />,
    ).replaceAll("</span><span>", " ");

  it("round 1: weakest-tone title, demo round 1 of 3, a Play round 2 button", () => {
    const out = render([round(725, [2, 0.6])]);
    expect(out).toContain("Second tone: 60% accuracy.");
    expect(out).toContain("Demo round 1 of 3");
    expect(out).toContain("Round 1: 725");
    expect(out).toContain("Round 2: not played yet");
    expect(out).toContain("Play round 2");
    expect(out).toContain("go-demo-retry-icon");
    expect(out).toContain("Tone accuracy this run");
    expect(out).not.toContain("this round");
  });

  it("round 2: the rounds and best, total tone accuracy with this round under it, last-round button", () => {
    const out = render([round(725, [3, 0.9]), round(1650, [3, 0.3], [1, 0.8])]);
    expect(out).toContain("2 rounds, best 1,650. Sign up to keep them.");
    expect(out).toContain("Demo round 2 of 3");
    expect(out).toContain("Round 2: 1,650, your best");
    expect(out).toContain("Tone accuracy, all 2 rounds");
    // Third tone: (0.9 + 0.3) / 2 = 60% over both rounds, 30% this round.
    expect(out).toContain("Third tone: 60% tone accuracy, 30% this round");
    expect(out).toContain("this\u00a0round 30%");
    expect(out).toContain("Play your last round");
    expect(out.indexOf("Save my progress")).toBeLessThan(out.indexOf("Play your last round"));
  });

  it("round 3, the last: signup only, no retry, the loss line", () => {
    const out = render([round(725, [1, 0.9]), round(1650, [1, 0.9]), round(0, [1, 0.96])]);
    expect(out).toContain("That was your last demo round. Sign up free to keep all 3.");
    expect(out).toContain("Sign up to keep playing");
    expect(out).toContain("Without an account, these rounds are gone in 24 hours.");
    expect(out).not.toContain("go-demo-retry");
    expect(out).not.toContain("Play round");
    expect(out).not.toContain("Play your last round");
  });

  it("after a classic round, Too easy? Try tone pairs sits beside the retry; never on the last round", () => {
    const withPairs = (rounds: ReturnType<typeof round>[]) =>
      renderToStaticMarkup(
        <DemoGameOver stats={rounds[rounds.length - 1]} rounds={rounds} onSignup={() => {}} onRetry={() => {}} onPairs={() => {}} />,
      );
    const one = withPairs([round(725, [1, 0.9])]);
    expect(one).toContain("Too easy? Try tone pairs");
    expect(one.indexOf("Play round 2")).toBeLessThan(one.indexOf("Too easy? Try tone pairs"));
    expect(withPairs([round(1), round(2), round(3)])).not.toContain("Too easy");
    expect(render([round(725, [1, 0.9])])).not.toContain("Too easy");
  });

  it("a Tone Pairs round shows its pairs, summed over rounds", () => {
    let pairs = newRunStats();
    pairs = applyGate(pairs, [3, 2], "ok", 0.5);
    pairs = { ...pairs, score: 400 };
    let pairs2 = newRunStats();
    pairs2 = applyGate(pairs2, [3, 2], "ok", 0.9);
    pairs2 = { ...pairs2, score: 900 };
    const one = renderToStaticMarkup(<DemoGameOver stats={pairs} onSignup={() => {}} onRetry={() => {}} />);
    expect(one).toContain("Third tone then second tone: 50% tone accuracy");
    const two = renderToStaticMarkup(
      <DemoGameOver stats={pairs2} rounds={[pairs, pairs2]} onSignup={() => {}} onRetry={() => {}} />,
    );
    expect(two).toContain("Third tone then second tone: 70% tone accuracy, 90% this round");
  });

  it("with nothing scored, the title skips the best score and no round is starred", () => {
    const out = render([round(0), round(0)]);
    expect(out).toContain("2 rounds. Sign up to keep them.");
    expect(out).not.toContain("your best");
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
