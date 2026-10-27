import { ScrollBird } from "./ScrollBird.tsx";
import type { ReactNode } from "react";
import { Footer } from "./Footer.tsx";
import { Nav } from "./Nav.tsx";
import { appHref } from "./appLink.ts";
import { renderMarkdown } from "./markdown.tsx";

/**
 * The Sky site shell for a legal entry: the marketing nav and footer around
 * the document (`src/site/site.css`). Play carries `?src=<path>`.
 */
export function LegalShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div id="top" className="sky sky-site">
      <Nav linkBase="/" playHref={appHref(undefined, path)} />
      <ScrollBird />
      <main className="sky-site-main">{children}</main>
      <div className="sky-footer">
        <Footer />
      </div>
    </div>
  );
}

/**
 * Renders one parsed legal document (Terms of Service, Privacy Policy).
 *
 * Styled by `src/site/site.css` (`.legal-screen`, `.legal-body`): one
 * outlined cloud panel at a prose measure, left-aligned.
 *
 * The back link is a real anchor: this page is its own entry, reached and
 * left by a real navigation, not a screen swap inside a SPA.
 */
export function LegalPage({ markdown }: { markdown: string }) {
  return (
    <div className="screen legal-screen">
      <a className="legal-back-link" href="/">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15 5 8 12l7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        back
      </a>

      <div className="legal-body">{renderMarkdown(markdown)}</div>
    </div>
  );
}
