import { renderMarkdown } from "./markdown.tsx";

/**
 * Renders one parsed legal document (Terms of Service, Privacy Policy).
 *
 * Reuses the game's typographic classes (`Terms.tsx`'s look) rather than
 * inventing a new style: `.howto-section`-style left-aligned body text,
 * `.terms-bullets` for lists, `App.css`'s `.screen h1/h2/h3` for headings.
 * `.legal-screen` (see `App.css`) widens the frame's measure past the
 * 640px menu-shell cap and sets left alignment for the whole body — a
 * long-form document reads as prose, not a centered menu.
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
