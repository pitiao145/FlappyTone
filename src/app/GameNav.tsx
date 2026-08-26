import { SITE_HREF } from "../ui/appLink.ts";

export type NavTab = "play" | "visualiser" | "progress" | "profile" | "settings";

interface Props {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
}

function IconPlay() {
  return (
    <svg className="game-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5l12 7-12 7V5z" fill="currentColor" />
    </svg>
  );
}

function IconVisualiser() {
  return (
    <svg className="game-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 13h3l2.5-7 4 15 3-11 2 3h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconProgress() {
  return (
    <svg className="game-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 17l5-6 4 3 6-8M14 6h5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg className="game-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4.5 20c1.4-3.8 4.4-5.7 7.5-5.7s6.1 1.9 7.5 5.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="game-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 3v2.5M12 18.5V21M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M3 12h2.5M18.5 12H21M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ITEMS: {
  tab: NavTab;
  label: string;
  icon: () => React.JSX.Element;
  soon?: boolean;
}[] = [
  { tab: "play", label: "Play", icon: IconPlay },
  { tab: "visualiser", label: "Visualiser", icon: IconVisualiser },
  { tab: "progress", label: "Progress", icon: IconProgress, soon: true },
  { tab: "profile", label: "Profile", icon: IconProfile },
  { tab: "settings", label: "Settings", icon: IconSettings },
];

/**
 * The game's nav — a sidebar on desktop, a bottom bar on mobile, so /app
 * reads as a game shell rather than a page with a header. Always visible,
 * including mid-run and during calibration (a deliberate choice, unlike the
 * old bar it replaces, which only offered a way home).
 *
 * `active` is derived by the caller from its own screen state (several
 * screens — calibration, an in-progress run, game-over — all map back to the
 * "play" tab, since none of them are reachable from any other tab).
 */
export function GameNav({ active, onNavigate }: Props) {
  return (
    <nav className="game-nav">
      <a className="game-nav-brand" href={SITE_HREF}>
        <img className="nav-logo" src="/icons/icon-32.png" alt="" width={28} height={28} />
        <span className="nav-name">FlappyTone</span>
      </a>

      <div className="game-nav-items">
        {ITEMS.map(({ tab, label, icon: Icon, soon }) => (
          <button
            key={tab}
            type="button"
            className={`game-nav-item${active === tab ? " game-nav-item-active" : ""}${soon ? " game-nav-item-disabled" : ""}`}
            aria-current={active === tab ? "page" : undefined}
            disabled={soon}
            onClick={() => onNavigate(tab)}
          >
            <Icon />
            <span className="game-nav-label">{label}</span>
            {soon && <span className="game-nav-badge">Soon</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
