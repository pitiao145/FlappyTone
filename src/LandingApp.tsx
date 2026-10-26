import { lazy, Suspense, useEffect } from "react";
import { initAnalytics } from "./analytics/client";
import { initPostHog } from "./analytics/posthog.ts";
import { loadShareData } from "./game/settings";
import { Landing } from "./ui/Landing";
import { goToApp, setAppLinkSource } from "./ui/appLink.ts";
import { routeFor } from "./site/routes.ts";
import { pageViewProps } from "./site/pageAnalytics.ts";
import "./App.css";

/**
 * Hallmark design trials, dev only: `/?lp=hum` or `/?lp=sky` swaps the whole
 * page. The `import.meta.env.DEV` guard keeps both out of `dist/`.
 */
const TRIALS = import.meta.env.DEV
  ? {
      hum: lazy(() => import("./ui/lp-trials/HumLanding.tsx").then((m) => ({ default: m.HumLanding }))),
      sky: lazy(() => import("./ui/lp-trials/SkyLanding.tsx").then((m) => ({ default: m.SkyLanding }))),
    }
  : null;

/**
 * The marketing site — the whole of what `/` serves.
 *
 * It has one screen and no game in it. Everything a player does that needs a
 * microphone lives on the other entry (`/app`, `src/app/GameApp.tsx`), which is
 * what lets this page stay free of `src/audio/` and `src/game/`'s runtime and
 * be prerendered into `index.html` for crawlers.
 *
 * Terms and Privacy used to be a screen swapped in here; they are now their
 * own prerendered entries (`terms-of-service.html`, `privacy-policy.html`,
 * see `src/legal/`) so each is a real, indexable URL rather than JS-only
 * content behind a click — the same reasoning that split `/app` off this
 * entry in the first place.
 */
export default function LandingApp() {
  /**
   * Traffic analytics for the marketing site. The gameplay pipeline starts
   * separately on `/app` — both call `initPostHog`, both are idempotent, and
   * both read the same consent flag.
   *
   * Note `landed` is *not* fired here. It means "opened the game" and belongs
   * to the game entry; a visit to this page is a `$pageview`.
   */
  useEffect(() => {
    initAnalytics();
    // `/` is a route-table page: its `$pageview` carries the page metadata and
    // its CTAs carry `?src=/` (see src/site/routes.ts).
    const route = routeFor("/");
    if (route) setAppLinkSource(route.path);
    initPostHog(loadShareData(), route ? pageViewProps(route) : undefined);
  }, []);

  const trialKey = TRIALS && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lp") : null;
  const Trial = TRIALS && (trialKey === "hum" || trialKey === "sky") ? TRIALS[trialKey] : null;
  if (Trial) {
    return (
      <Suspense fallback={null}>
        <Trial />
      </Suspense>
    );
  }

  return (
    <div className="app">
      <main className="app-main">
        <div className="frame">
          <Landing onPlay={() => goToApp()} onVisualiser={() => goToApp("visualiser")} />
        </div>
      </main>
    </div>
  );
}
