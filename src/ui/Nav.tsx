import { useEffect, useState, type ReactNode } from "react";
import { brand } from "../brand.ts";
import { LEARN_LINKS } from "../site/links.ts";
import { Pip } from "../site/Pip.tsx";
import { appHref } from "./appLink.ts";
import { useSignedIn } from "./signedIn.ts";

interface Props {
  /**
   * The landing page: "Try it free" opens its demo overlay (the host logs the
   * click and loads the overlay).
   */
  onTry?: () => void;
  /**
   * Other pages: the "Try it free" control itself, e.g. a site page's
   * `DemoTrigger`, so the nav opens the overlay that page already uses.
   */
  trySlot?: ReactNode;
  /**
   * Route-table pages (`src/site/`): section links point back into the landing
   * page (`/#how-it-works`) instead of this page.
   */
  linkBase?: string;
  /**
   * Where "Play" goes for a signed-in player (`appHref`, so it carries
   * `?src=`). Signed-in players get Play instead of "Try it free".
   */
  playHref?: string;
  /** With `playHref`: called on the link's click (analytics), before it leaves. */
  onPlayLinkClick?: () => void;
}

/** True as soon as the page has scrolled at all: the bar floats at once. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 4);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

/**
 * The marketing site's one nav (Sky, `src/site/site.css`): the landing page
 * and every site page. The game at /app is a separate entry with its own bar
 * (`src/app/GameNav.tsx`), because none of these links mean anything mid-run.
 *
 * Sticky; on the first scroll it narrows into a floating, outlined bar. Its
 * button is "Try it free" (the no-signup demo overlay), or "Play" (/app) when
 * the browser already holds a signed-in session (`signedIn.ts`, no Supabase
 * load). Pages that pass neither `onTry` nor `trySlot` show no button.
 * Phones fold the links into a menu panel.
 *
 * Every link is a real anchor, so middle-click and open-in-new-tab keep
 * working. Section items come from `brand.sections` (`inNav`).
 */
export function Nav({ onTry, trySlot, linkBase = "", playHref, onPlayLinkClick }: Props) {
  const items = brand.sections.filter((s) => s.inNav);
  const compact = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const signedIn = useSignedIn();
  const hasButton = !!onTry || trySlot !== undefined;

  return (
    <div className={compact ? "sky-nav-bar is-compact" : "sky-nav-bar"}>
      <nav className="sky-nav" aria-label="Main">
        <a className="sky-brand" href={linkBase ? linkBase : "#top"}>
          <Pip size={38} tilt={-8} /> FlappyTone
        </a>
        <ul className="sky-nav-links">
          {items.map((s) => (
            <li key={s.id}>
              <a href={`${linkBase}#${s.id}`}>{s.navLabel ?? s.title}</a>
            </li>
          ))}
          <li>
            <details className="sky-learn">
              <summary>Learn and tools</summary>
              <ul>
                {LEARN_LINKS.map((l) => (
                  <li key={l.href}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        </ul>
        {hasButton && signedIn ? (
          <a className="sky-btn sky-btn-small" href={playHref ?? appHref()} onClick={onPlayLinkClick}>
            Play
          </a>
        ) : onTry ? (
          <button
            type="button"
            className="sky-btn sky-btn-small"
            aria-haspopup="dialog"
            onClick={() => {
              setMenuOpen(false);
              onTry();
            }}
          >
            {brand.navTry}
          </button>
        ) : (
          trySlot
        )}
        <button
          type="button"
          className="sky-burger"
          aria-expanded={menuOpen}
          aria-controls="sky-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={menuOpen ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
          </svg>
        </button>
      </nav>
      {menuOpen && (
        <div id="sky-menu" className="sky-menu">
          <ul>
            {items.map((s) => (
              <li key={s.id}>
                <a href={`${linkBase}#${s.id}`} onClick={closeMenu}>
                  {s.navLabel ?? s.title}
                </a>
              </li>
            ))}
          </ul>
          <h3>Learn and tools</h3>
          <ul>
            {LEARN_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
