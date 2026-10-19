import { appHref, type AppIntent } from "../ui/appLink.ts";

/**
 * Pip, the game's bird, as inline SVG: the same shapes and colours as
 * `public/Bird-*-no-halo.png`, but in the prerendered HTML and a few hundred
 * bytes instead of a 70 kB image. `tilt` rotates it (negative = climbing).
 */
export function Pip({
  size = 64,
  tilt = 0,
  className,
}: {
  size?: number;
  tilt?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `pip ${className}` : "pip"}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      <circle cx="44" cy="50" r="36" fill="#338773" />
      <path d="M22 56 h44 a22 22 0 0 1 -44 0 z" fill="#61a392" />
      <circle cx="54" cy="34" r="8.5" fill="#f3efe2" />
      <circle cx="56" cy="34" r="4" fill="#241d15" />
      <path d="M78 44 L98 50 L78 56 z" fill="#c98a3c" />
    </svg>
  );
}

/**
 * The closing call to action on every route-table content page: a jade panel
 * where Pip flies a tone-shaped path, and one sticker button into the game.
 * The href is built with an explicit `src` so the prerendered link already
 * carries `?src=<path>`.
 */
export function PipCta({
  path,
  title,
  body,
  secondary,
  intent,
}: {
  path: string;
  /** Where the game should land (`?intent=`); the default is Play. */
  intent?: AppIntent;
  title: string;
  body: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <>
      <aside className="pip-cta">
        <svg
          className="pip-cta-flight"
          viewBox="0 0 320 120"
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          <path d="M0 60 C 40 60, 60 96, 110 96 S 190 70, 230 34 S 290 20, 320 22" />
        </svg>
        <Pip size={84} tilt={-18} className="pip-cta-bird" />
        <div className="pip-cta-text">
          <h2>{title}</h2>
          <p>{body}</p>
          <div className="pip-cta-actions">
            <a className="sticker-button" href={appHref(intent, path)}>
              Play FlappyTone free
            </a>
          </div>
        </div>
      </aside>
      {secondary && (
        <a className="read-next" href={secondary.href}>
          <span className="read-next-label">Read next</span>
          <span className="read-next-title">
            {secondary.label} <span aria-hidden="true">→</span>
          </span>
        </a>
      )}
    </>
  );
}
