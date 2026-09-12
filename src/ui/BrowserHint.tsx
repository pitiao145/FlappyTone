// A one-time, dismissible nudge shown only in the /app shell (never on the
// marketing page). On Chrome/Firefox iOS it steers players to Safari or the
// installed PWA, where the loud-speaker cue fix works — those browsers run the
// quieter earpiece "legacy path" (see docs/flappytone-SPEC-ios-audio-routing.md
// and src/audio/reference.ts). On iOS Safari (not yet installed) it gives a
// lighter "Add to Home Screen" nudge. Everywhere else it renders nothing.
import { useState } from "react";
import {
  isChromeIOS,
  isIOS,
  isStandalonePWA,
} from "../audio/platform.ts";

const DISMISS_KEY = "toneflap.browserHint.v1";

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Private mode / blocked storage: the hint just shows again next time.
  }
}

type Hint = { tone: "warn" | "soft"; text: string };

/** The hint to show for this environment, or null if none applies. */
function hintFor(): Hint | null {
  if (isStandalonePWA()) return null; // already installed — best case
  if (isChromeIOS()) {
    return {
      tone: "warn",
      text: "Audio is quieter in this browser. For louder cues, open FlappyTone in Safari — or tap Share then “Add to Home Screen”.",
    };
  }
  if (isIOS()) {
    // iOS Safari, not installed — a gentle install nudge.
    return {
      tone: "soft",
      text: "Tip: tap Share then “Add to Home Screen” for full-screen play and the best audio.",
    };
  }
  return null;
}

export function BrowserHint(): React.ReactElement | null {
  const [hint] = useState(hintFor);
  const [hidden, setHidden] = useState(dismissed);
  if (!hint || hidden) return null;
  return (
    <div className={`browser-hint browser-hint--${hint.tone}`} role="note">
      <span className="browser-hint__text">{hint.text}</span>
      <button
        type="button"
        className="browser-hint__dismiss"
        aria-label="Dismiss"
        onClick={() => {
          remember();
          setHidden(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
