import { useEffect, useState } from "react";
import { brand } from "../brand.ts";
import { LEARN_LINKS } from "../site/links.ts";
import { Pip } from "../site/Pip.tsx";

interface Props {
  /**
   * The Play button as a handler (the landing page, which logs the click
   * before it leaves for the game).
   */
  onPlay?: () => void;
  /**
   * Route-table pages (`src/site/`): section links point back into the landing
   * page (`/#how-it-works`) instead of this page, and Play is a real link
   * (`appHref`, so it carries `?src=`) rather than a handler.
   */
  linkBase?: string;
  playHref?: string;
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
 * Sticky; on the first scroll it narrows into a floating, outlined bar. Play
 * is always in the bar. Phones fold the links into a menu panel.
 *
 * Every link is a real anchor, so middle-click and open-in-new-tab keep
 * working. Section items come from `brand.sections` (`inNav`).
 */
export function Nav({ onPlay, linkBase = "", playHref }: Props) {
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

  // Phones show the short label; the bar has no room for the long one.
  const playLabel = (
    <>
      <span className="sky-label-long">{brand.heroCards.play.cta}</span>
      <span className="sky-label-short">Play</span>
    </>
  );

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
        {playHref && (
          <a className="sky-btn sky-btn-small" href={playHref}>
            {playLabel}
          </a>
        )}
        {onPlay && (
          <button
            type="button"
            className="sky-btn sky-btn-small"
            onClick={() => {
              setMenuOpen(false);
              onPlay();
            }}
          >
            {playLabel}
          </button>
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
