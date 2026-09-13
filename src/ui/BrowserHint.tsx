// A one-time, dismissible nudge shown only in the /app shell (never on the
// marketing page). On Chrome/Firefox iOS it's a hard-to-miss modal steering
// players to Safari or the installed PWA, where the loud-speaker cue fix
// works — those browsers run the quieter earpiece "legacy path" (see
// docs/flappytone-SPEC-ios-audio-routing.md and src/audio/reference.ts). On
// iOS Safari (not yet installed) it's a lighter top banner whose "Add to
// Home Screen" text opens a video-instruction overlay. Everywhere else it
// renders nothing.
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  isChromeIOS,
  isIOS,
  isStandalonePWA,
} from "../audio/platform.ts";

const DISMISS_KEY_MODAL = "toneflap.browserHint.modal.v1";
const DISMISS_KEY_BANNER = "toneflap.browserHint.banner.v1";

function dismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Private mode / blocked storage: the hint just shows again next time.
  }
}

type Hint =
  | { variant: "modal" }
  | { variant: "banner" };

/** The hint to show for this environment, or null if none applies. */
function hintFor(): Hint | null {
  if (isStandalonePWA()) return null; // already installed — best case
  if (isChromeIOS()) return { variant: "modal" };
  if (isIOS()) return { variant: "banner" }; // iOS Safari, not installed
  return null;
}

/** The shared "how to install" video, used by both the Chrome-iOS modal's
 * own steering copy and the Safari banner's "Add to Home Screen" overlay. */
function InstallVideoModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--sheet browser-hint-video-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Add to Home Screen</h2>
        <div className="browser-hint-video-frame">
          <video
            src="/PWA-instructions.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
        <ol className="browser-hint-steps">
          <li>Tap the Share icon in Safari's toolbar</li>
          <li>Choose "Add to Home Screen"</li>
          <li>Open FlappyTone from your home screen from now on</li>
        </ol>
      </div>
    </div>,
    document.body,
  );
}

function ChromeIOSModal({ onClose, onShowVideo }: { onClose: () => void; onShowVideo: () => void }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--sheet browser-hint-modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="modal-eyebrow">🔊 Better with Safari</p>
        <h2>This browser plays cues quietly</h2>
        <p className="browser-hint-modal-body">
          Chrome and Firefox on iOS route audio through the earpiece speaker,
          so reference tones and feedback sounds play much quieter than they
          should. For the full experience, open FlappyTone in Safari — or add
          it to your Home Screen as an app.
        </p>
        <button type="button" className="go-btn-primary browser-hint-modal-cta" onClick={onShowVideo}>
          Show me how
        </button>
        <button type="button" className="go-subtle-link" onClick={onClose}>
          Continue anyway
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function BrowserHint(): React.ReactElement | null {
  const [hint] = useState(hintFor);
  const [hidden, setHidden] = useState(() =>
    hint ? dismissed(hint.variant === "modal" ? DISMISS_KEY_MODAL : DISMISS_KEY_BANNER) : true,
  );
  const [showVideo, setShowVideo] = useState(false);

  if (!hint) return null;

  const dismiss = () => {
    remember(hint.variant === "modal" ? DISMISS_KEY_MODAL : DISMISS_KEY_BANNER);
    setHidden(true);
  };

  if (hint.variant === "modal") {
    if (hidden) return null;
    return (
      <>
        <ChromeIOSModal onClose={dismiss} onShowVideo={() => setShowVideo(true)} />
        {showVideo && <InstallVideoModal onClose={() => setShowVideo(false)} />}
      </>
    );
  }

  // Banner variant (iOS Safari, not installed).
  return (
    <>
      {!hidden && (
        <div className="browser-hint browser-hint--soft" role="note">
          <span className="browser-hint__text">
            Tip: tap Share then{" "}
            <button type="button" className="browser-hint__link" onClick={() => setShowVideo(true)}>
              “Add to Home Screen”
            </button>{" "}
            for full-screen play and the best audio.
          </span>
          <button
            type="button"
            className="browser-hint__dismiss"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            ✕
          </button>
        </div>
      )}
      {showVideo && <InstallVideoModal onClose={() => setShowVideo(false)} />}
    </>
  );
}
