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

function IconWeb() {
  return (
    <svg className="nav-cta-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="4" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 18v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconIos() {
  return (
    <svg className="nav-cta-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.493 2.036-1.497 2.688-.903.612-1.997.912-3.088.857-.145-1.08.402-2.036 1.285-2.688.924-.672 2.088-1.152 3.3-.857zm3.097 17.25c-.753 1.74-1.667 3.48-3.007 3.48-1.14 0-1.425-.72-2.655-.72-1.23 0-1.605.75-2.685.75-1.32 0-2.475-1.32-3.228-3.06C5.94 16.62 5.1 13.2 6.72 10.68c.81-1.23 2.085-2.01 3.465-2.01 1.29 0 2.1.75 3.165.75 1.035 0 1.665-.75 3.165-.75 1.23 0 2.355.675 3.165 1.86-2.79 1.53-2.34 5.52.672 6.6z"
      />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg className="nav-cta-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
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
  const [playMenuOpen, setPlayMenuOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const playRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const playMenuId = useId();
  const navMenuId = useId();

  useEffect(() => {
    if (!playMenuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && playRef.current?.contains(e.target as Node)) return;
      setPlayMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [playMenuOpen]);

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
      {brandMark}

      <div className="landing-nav-links">{items.map((s) => desktopLink(s.id, s.navLabel ?? s.title))}</div>

      <div className="nav-actions">
        {onPlay && (
          <div className="nav-cta" ref={playRef}>
            <div className="nav-cta-shady">
              <button
                type="button"
                className="nav-cta-btn"
                disabled={disabled}
                aria-expanded={playMenuOpen}
                aria-haspopup="menu"
                aria-controls={playMenuId}
                onClick={() => {
                  setNavMenuOpen(false);
                  setPlayMenuOpen((open) => !open);
                }}
              >
                Play
                <IconChevron />
              </button>
            </div>

            {playMenuOpen && (
              <div className="nav-cta-menu" id={playMenuId} role="menu">
                <button
                  type="button"
                  className="nav-cta-item"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    setPlayMenuOpen(false);
                    onPlay();
                  }}
                >
                  <IconWeb />
                  <span>Web</span>
                </button>
                <a
                  href="#mobile"
                  className="nav-cta-item"
                  role="menuitem"
                  onClick={() => setPlayMenuOpen(false)}
                >
                  <IconIos />
                  <span>
                    iOS <em className="nav-cta-soon">coming soon</em>
                  </span>
                </a>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="nav-hamburger"
          aria-expanded={navMenuOpen}
          aria-controls={navMenuId}
          aria-label={navMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => {
            setPlayMenuOpen(false);
            setNavMenuOpen((open) => !open);
          }}
        >
          {navMenuOpen ? <IconClose /> : <IconMenu />}
        </button>
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
