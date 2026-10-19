/**
 * The route table: every indexable page of the marketing site, one record
 * each. Adding a page = one record here + its component in `src/site/pages.tsx`
 * (for `shell: "site"`). Prerendering (`src/dev/prerender.ts`), the sitemap and
 * llms.txt (`siteFiles.ts`), dev/preview URLs (`src/dev/prettyUrls.ts`), page
 * analytics and `?src=` attribution into /app all read this table.
 *
 * No React, no audio, no Node imports: it is read by vite.config.ts in Node,
 * by the site entries in the browser, and by GameApp (to validate `?src=`).
 *
 * `/app` and `/record` are not here — they are noindex JS shells, not pages.
 */

export type RouteLang = "en" | "zh-tw";
export type PageType =
  "landing" | "hub" | "tool" | "word" | "teacher" | "legal";
export type PageAngle = "learner" | "teacher" | "general";

/**
 * Which HTML file a route is built from:
 * - `site`: the shared content shell (`site.html` + `src/site/main.tsx`),
 *   written to `dist/<path>/index.html` once per route.
 * - `own`: the route keeps its own Vite entry (`entry`), prerendered in place.
 *   Used by `/` and the two legal pages, whose output must not change.
 */
export type RouteShell = "site" | "own";

export interface SiteRoute {
  /** URL path, leading slash, no trailing slash (root is "/"). */
  path: string;
  lang: RouteLang;
  /** Full `<title>`. */
  title: string;
  description: string;
  /**
   * Hand-set date of the last real content change (YYYY-MM-DD). Never the
   * build date — see `siteFiles.ts`.
   */
  lastmod: string;
  pageType: PageType;
  angle: PageAngle;
  /** Path of the other-language version, for hreflang. */
  alternate?: string;
  /** Not in the sitemap or llms.txt, and served with `noindex`. */
  noindex?: boolean;
  shell: RouteShell;
  /** `own` only: the built HTML filename (a `rollupOptions.input` entry). */
  entry?: string;
  /** Export name in `src/dev/prerenderEntry.tsx` that renders the body. */
  render: RenderExport;
}

export type RenderExport =
  "renderLanding" | "renderTerms" | "renderPrivacy" | "renderSitePage";

export const SITE_ORIGIN = "https://flappytone.com";

export const ROUTES: readonly SiteRoute[] = [
  {
    path: "/",
    lang: "en",
    title: "Practice Mandarin Tones With Your Voice — FlappyTone",
    description:
      "Steer a bird with your voice through corridors shaped like Mandarin tone marks. A browser-based tone contour trainer.",
    lastmod: "2026-08-07",
    pageType: "landing",
    angle: "general",
    shell: "own",
    entry: "index.html",
    render: "renderLanding",
  },
  {
    path: "/privacy-policy",
    lang: "en",
    title: "Privacy Policy — FlappyTone",
    description: "What FlappyTone collects, why, and your rights over it.",
    lastmod: "2026-09-08",
    pageType: "legal",
    angle: "general",
    shell: "own",
    entry: "privacy-policy.html",
    render: "renderPrivacy",
  },
  {
    path: "/terms-of-service",
    lang: "en",
    title: "Terms of Service — FlappyTone",
    description: "The terms that govern using FlappyTone.",
    lastmod: "2026-09-08",
    pageType: "legal",
    angle: "general",
    shell: "own",
    entry: "terms-of-service.html",
    render: "renderTerms",
  },
  {
    path: "/chinese-tones",
    lang: "en",
    title: "Chinese Tones: The 4 Mandarin Tones Explained",
    description:
      "The four Mandarin Chinese tones and the neutral tone, drawn from a native speaker's voice, with examples, sandhi rules and FAQs. Practise them out loud free.",
    lastmod: "2026-10-19",
    pageType: "hub",
    angle: "learner",
    shell: "site",
    render: "renderSitePage",
  },
  {
    path: "/tools/tone-marks",
    lang: "en",
    title: "Pinyin Tone Marks Converter (ni3 → nǐ) — FlappyTone",
    description:
      "Free pinyin tone marks converter: type ni3 hao3, get nǐ hǎo, 注音 (Zhuyin) and each tone's shape, or turn marks back into numbers. Then practise them out loud.",
    lastmod: "2026-10-19",
    pageType: "tool",
    angle: "learner",
    shell: "site",
    render: "renderSitePage",
  },
  {
    path: "/tools/tone-checker",
    lang: "en",
    title: "Chinese Pronunciation Checker: Check Your Tones Free — FlappyTone",
    description:
      "Free Chinese pronunciation checker for Mandarin tones: hear a native speaker, say the word, and see your pitch drawn over the recording with a tone accuracy score. No sign-up.",
    lastmod: "2026-10-19",
    pageType: "tool",
    angle: "learner",
    shell: "site",
    render: "renderSitePage",
  },
];

export function routeFor(path: string): SiteRoute | undefined {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return ROUTES.find((r) => r.path === clean);
}

export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}
