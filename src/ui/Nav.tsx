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

/**
 * The site nav — the same bar on the landing page and on the app's own
 * screens, so the sections are reachable from inside the game rather than only
 * from the page someone may never scroll back to.
 *
 * Items come from `brand.sections`, so adding a section adds its link.
 */
export function Nav({ variant, onNavigate, onPlay, disabled }: Props) {
  const items = brand.sections.filter((s) => s.inNav);

  // On the landing page these stay real anchors: middle-click, open-in-new-tab
  // and the browser's own scrolling all keep working, and there is nothing for
  // JavaScript to add. Inside the app there is no page under them to anchor to.
  const link = (id: string, label: string) =>
    variant === "landing" ? (
      <a key={id} href={`#${id}`}>
        {label}
      </a>
    ) : (
      <button key={id} className="nav-link" onClick={() => onNavigate(id)}>
        {label}
      </button>
    );

  return (
    <nav className={`landing-nav nav-${variant}`}>
      {variant === "landing" ? (
        <a className="wordmark" href="#top">
          {brand.name}
        </a>
      ) : (
        <button className="wordmark" onClick={() => onNavigate("top")}>
          {brand.name}
        </button>
      )}

      <div className="landing-nav-links">
        {items.map((s) => link(s.id, s.navLabel ?? s.title))}
      </div>

      {onPlay && (
        <button className="primary nav-play" disabled={disabled} onClick={onPlay}>
          Play
        </button>
      )}
    </nav>
  );
}
