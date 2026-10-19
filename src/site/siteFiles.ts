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
export function indexableRoutes(routes: readonly SiteRoute[] = ROUTES): SiteRoute[] {
  return routes.filter((r) => !r.noindex);
}

/**
 * The per-route head tags for the shared `site.html` shell: title,
 * description, canonical, robots (noindex) and hreflang alternates. The
 * `x-default` points at the English version of the pair.
 */
export function headTags(route: SiteRoute): string {
  const tags = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<link rel="canonical" href="${absoluteUrl(route.path)}" />`,
  ];
  if (route.noindex) tags.push(`<meta name="robots" content="noindex" />`);
  if (route.alternate) {
    const other = routeFor(route.alternate);
    if (other) {
      const en = route.lang === "en" ? route : other.lang === "en" ? other : route;
      for (const r of [route, other]) {
        tags.push(`<link rel="alternate" hreflang="${r.lang}" href="${absoluteUrl(r.path)}" />`);
      }
      tags.push(`<link rel="alternate" hreflang="x-default" href="${absoluteUrl(en.path)}" />`);
    }
  }
  return tags.join("\n    ");
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
      const alt = r.alternate ? routes.find((x) => x.path === r.alternate) : undefined;
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
- It checks the tone's pitch shape, not the syllable (no speech recognition). Single syllables and two-syllable words.
- Tiers: guest (3 runs a day, no account), free account (10 runs a day, saved progress, leaderboard), Pro, sold as EarlyBird (one-time payment: unlimited runs, full history, customisation).

## Pages

${pages}
`;
}
