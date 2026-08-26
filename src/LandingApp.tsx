import { useEffect, useState } from "react";
import { initAnalytics } from "./analytics/client";
import { initPostHog } from "./analytics/posthog.ts";
import { loadShareData } from "./game/settings";
import { Landing } from "./ui/Landing";
import { Terms } from "./ui/Terms";
import { goToApp } from "./ui/appLink.ts";
import "./App.css";

/**
 * The marketing site — the whole of what `/` serves.
 *
 * It has two screens and no game in it. Everything a player does that needs a
 * microphone lives on the other entry (`/app`, `src/app/GameApp.tsx`), which is
 * what lets this page stay free of `src/audio/` and `src/game/`'s runtime and
 * be prerendered into `index.html` for crawlers.
 *
 * Terms stays a screen rather than a third entry: it is one static page reached
 * from the footer, and giving it its own URL would buy nothing it does not
 * already have.
 */
export default function LandingApp() {
  const [screen, setScreen] = useState<"landing" | "terms">("landing");

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
    initPostHog(loadShareData());
  }, []);

  // Terms swaps in under whatever scroll offset the landing page was left at,
  // which on a long page means opening it halfway down a short one. "auto"
  // rather than smooth: this is a page change, not a jump within a page.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen]);

  return (
    <div className="app">
      <div className="app-main">
        <div className="frame">
          {screen === "landing" && (
            <Landing
              onPlay={() => goToApp()}
              onVisualiser={() => goToApp("visualiser")}
              onTerms={() => setScreen("terms")}
            />
          )}

          {screen === "terms" && <Terms onBack={() => setScreen("landing")} />}
        </div>
      </div>
    </div>
  );
}
