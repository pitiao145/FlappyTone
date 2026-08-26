/**
 * The build-time render of the landing page. Run in Node by
 * `src/dev/prerender.ts`, never in the browser.
 *
 * It renders the *real* `Landing` inside the *real* wrappers, so the HTML a
 * crawler is served and the HTML React paints a moment later are the same
 * markup with the same class names against the same `App.css`. That identity
 * is the whole point: an earlier version emitted its own hand-styled block and
 * the swap read as a flash of a different document.
 *
 * The buttons are inert until React takes over — a click in that window does
 * nothing, which is strictly better than the empty page it replaced.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "../ui/Landing.tsx";

const noop = () => {};

/**
 * The wrappers are copied from `LandingApp`'s own tree, not guessed:
 * `.landing`'s layout hangs off `.frame:has(.landing)`, so rendering `Landing`
 * bare would lay out at the game's 420px width. `.app-main` between the two
 * used to be missing here — a real mismatch between the prerendered markup and
 * what React painted over it. Keep this identical to `LandingApp`'s wrappers.
 */
export function renderLanding(): string {
  return renderToStaticMarkup(
    <div className="app">
      <div className="app-main">
        <div className="frame">
          <Landing onPlay={noop} onVisualiser={noop} onTerms={noop} />
        </div>
      </div>
    </div>,
  );
}
