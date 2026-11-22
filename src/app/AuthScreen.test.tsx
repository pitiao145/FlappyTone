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
