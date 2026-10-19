/**
 * The components for every `shell: "site"` route, keyed by path. Rendered at
 * build time by `src/dev/prerenderEntry.tsx` and in the browser by
 * `src/site/main.tsx`, inside the same wrappers (`SitePage`), so the
 * prerendered markup and React's are identical.
 *
 * A page may also export structured data (`jsonLd`): schema.org objects that
 * `src/dev/prerender.ts` writes into that route's `<head>` as
 * `application/ld+json`. Built from the same data the page renders (e.g. the
 * FAQ list), so the two cannot drift.
 *
 * Must not import `src/audio/` or `src/pitch/` (CLAUDE.md, "Three entries").
 */

import type { ReactElement } from "react";
import type { SiteRoute } from "./routes.ts";
import { Nav } from "../ui/Nav.tsx";
import { Footer } from "../ui/Footer.tsx";
import { appHref } from "../ui/appLink.ts";
import { ChineseTones, chineseTonesJsonLd } from "./pages/ChineseTones.tsx";
import { ToneMarks, toneMarksJsonLd } from "./pages/ToneMarks.tsx";
import { ToneVisualizer, toneVisualizerJsonLd } from "./pages/ToneVisualizer.tsx";

export interface SitePageDef {
  Page: () => ReactElement;
  /** schema.org objects for this route's `<head>`. */
  jsonLd?: (route: SiteRoute) => object[];
}

export const SITE_PAGES: Record<string, SitePageDef> = {
  "/chinese-tones": { Page: ChineseTones, jsonLd: chineseTonesJsonLd },
  "/tools/tone-marks": { Page: ToneMarks, jsonLd: toneMarksJsonLd },
  "/tools/tone-visualizer": { Page: ToneVisualizer, jsonLd: toneVisualizerJsonLd },
};

/** The page for `path`, inside the `.app > .app-main > .frame` wrappers. */
export function SitePage({ path }: { path: string }) {
  const Page = SITE_PAGES[path]?.Page;
  return (
    <div className="app">
      <div className="app-main">
        <div className="frame">
          {/* The landing page's own bar and footer, so a visitor from search
              can reach the rest of the site. Links point back into `/`. */}
          <Nav linkBase="/" playHref={appHref(undefined, path)} />
          {Page ? <Page /> : null}
          <Footer />
        </div>
      </div>
    </div>
  );
}
