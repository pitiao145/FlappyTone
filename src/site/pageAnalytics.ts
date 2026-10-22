/**
 * What a route-table page adds to its `$pageview` (global tier — CLAUDE.md
 * "Play analytics" rule 3), and how `?src=` is validated on arrival in /app.
 * The property names are the closed `SeoPageViewProps` type in
 * `src/analytics/session.ts`; nothing here is typed by the player.
 */

import type { SeoPageViewProps } from "../analytics/session.ts";
import { routeFor, type SiteRoute } from "./routes.ts";

export function pageViewProps(route: SiteRoute): SeoPageViewProps {
  return {
    page_type: route.pageType,
    lang: route.lang,
    angle: route.angle,
    page_path: route.path,
  };
}

/**
 * The route a `?src=` value names, or null. Only a path in the route table is
 * accepted, so the value that reaches PostHog is always one of a closed set.
 */
export function seoSource(search: string): SiteRoute | null {
  try {
    const src = new URLSearchParams(search).get("src");
    if (!src) return null;
    return routeFor(src) ?? null;
  } catch {
    return null;
  }
}
