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

const BASE_ROUTES: readonly SiteRoute[] = [
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
    path: "/tools/tone-visualizer",
    lang: "en",
    title: "Mandarin Tone Visualizer & Pronunciation Checker (Free) — FlappyTone",
    description:
      "Free Chinese tone checker: say a Mandarin tone and see your pitch drawn over a native speaker's real tone shape or the textbook one, with a tone accuracy score. No sign-up.",
    lastmod: "2026-10-19",
    pageType: "tool",
    angle: "learner",
    shell: "site",
    render: "renderSitePage",
  },
  {
    path: "/say",
    lang: "en",
    title: "How to Say Common Words in Chinese (with Audio) — FlappyTone",
    description:
      "How to say hello, thank you, sorry, goodbye and more in Chinese, each with a native speaker's recording, pinyin, 注音 and how the tones really sound.",
    lastmod: "2026-10-19",
    pageType: "hub",
    angle: "learner",
    shell: "site",
    render: "renderSitePage",
  },
];

/**
 * The /say/* word pages (`src/site/sayWords.ts` holds their copy). Kept here,
 * short, so the route table stays free of page text.
 */
const SAY_META: readonly [slug: string, title: string, description: string][] = [
  ["thank-you", "How to Say Thank You in Chinese (謝謝 xièxie) — with Audio", "How to say thank you and thanks in Chinese: 謝謝 xièxie, with a native speaker's recording, pinyin, 注音 and how the light second syllable really sounds. Practise it free."],
  ["hello", "How to Say Hello in Chinese (你好 nǐ hǎo) — with Audio", "How to say hello in Chinese: 你好 nǐ hǎo is said ní hǎo. Hear each syllable from a native speaker, see why the first tone changes, and practise it free."],
  ["goodbye", "How to Say Goodbye in Chinese (再見 zàijiàn) — with Audio", "How to say goodbye and bye in Chinese: 再見 zàijiàn, plus 拜拜. A native speaker's recording, pinyin, 注音 and how the two falls really sound. Practise free."],
  ["please", "How to Say Please in Chinese (請 qǐng) — with Audio", "How to say please in Chinese: 請 qǐng, a third tone that goes before the verb. Hear a native speaker, see the dip, learn 請問 and 請坐, and practise it free."],
  ["sorry", "How to Say Sorry in Chinese (對不起 duìbuqǐ) — with Audio", "How to say sorry in Chinese: 對不起 duìbuqǐ, and when to say 不好意思 instead. A native speaker's recording, pinyin, 注音 and tone tips. Practise free."],
  ["youre-welcome", "How to Say You're Welcome in Chinese (不客氣) — with Audio", "How to say you're welcome in Chinese: 不客氣 is said bú kèqì. Hear a native speaker, learn why 不 rises, and the Taiwan reply 不會. Practise it free."],
  ["no-problem", "How to Say No Problem in Chinese (沒關係) — with Audio", "How to say no problem and it's okay in Chinese: 沒關係 méi guānxi, and how it differs from 沒問題. A native speaker's recording and tone tips. Practise free."],
  ["yuan", "How to Pronounce Yuan in Chinese (元 yuán) — with Audio", "How to pronounce yuan, the Chinese currency unit: 元 yuán, a rising tone with the ü vowel. Hear a native speaker, see the tone shape, and practise it free."],
];

export const SAY_ROUTES: readonly SiteRoute[] = SAY_META.map(
  ([slug, title, description]) => ({
    path: `/say/${slug}`,
    lang: "en",
    title,
    description,
    lastmod: "2026-10-19",
    pageType: "word",
    angle: "learner",
    shell: "site",
    render: "renderSitePage",
  }),
);

export const ROUTES: readonly SiteRoute[] = [...BASE_ROUTES, ...SAY_ROUTES];

export function routeFor(path: string): SiteRoute | undefined {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return ROUTES.find((r) => r.path === clean);
}

export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}
