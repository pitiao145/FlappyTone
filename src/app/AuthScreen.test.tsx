/**
 * Brief 49: the "Try a round first, no signup" link on the /app signup
 * screen. Checked on the first render (SSR), with a stub `window` for the
 * screen's initial state; the overlay itself loads only on a tap.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthScreen } from "./AuthScreen.tsx";
import authSrc from "./AuthScreen.tsx?raw";
import tryItNowSrc from "../ui/landing/TryItNow.tsx?raw";
import type { AuthSource } from "./authGate.ts";

const g = globalThis as unknown as { window?: unknown };
let had: boolean;
let prev: unknown;
beforeEach(() => {
  had = "window" in g;
  prev = g.window;
});
afterEach(() => {
  if (had) g.window = prev;
  else delete g.window;
});

function render(source: AuthSource, search = ""): string {
  g.window = { location: { search } };
  return renderToStaticMarkup(
    <AuthScreen source={source} challengeScore={source === "challenge" ? 100 : null} challengeName={null} />,
  );
}

describe("AuthScreen try link (brief 49)", () => {
  it("direct: shows the demo thumbnail and the nav button", () => {
    const out = render("direct");
    expect(out).toContain('data-testid="auth-try"');
    expect(out).toContain("Try the demo");
    expect(out).toContain("Try a round first</button>");
  });

  it("lp_cta (a site signup button, often after the demo): hides it", () => {
    const out = render("lp_cta");
    expect(out).not.toContain('data-testid="auth-try"');
    expect(out).not.toContain("Try a round first");
  });

  it("challenge: hides it", () => {
    expect(render("challenge")).not.toContain("Try a round first");
  });

  it("Log in view: hides it", () => {
    expect(render("direct", "?auth=login")).not.toContain("Try a round first");
  });

  it("loads the overlay only on the tap, and its signup uses the override", () => {
    expect(authSrc).not.toMatch(/^import .*DemoOverlay/m);
    expect(authSrc).toContain('import("../site/DemoOverlay.tsx")');
    expect(authSrc).toMatch(/onSignup=\{\(\) => \{\s*setDemoOpen\(false\);\s*go\("signup"\);/);
    expect(tryItNowSrc).toMatch(/if \(onSignup\) onSignup\(\);\s*else window\.location\.assign\(appHref/);
  });
});

describe("AuthScreen tool-user screen (brief 52)", () => {
  const TOOL = "?intent=visualiser&src=/tools/tone-visualizer";

  it("tool entry: the word, its CTA headline and three perks; no bird, no game pitch", () => {
    const out = render("lp_cta", `${TOOL}&tone=3&cta=hear`);
    expect(out).toContain('data-testid="auth-tool-word"');
    expect(out).toContain("馬");
    expect(out).toContain("mǎ");
    expect(out).toContain("Third tone");
    expect(out).toContain("Hear it from a native speaker");
    const perks = out.match(/<ul class="auth-perks">(.*?)<\/ul>/)?.[1] ?? "";
    expect(perks.match(/<li>/g)).toHaveLength(3);
    expect(out).not.toContain("auth-bird");
    expect(out).not.toContain("Save your progress");
    expect(out).not.toContain("Sign up free to play");
  });

  it("each tool CTA gets its own headline; a pair shows the pair's word", () => {
    expect(render("lp_cta", `${TOOL}&tone=3&cta=result`)).toContain("Nice one. Keep going");
    const pair = render("lp_cta", `${TOOL}&tone=3-3&cta=more`);
    expect(pair).toContain("More words for this tone pair");
    expect(pair).toContain("你好");
  });

  it("an unknown tone: tool copy, no word card, still no bird", () => {
    const out = render("lp_cta", `${TOOL}&tone=nope&cta=more`);
    expect(out).not.toContain('data-testid="auth-tool-word"');
    expect(out).not.toContain("auth-bird");
    expect(out).toContain("More words for this tone");
  });

  it("Log in from a tool link: today's Welcome back, with the bird", () => {
    const out = render("lp_cta", `${TOOL}&tone=3&cta=hear&auth=login`);
    expect(out).toContain("Welcome back");
    expect(out).toContain("auth-bird");
    expect(out).not.toContain('data-testid="auth-tool-word"');
  });

  it("every other entry renders today's screen unchanged", () => {
    for (const [source, search] of [
      ["direct", ""],
      ["lp_cta", "?src=/chinese-tones"],
      ["lp_cta", "?intent=visualiser&src=/chinese-tones&tone=3&cta=hear"],
      ["lp_cta", "?intent=pricing&src=/tools/tone-visualizer"],
    ] as const) {
      const out = render(source, search);
      expect(out, search).toContain("Save your progress");
      expect(out, search).toContain("Sign up free to play, and track how your tones improve.");
      expect(out, search).not.toContain('data-testid="auth-tool-word"');
      expect(out, search).not.toContain("auth-perks");
    }
    expect(render("lp_cta", "?src=/chinese-tones")).toContain("auth-bird");
  });
});
