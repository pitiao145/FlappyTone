/**
 * The components for every `shell: "site"` route, keyed by path. Rendered at
 * build time by `src/dev/prerenderEntry.tsx` and in the browser by
 * `src/site/main.tsx`, inside the same wrappers (`SitePage`), so the
 * prerendered markup and React's are identical.
 *
 * Must not import `src/audio/` or `src/pitch/` (CLAUDE.md, "Three entries").
 */

import type { ReactElement } from "react";
import { ChineseTones } from "./pages/ChineseTones.tsx";

export const SITE_PAGES: Record<string, () => ReactElement> = {
  "/chinese-tones": () => <ChineseTones />,
};

/** The page for `path`, inside the `.app > .app-main > .frame` wrappers. */
export function SitePage({ path }: { path: string }) {
  const Page = SITE_PAGES[path];
  return (
    <div className="app">
      <div className="app-main">
        <div className="frame">{Page ? <Page /> : null}</div>
      </div>
    </div>
  );
}
