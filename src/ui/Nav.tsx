import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { brand } from "../brand.ts";

interface Props {
  /**
   * "landing": the links are plain anchors to sections on the page under them.
   * "app": the player is on a game screen, so a link has to go back to the
   * landing page *and* scroll — the host handles that via `onNavigate`.
   */
  variant: "landing" | "app";
  /** Section id, or "top" for the wordmark. */
  onNavigate: (sectionId: string) => void;
  /**
   * Omitted inside the app: offering "Play" to someone who is already in the
   * game is the one link on this bar that means nothing where they are.
   */
  onPlay?: () => void;
  disabled?: boolean;
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
 * The site nav — the same bar on the landing page and on the app's own
 * screens, so the sections are reachable from inside the game rather than only
 * from the page someone may never scroll back to.
 *
 * Items come from `brand.sections`, so adding a section adds its link.
 */
export function Nav({ variant, onNavigate, onPlay, disabled }: Props) {
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
    if (variant !== "landing") return;
    const mq = window.matchMedia("(min-width: 901px)");
    const onChange = () => {
      if (mq.matches) setNavMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [variant]);

  const brandMark =
    variant === "landing" ? (
      <a className="nav-brand" href="#top">
        <img className="nav-logo" src="/icons/icon-32.png" alt="" width={28} height={28} />
        <span className="nav-name">FLAPPYTONE</span>
      </a>
    ) : (
      <button className="nav-brand" onClick={() => onNavigate("top")}>
        <img className="nav-logo" src="/icons/icon-32.png" alt="" width={28} height={28} />
        <span className="nav-name">FLAPPYTONE</span>
      </button>
    );

  const closeNavMenu = () => setNavMenuOpen(false);

  // On the landing page these stay real anchors: middle-click, open-in-new-tab
  // and the browser's own scrolling all keep working, and there is nothing for
  // JavaScript to add. Inside the app there is no page under them to anchor to.
  const desktopLink = (id: string, label: string) =>
    variant === "landing" ? (
      <a key={id} href={`#${id}`}>
        {label}
      </a>
    ) : (
      <button key={id} className="nav-link" onClick={() => onNavigate(id)}>
        {label}
      </button>
    );

  const mobileLink = (id: string, label: string) =>
    variant === "landing" ? (
      <a key={id} className="nav-shady-btn" href={`#${id}`} onClick={closeNavMenu}>
        {label}
      </a>
    ) : (
      <button
        key={id}
        type="button"
        className="nav-shady-btn"
        onClick={() => {
          closeNavMenu();
          onNavigate(id);
        }}
      >
        {label}
      </button>
    );

  return (
    <nav ref={navRef} className={`landing-nav nav-${variant}${navMenuOpen ? " nav-menu-open" : ""}`}>
      <div className="nav-inner">
        {brandMark}

        <div className="landing-nav-links">{items.map((s) => desktopLink(s.id, s.navLabel ?? s.title))}</div>

        <div className="nav-actions">
          {onPlay && (
            <div className="nav-cta">
              <div className="nav-cta-shady">
                <button
                  type="button"
                  className="nav-cta-btn"
                  disabled={disabled}
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
                {mobileLink(s.id, s.navLabel ?? s.title)}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </nav>
  );
}
