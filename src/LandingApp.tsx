import { useEffect } from "react";
import { initAnalytics } from "./analytics/client";
import { SkyLanding } from "./ui/landing/SkyLanding.tsx";
import { setAppLinkSource } from "./ui/appLink.ts";
import { routeFor } from "./site/routes.ts";
import { pageViewProps } from "./site/pageAnalytics.ts";
import "./App.css";

/**
 * The marketing site — the whole of what `/` serves.
 *
 * The game lives on the other entry (`/app`, `src/app/GameApp.tsx`). The one
 * piece of mic code here is Try it now's mini run, which loads only on a tap
 * (ARCHITECTURE.md, "Three entries", rule 1), so the page itself stays free
 * of `src/audio/` and is prerendered into `index.html` for crawlers
 * (`src/dev/prerenderEntry.tsx` renders the same `<SkyLanding />`, with no
 * wrapper, so the crawler markup matches what React paints).
 *
 * Terms and Privacy are their own prerendered entries (`src/legal/`).
 */
export default function LandingApp() {
  /**
   * Traffic analytics for the marketing site. `/app` starts its own client
   * (`src/app/main.tsx`); both read the same consent flag.
   *
   * Note `landed` is *not* fired here. It means "opened the game" and belongs
   * to the game entry; a visit to this page is a `$pageview`.
   */
  useEffect(() => {
    // `/` is a route-table page: its `$pageview` carries the page metadata and
    // its CTAs carry `?src=/` (see src/site/routes.ts). The props go in the
    // first and only start call; a later `initPostHog` would be ignored.
    const route = routeFor("/");
    if (route) setAppLinkSource(route.path);
    initAnalytics(route ? pageViewProps(route) : undefined);
  }, []);

  return <SkyLanding />;
}
