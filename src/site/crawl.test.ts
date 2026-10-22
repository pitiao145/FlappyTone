/**
 * Crawl hygiene for every indexable route (brief 19). Everything here is
 * derived from the route table and the same render functions the build uses,
 * so a new page is checked the moment it is added.
 */
import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import appHtml from "../../app.html?raw";
import recordHtml from "../../record.html?raw";
import privacyHtml from "../../privacy-policy.html?raw";
import termsHtml from "../../terms-of-service.html?raw";
import { ROUTES, absoluteUrl, routeFor, type SiteRoute } from "./routes.ts";
import { headTags, indexableRoutes, sitemapXml } from "./siteFiles.ts";
import { LEARN_LINKS, breadcrumbsFor } from "./links.ts";
import {
  renderLanding,
  renderPrivacy,
  renderSitePage,
  renderTerms,
  siteJsonLd,
} from "../dev/prerenderEntry.tsx";

const OWN_HTML: Record<string, string> = {
  "index.html": indexHtml,
  "privacy-policy.html": privacyHtml,
  "terms-of-service.html": termsHtml,
};

const INDEXABLE = indexableRoutes();

function body(r: SiteRoute): string {
  if (r.shell === "site") return renderSitePage(r.path);
  return { renderLanding, renderPrivacy, renderTerms }[
    r.render as "renderLanding" | "renderPrivacy" | "renderTerms"
  ]();
}

/** `<head>` text for a route: the generated tags, or the own entry's HTML. */
function head(r: SiteRoute): string {
  return r.shell === "site" ? headTags(r) : OWN_HTML[r.entry!];
}

function attr(html: string, re: RegExp): string | undefined {
  return re.exec(html)?.[1];
}

const titleOf = (r: SiteRoute) => attr(head(r), /<title>([^<]*)<\/title>/);
const descOf = (r: SiteRoute) =>
  attr(head(r), /<meta\s+name="description"\s+content="([^"]*)"/);
const canonicalOf = (r: SiteRoute) =>
  attr(head(r), /<link\s+rel="canonical"\s+href="([^"]*)"/);

const unesc = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Internal link paths (no hash or query) in a markup string. */
function internalLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const href = unesc(m[1]);
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const path = href.split(/[?#]/)[0];
    out.push(path.length > 1 ? path.replace(/\/+$/, "") : path);
  }
  return out;
}

describe("sitemap", () => {
  const xml = sitemapXml();

  it("lists every indexable route, each with a lastmod", () => {
    for (const r of INDEXABLE) {
      expect(xml, r.path).toContain(
        `<loc>${absoluteUrl(r.path)}</loc>\n    <lastmod>${r.lastmod}</lastmod>`,
      );
    }
  });

  it("never lists /app, /record or a noindex route", () => {
    expect(xml).not.toContain("flappytone.com/app<");
    expect(xml).not.toContain("flappytone.com/record<");
    for (const r of ROUTES.filter((x) => x.noindex)) {
      expect(xml).not.toContain(`<loc>${absoluteUrl(r.path)}</loc>`);
    }
    expect(ROUTES.some((r) => r.path === "/app" || r.path === "/record")).toBe(false);
  });
});

describe("head tags", () => {
  it("every indexable route has a title and a description", () => {
    for (const r of INDEXABLE) {
      expect(titleOf(r), `${r.path} title`).toBeTruthy();
      expect(descOf(r), `${r.path} description`).toBeTruthy();
    }
  });

  it("titles and descriptions are unique", () => {
    const titles = INDEXABLE.map((r) => unesc(titleOf(r)!));
    const descs = INDEXABLE.map((r) => unesc(descOf(r)!));
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it("canonical is absolute and points at the page itself", () => {
    for (const r of INDEXABLE) {
      const c = canonicalOf(r);
      expect(c, `${r.path} canonical`).toBe(absoluteUrl(r.path));
      expect(c).toMatch(/^https:\/\/flappytone\.com\//);
    }
  });

  it("/app and /record stay noindex", () => {
    const app = appHtml;
    const rec = recordHtml;
    expect(app).toMatch(/name="robots"\s+content="noindex/);
    expect(rec).toMatch(/name="robots"\s+content="noindex/);
  });
});

describe("prerendered body", () => {
  it("has exactly one h1 and real content (no JS needed)", () => {
    for (const r of INDEXABLE) {
      const html = body(r);
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${r.path} h1`).toBe(1);
      const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      expect(text.length, `${r.path} text length`).toBeGreaterThan(400);
    }
  });

  it("every image has alt text", () => {
    for (const r of INDEXABLE) {
      for (const m of body(r).matchAll(/<img\b[^>]*>/g)) {
        expect(m[0], `${r.path}: ${m[0]}`).toMatch(/\salt="/);
      }
    }
  });
});

describe("internal links", () => {
  const known = new Set([...ROUTES.map((r) => r.path), "/app", "/record"]);

  it("point at a real route", () => {
    for (const r of INDEXABLE) {
      for (const p of internalLinks(body(r))) {
        expect(known.has(p), `${r.path} links to unknown ${p}`).toBe(true);
      }
    }
  });

  it("no indexable page is an orphan: reachable from / in 2 clicks", () => {
    const links = new Map<string, Set<string>>();
    for (const r of INDEXABLE) links.set(r.path, new Set(internalLinks(body(r))));
    const depth = new Map<string, number>([["/", 0]]);
    let frontier = ["/"];
    for (let d = 1; d <= 2; d++) {
      const next: string[] = [];
      for (const from of frontier) {
        for (const to of links.get(from) ?? []) {
          if (!depth.has(to) && routeFor(to)) {
            depth.set(to, d);
            next.push(to);
          }
        }
      }
      frontier = next;
    }
    for (const r of INDEXABLE) {
      expect(depth.has(r.path), `${r.path} is not within 2 clicks of /`).toBe(true);
    }
  });

  it("the landing page links the hub and every Learn & tools page", () => {
    const home = new Set(internalLinks(body(routeFor("/")!)));
    for (const l of LEARN_LINKS) expect(home.has(l.href), l.href).toBe(true);
  });

  it("the hub links every tool and /say; each tool and word links back to the hub", () => {
    const hub = new Set(internalLinks(body(routeFor("/chinese-tones")!)));
    for (const r of INDEXABLE.filter((x) => x.pageType === "tool")) {
      expect(hub.has(r.path), `hub -> ${r.path}`).toBe(true);
    }
    expect(hub.has("/say")).toBe(true);
    for (const r of INDEXABLE.filter((x) => x.pageType === "tool" || x.pageType === "word")) {
      const out = internalLinks(body(r));
      expect(out, `${r.path} -> hub`).toContain("/chinese-tones");
      const related = new Set(out.filter((p) => routeFor(p) && p !== r.path && p !== "/"));
      expect(related.size, `${r.path} related links`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("breadcrumbs and structured data", () => {
  it("tool and /say pages show a breadcrumb trail and declare BreadcrumbList", () => {
    for (const r of INDEXABLE.filter((x) => ["tool", "word", "hub"].includes(x.pageType))) {
      expect(breadcrumbsFor(r.path).length, r.path).toBeGreaterThanOrEqual(2);
      expect(body(r), r.path).toContain('aria-label="Breadcrumb"');
      const lists = siteJsonLd(r.path).filter(
        (d) => (d as { "@type"?: string })["@type"] === "BreadcrumbList",
      );
      expect(lists.length, `${r.path} BreadcrumbList`).toBe(1);
    }
  });

  it("tools declare WebApplication, and nothing declares ratings or reviews", () => {
    for (const r of INDEXABLE.filter((x) => x.pageType === "tool")) {
      const types = siteJsonLd(r.path).map((d) => (d as { "@type"?: string })["@type"]);
      expect(types, r.path).toContain("WebApplication");
    }
    for (const r of INDEXABLE) {
      const json = JSON.stringify(siteJsonLd(r.path)) + head(r);
      expect(json).not.toMatch(/aggregateRating|"review"|ratingValue/);
    }
  });

  it("the landing page declares WebSite and Organization", () => {
    expect(indexHtml).toContain('"@type": "WebSite"');
    expect(indexHtml).toContain('"@type": "Organization"');
  });
});
