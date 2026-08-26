interface Props {
  /**
   * Back to the game's own menu. Omitted on the Title screen itself, where it
   * is the one control that means nothing where the player already is.
   */
  onHome?: () => void;
}

/**
 * The game's bar.
 *
 * Deliberately not `src/ui/Nav.tsx`: that one is the marketing site's, and its
 * links are anchors into sections of the page under it — none of which exist
 * here, and none of which a player mid-run wants. This is a placeholder for the
 * app-specific navigation still to be designed; it keeps the two things that
 * were reachable from the old shared bar, a way home and a way out to the
 * marketing site, and nothing else.
 *
 * It shows during an actual run too, so `.frame`'s height budget in App.css
 * reserves space for it and the canvas does not grow underneath it.
 */
export function GameNav({ onHome }: Props) {
  return (
    <nav className="landing-nav nav-app">
      <div className="nav-inner">
        <a className="nav-brand" href="/">
          <img className="nav-logo" src="/icons/icon-32.png" alt="" width={28} height={28} />
          <span className="nav-name">FLAPPYTONE</span>
        </a>

        <div className="nav-actions">
          {onHome && (
            <div className="nav-cta">
              <div className="nav-cta-shady">
                <button type="button" className="nav-cta-btn" onClick={onHome}>
                  Menu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
