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

/** Traced from `src/ui/icons/gear.svg`. */
function IconSettings() {
  return (
    <svg className="game-nav-icon" viewBox="0 0 256 256" aria-hidden="true">
      <circle
        cx="128"
        cy="128"
        r="40"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="16"
      />
      <path
        d="M41.43,178.09A99.14,99.14,0,0,1,31.36,153.8l16.78-21a81.59,81.59,0,0,1,0-9.64l-16.77-21a99.43,99.43,0,0,1,10.05-24.3l26.71-3a81,81,0,0,1,6.81-6.81l3-26.7A99.14,99.14,0,0,1,102.2,31.36l21,16.78a81.59,81.59,0,0,1,9.64,0l21-16.77a99.43,99.43,0,0,1,24.3,10.05l3,26.71a81,81,0,0,1,6.81,6.81l26.7,3a99.14,99.14,0,0,1,10.07,24.29l-16.78,21a81.59,81.59,0,0,1,0,9.64l16.77,21a99.43,99.43,0,0,1-10,24.3l-26.71,3a81,81,0,0,1-6.81,6.81l-3,26.7a99.14,99.14,0,0,1-24.29,10.07l-21-16.78a81.59,81.59,0,0,1-9.64,0l-21,16.77a99.43,99.43,0,0,1-24.3-10l-3-26.71a81,81,0,0,1-6.81-6.81Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="16"
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
  { tab: "progress", label: "Progress", icon: IconProgress },
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
