import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import privacyHtml from "../../privacy-policy.html?raw";
import termsHtml from "../../terms-of-service.html?raw";
import { ROUTES, routeFor } from "./routes.ts";
import { headTags, jsonLdTags, llmsTxt, sitemapXml } from "./siteFiles.ts";
import { SITE_PAGES } from "./pages.tsx";
import { seoSource, pageViewProps } from "./pageAnalytics.ts";
import { appHref, setAppLinkSource } from "../ui/appLink.ts";

describe("route table", () => {
  it("paths are unique, clean, and dated by hand", () => {
    const paths = ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of ROUTES) {
      expect(r.path === "/" || /^\/[a-z0-9-/]+[a-z0-9]$/.test(r.path)).toBe(
        true,
      );
      expect(r.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (r.lang === "zh-tw") expect(r.path.startsWith("/zh-tw/")).toBe(true);
      if (r.alternate) expect(routeFor(r.alternate)).toBeDefined();
    }
  });

  it("every site route has a component, every own route an entry", () => {
    for (const r of ROUTES) {
      if (r.shell === "site") expect(SITE_PAGES[r.path]).toBeDefined();
      else expect(r.entry).toBeTruthy();
    }
  });

  it("own entries' HTML heads agree with the table (output unchanged)", () => {
    for (const r of ROUTES.filter((x) => x.shell === "own")) {
      const html = (
        {
          "index.html": indexHtml,
          "privacy-policy.html": privacyHtml,
          "terms-of-service.html": termsHtml,
        } as Record<string, string>
      )[r.entry!];
      expect(html).toBeDefined();
      expect(html).toContain(`<title>${r.title}</title>`);
      expect(html).toContain(`content="${r.description}"`);
    }
  });
});

describe("generated files", () => {
  it("sitemap lists indexable routes only, with their hand-set lastmod", () => {
    const xml = sitemapXml();
    expect(xml).toContain(
      "<loc>https://flappytone.com/</loc>\n    <lastmod>2026-08-07</lastmod>",
    );
    expect(xml).toContain(
      "https://flappytone.com/privacy-policy</loc>\n    <lastmod>2026-09-08",
    );
    expect(xml).toContain(
      "https://flappytone.com/terms-of-service</loc>\n    <lastmod>2026-09-08",
    );
    expect(xml).toContain(
      "https://flappytone.com/chinese-tones</loc>\n    <lastmod>2026-10-19",
    );
    expect(xml).toContain("https://flappytone.com/tools/tone-marks</loc>");
    expect(llmsTxt()).toContain("https://flappytone.com/chinese-tones");
    expect(llmsTxt()).toContain("https://flappytone.com/tools/tone-marks");
    const hidden = sitemapXml([
      { ...routeFor("/chinese-tones")!, noindex: true },
    ]);
    expect(hidden).not.toContain("chinese-tones");
  });

  it("head tags carry canonical, noindex and hreflang pairs", () => {
    const hub = routeFor("/chinese-tones")!;
    expect(headTags(hub)).toContain(
      '<link rel="canonical" href="https://flappytone.com/chinese-tones" />',
    );
    expect(headTags(hub)).not.toContain("noindex");
    expect(headTags({ ...hub, noindex: true })).toContain(
      '<meta name="robots" content="noindex" />',
    );
    const pair = [
      { ...hub, path: "/a", alternate: "/zh-tw/a", noindex: false },
      {
        ...hub,
        path: "/zh-tw/a",
        lang: "zh-tw" as const,
        alternate: "/a",
        noindex: false,
      },
    ];
    const xml = sitemapXml(pair);
    expect(xml).toContain(
      'hreflang="zh-tw" href="https://flappytone.com/zh-tw/a"',
    );
  });
});

describe("attribution", () => {
  it("app links carry ?src= once a page sets its source", () => {
    expect(appHref("visualiser", "/chinese-tones")).toBe(
      "/app?intent=visualiser&src=/chinese-tones",
    );
    setAppLinkSource("/");
    expect(appHref()).toBe("/app?src=/");
  });

  it("?src= is accepted only for route-table paths", () => {
    expect(seoSource("?src=/chinese-tones")?.angle).toBe("learner");
    expect(seoSource("?src=https://evil.example")).toBeNull();
    expect(seoSource("")).toBeNull();
  });

  it("page view props come from the route", () => {
    expect(pageViewProps(routeFor("/chinese-tones")!)).toEqual({
      page_type: "hub",
      lang: "en",
      angle: "learner",
      page_path: "/chinese-tones",
    });
  });
});

describe("json-ld", () => {
  it("escapes < so a string cannot close the script", () => {
    expect(jsonLdTags([{ a: "</script>" }])).toBe(
      '<script type="application/ld+json">{"a":"\\u003c/script>"}</script>',
    );
  });
});
