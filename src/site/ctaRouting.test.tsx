/**
 * Brief 25's CTA table, checked on the prerendered markup (the first render,
 * before hydration turns overlay links into buttons): overlay CTAs point at
 * the landing demo (`/#demo`, the no-JS fallback) and carry
 * `data-cta="overlay"`; signup CTAs are real links into /app with `?src=`.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE_PAGES, SitePage } from "./pages.tsx";
import { WordViewer } from "./WordViewer.tsx";
import { PIP_CTA_LABEL } from "./Pip.tsx";
import { gameHref } from "../toneder/cta.ts";
import { weakPairLine } from "../app/authGate.ts";

const html = (path: string) => renderToStaticMarkup(<SitePage path={path} />);
const overlays = (out: string) => out.match(/<a [^>]*data-cta="overlay"[^>]*href="\/#demo"/g)?.length ?? 0;

const demoPages = Object.keys(SITE_PAGES).filter((p) => p !== "/tools/tone-visualizer");

describe("site CTA routing (brief 25)", () => {
  it("nav Play goes to signup on every page (row 1)", () => {
    for (const path of Object.keys(SITE_PAGES)) {
      expect(html(path), path).toContain(`href="/app?src=${path}"`);
    }
  });

  it.each(demoPages)("%s: the bottom PipCta opens the demo overlay", (path) => {
    const out = html(path);
    expect(overlays(out), path).toBeGreaterThanOrEqual(1);
    expect(out).toContain(PIP_CTA_LABEL.demo);
    expect(out).not.toContain(PIP_CTA_LABEL.signup);
  });

  it("tone test: the play link opens the overlay too (rows 10, 11)", () => {
    expect(overlays(html("/tools/tone-test"))).toBe(2);
  });

  it("tone test: the round result still goes to signup with ?weak= (row 9)", () => {
    expect(gameHref("/tools/tone-test", [2, 3])).toBe("/app?src=/tools/tone-test&weak=2-3");
    expect(weakPairLine("?src=/tools/tone-test&weak=2-3")).toBe(
      "Your weak spot is 2nd vs 3rd. Sign up free to train it.",
    );
    expect(weakPairLine("?weak=3-2")).toBeNull();
    expect(weakPairLine("")).toBeNull();
  });

  it("tone visualizer: every CTA goes to signup, with the feature line (rows 12, 15)", () => {
    const out = html("/tools/tone-visualizer");
    expect(overlays(out)).toBe(0);
    expect(out).toContain('href="/app?intent=visualiser&amp;src=/tools/tone-visualizer"');
    expect(out).toContain(PIP_CTA_LABEL.signup);
    expect(out).toContain("tc-app-features");
  });

  it("word viewer: Try it opens the overlay (rows 3, 5)", () => {
    const out = renderToStaticMarkup(
      <WordViewer
        word={{ id: "ni3", hanzi: "你", pinyin: "nǐ", english: "you", tone: 3 }}
        from="/say/hello"
        onClose={() => {}}
      />,
    );
    expect(overlays(out)).toBe(1);
    expect(out).not.toContain("/app?");
  });
});
