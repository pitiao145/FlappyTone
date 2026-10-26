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
import { SkyLanding } from "../ui/landing/SkyLanding.tsx";
import { LegalPage } from "../ui/LegalPage.tsx";
import { termsOfServiceMd, privacyPolicyMd } from "../ui/legalContent.ts";
import { SITE_PAGES, SitePage } from "../site/pages.tsx";
import { NotFoundPage } from "../site/NotFound.tsx";
import { routeFor } from "../site/routes.ts";
import { breadcrumbJsonLd, breadcrumbsFor } from "../site/links.ts";

/**
 * Must match `LandingApp`'s tree exactly, or the prerendered markup and what
 * React paints over it differ (a visible flash). `LandingApp` renders
 * `<SkyLanding />` with no wrapper, so this does too.
 */
export function renderLanding(): string {
  return renderToStaticMarkup(<SkyLanding />);
}

/**
 * Same wrapper identity rule as `renderLanding`, kept in sync with
 * `TermsApp.tsx`/`PrivacyApp.tsx`'s own `.app > .app-main > .frame` tree.
 */
export function renderTerms(): string {
  return renderToStaticMarkup(
    <div className="app">
      <main className="app-main">
        <div className="frame">
          <LegalPage markdown={termsOfServiceMd} />
        </div>
      </main>
    </div>,
  );
}

export function renderPrivacy(): string {
  return renderToStaticMarkup(
    <div className="app">
      <main className="app-main">
        <div className="frame">
          <LegalPage markdown={privacyPolicyMd} />
        </div>
      </main>
    </div>,
  );
}

/**
 * Every `shell: "site"` route in `src/site/routes.ts`. `SitePage` holds the
 * wrappers, and `src/site/main.tsx` renders the same component on the client,
 * so the identity rule above holds by construction.
 */
export function renderSitePage(path: string): string {
  return renderToStaticMarkup(<SitePage path={path} />);
}

/** The route's schema.org objects (`SitePageDef.jsonLd`), or none. */
export function siteJsonLd(path: string): object[] {
  const route = routeFor(path);
  const def = SITE_PAGES[path];
  const own = route && def?.jsonLd ? def.jsonLd(route) : [];
  // The breadcrumb trail is generated here, once, from the same data as the
  // visible `<Breadcrumbs>`, so a page never declares its own.
  return [...own, ...breadcrumbJsonLd(breadcrumbsFor(path))];
}

/** The body of `dist/404.html`. */
export function renderNotFound(): string {
  return renderToStaticMarkup(<NotFoundPage />);
}
