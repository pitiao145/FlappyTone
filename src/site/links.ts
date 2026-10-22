/**
 * Site-wide navigation data: the "Learn & tools" group (footer) and the
 * breadcrumb trail of each route. Pure, no React, so the crawl test and the
 * JSON-LD builder read the same source as the visible markup.
 */

import { absoluteUrl, routeFor } from "./routes.ts";
import { sayWordFor } from "./sayWords.ts";

export interface SiteLink {
  href: string;
  label: string;
}

/** Linked from every page's footer, so no indexable page is more than 1 click from `/`. */
export const LEARN_LINKS: readonly SiteLink[] = [
  { href: "/chinese-tones", label: "Chinese tones" },
  { href: "/tools/tone-test", label: "Tone test" },
  { href: "/tools/tone-visualizer", label: "Tone visualizer" },
  { href: "/tools/tone-marks", label: "Tone marks" },
  { href: "/say", label: "Say a word" },
];

export interface Crumb {
  name: string;
  path: string;
}

const HOME: Crumb = { name: "FlappyTone", path: "/" };
const HUB: Crumb = { name: "Chinese tones", path: "/chinese-tones" };
const SAY: Crumb = { name: "Say a word", path: "/say" };

const CRUMB_NAMES: Record<string, string> = {
  "/tools/tone-test": "Tone test",
  "/tools/tone-visualizer": "Tone visualizer",
  "/tools/tone-marks": "Tone marks",
};

/**
 * The trail for a route, root first, the page itself last. Empty for `/` and
 * the legal pages (no useful parent).
 */
export function breadcrumbsFor(path: string): Crumb[] {
  const route = routeFor(path);
  if (!route || route.pageType === "landing" || route.pageType === "legal") return [];
  if (path === HUB.path) return [HOME, HUB];
  if (path === SAY.path) return [HOME, HUB, SAY];
  if (route.pageType === "word") {
    const word = sayWordFor(path.slice(SAY.path.length + 1));
    return [HOME, HUB, SAY, { name: word?.phrase ?? path, path }];
  }
  return [HOME, HUB, { name: CRUMB_NAMES[path] ?? route.title, path }];
}

/** BreadcrumbList JSON-LD, or none when the route has no trail. */
export function breadcrumbJsonLd(crumbs: readonly Crumb[]): object[] {
  if (crumbs.length < 2) return [];
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: absoluteUrl(c.path),
      })),
    },
  ];
}
