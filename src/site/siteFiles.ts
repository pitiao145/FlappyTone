/**
 * Build-time text generated from the route table: per-route `<head>` tags,
 * `sitemap.xml` and `llms.txt`. Pure string functions, so they are tested
 * directly and run in Node (vite.config.ts) without a DOM.
 */

import { ROUTES, absoluteUrl, routeFor, type SiteRoute } from "./routes.ts";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Routes that may be indexed: in the sitemap and llms.txt. */
export function indexableRoutes(
  routes: readonly SiteRoute[] = ROUTES,
): SiteRoute[] {
  return routes.filter((r) => !r.noindex);
}

/**
 * The per-route head tags for the shared `site.html` shell: title,
 * description, canonical, robots (noindex) and hreflang alternates. The
 * `x-default` points at the English version of the pair.
 */
/** The site-wide social preview image (also used by index.html). */
export const OG_IMAGE = "https://flappytone.com/og.png?v=2";

export function headTags(route: SiteRoute): string {
  const tags = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<link rel="canonical" href="${absoluteUrl(route.path)}" />`,
  ];
  // Social previews (Open Graph / X). One shared image; title, description
  // and URL are the page's own.
  const og = absoluteUrl(route.path);
  tags.push(
    `<meta property="og:type" content="${route.pageType === "word" ? "article" : "website"}" />`,
    `<meta property="og:site_name" content="FlappyTone" />`,
    `<meta property="og:title" content="${esc(route.title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${og}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="The FlappyTone bird flying through a tunnel shaped like a Mandarin tone." />`,
    `<meta property="og:locale" content="${route.lang === "zh-tw" ? "zh_TW" : "en_US"}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  );
  if (route.noindex) tags.push(`<meta name="robots" content="noindex" />`);
  if (route.alternate) {
    const other = routeFor(route.alternate);
    if (other) {
      const en =
        route.lang === "en" ? route : other.lang === "en" ? other : route;
      for (const r of [route, other]) {
        tags.push(
          `<link rel="alternate" hreflang="${r.lang}" href="${absoluteUrl(r.path)}" />`,
        );
      }
      tags.push(
        `<link rel="alternate" hreflang="x-default" href="${absoluteUrl(en.path)}" />`,
      );
    }
  }
  return tags.join("\n    ");
}

/**
 * `<script type="application/ld+json">` tags for a route's structured data.
 * `<` is escaped so no string inside can close the script element.
 */
export function jsonLdTags(data: readonly object[]): string {
  return data
    .map(
      (d) =>
        `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, "\\u003c")}</script>`,
    )
    .join("\n    ");
}

/**
 * lastmod is each route's hand-set date and must be edited by hand when that
 * page's content actually changes. Do not generate it from the build date: a
 * sitemap that claims a change on every deploy teaches Google to distrust
 * lastmod and then ignore it entirely.
 */
export function sitemapXml(routes: readonly SiteRoute[] = ROUTES): string {
  const urls = indexableRoutes(routes)
    .map((r) => {
      const alt = r.alternate
        ? routes.find((x) => x.path === r.alternate)
        : undefined;
      const links = alt
        ? [r, alt]
            .map(
              (x) =>
                `\n    <xhtml:link rel="alternate" hreflang="${x.lang}" href="${absoluteUrl(x.path)}" />`,
            )
            .join("")
        : "";
      return `  <url>\n    <loc>${absoluteUrl(r.path)}</loc>\n    <lastmod>${r.lastmod}</lastmod>${links}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated at build time from src/site/routes.ts (src/site/siteFiles.ts). Edit lastmod there, by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

/**
 * llms.txt (llmstxt.org): a plain description for AI assistants, plus the
 * public pages. Every claim here must be true in the code today.
 */
export function llmsTxt(routes: readonly SiteRoute[] = ROUTES): string {
  const pages = indexableRoutes(routes)
    .map((r) => `- [${r.title}](${absoluteUrl(r.path)}): ${r.description}`)
    .join("\n");
  return `# FlappyTone

> A browser game for practising the four Mandarin tones with your voice. Your live pitch steers a bird through corridors shaped like the tone you have to say.

- Free to try in the browser, no signup needed: ${absoluteUrl("/app")}
- Reference audio is recorded by a native Taiwan Mandarin speaker; all hanzi is Traditional Chinese.
- Pitch is analysed on the device. The game does not upload or store your microphone audio.
- The core idea: tones are hard because they are abstract. FlappyTone makes them visible. Each tone is drawn as a shape on screen and your own voice is drawn live against it, so you link what you hear and say to what you see.
- Tone pair practice: two-syllable words (e.g. 好玩, 美國) with their own mode. Each corridor is measured from the native speaker's real recording, so it follows natural tone sandhi (e.g. a 3rd tone before another 3rd tone) as she actually says it.
- It checks the tone's pitch shape, not the syllable (no speech recognition).
- Tiers: guest (3 runs a day, no account), free account (10 runs a day, saved progress, leaderboard), Pro, sold as EarlyBird (one-time payment: unlimited runs, full history, customisation).

## Pages

${pages}
`;
}
