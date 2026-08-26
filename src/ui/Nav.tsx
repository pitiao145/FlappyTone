import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { brand } from "../brand.ts";

interface Props {
  /**
   * The Play button. Omit it and the button is not rendered — the landing page
   * always wants it, so this is really only for the prerender entry.
   */
  onPlay?: () => void;
}

function IconMenu() {
  return (
    <svg className="nav-hamburger-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="nav-hamburger-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The marketing site's nav. Landing-page only — the game at /app is a separate
 * entry with its own bar (`src/app/GameNav.tsx`), because none of these links
 * mean anything mid-run.
 *
 * Every link is a real anchor into the page under it: middle-click,
 * open-in-new-tab and the browser's own scrolling all keep working, and there
 * is nothing for JavaScript to add. This used to carry an "app" variant that
 * turned each one into a button faking a cross-page jump; with the game on its
 * own URL there is nothing left to fake.
 *
 * Items come from `brand.sections`, so adding a section adds its link.
 */
export function Nav({ onPlay }: Props) {
  const items = brand.sections.filter((s) => s.inNav);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const navMenuId = useId();

  useEffect(() => {
    if (!navMenuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent) {
        const target = e.target as Node;
        if (navRef.current?.contains(target)) return;
        if (mobileMenuRef.current?.contains(target)) return;
      }
      setNavMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [navMenuOpen]);

  useEffect(() => {
    document.body.style.overflow = navMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navMenuOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const onChange = () => {
      if (mq.matches) setNavMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const closeNavMenu = () => setNavMenuOpen(false);

  return (
    <nav ref={navRef} className={`landing-nav nav-landing${navMenuOpen ? " nav-menu-open" : ""}`}>
      <div className="nav-inner">
        <a className="nav-brand" href="#top">
          <img className="nav-logo" src="/icons/icon-32.png" alt="" width={28} height={28} />
          <span className="nav-name">FLAPPYTONE</span>
        </a>

        <div className="landing-nav-links">
          {items.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.navLabel ?? s.title}
            </a>
          ))}
        </div>

        <div className="nav-actions">
          {onPlay && (
            <div className="nav-cta">
              <div className="nav-cta-shady">
                <button
                  type="button"
                  className="nav-cta-btn"
                  onClick={() => {
                    setNavMenuOpen(false);
                    onPlay();
                  }}
                >
                  Play
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="nav-hamburger"
            aria-expanded={navMenuOpen}
            aria-controls={navMenuId}
            aria-label={navMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setNavMenuOpen((open) => !open)}
          >
            {navMenuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {navMenuOpen &&
        createPortal(
          <div className="nav-mobile-menu" id={navMenuId} ref={mobileMenuRef}>
            {items.map((s) => (
              <div key={s.id} className="nav-shady">
                <a className="nav-shady-btn" href={`#${s.id}`} onClick={closeNavMenu}>
                  {s.navLabel ?? s.title}
                </a>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </nav>
  );
}
