// Help at the mic step (brief 27), shared by the game's "Before you start"
// screen, the landing demo and the tone visualizer:
// - `MicAllowNote`: one line before the browser's own prompt, only when the
//   mic is not already granted.
// - `InAppMicNotice`: inside an app's browser, offers the real browser before
//   the first mic request. Never blocks, never redirects on its own.
// - `MicHelpPanel`: when the mic is blocked, how to unblock it on this device.
// No audio code here: site pages load this up front (hard rule 13). Every
// button that asks for the mic again calls the caller's handler inside the
// tap (hard rule 4).
import { useEffect, useState } from "react";
import { captureGameEvent } from "../analytics/posthog.ts";
import type { MicHelpReason, MicSurface } from "../analytics/session.ts";
import { copyText } from "../lib/copyText.ts";
import { chromeIntentUrl, detectInAppBrowser, type InAppBrowser } from "../lib/inAppBrowser.ts";
import { queryMicPermission, type MicPermission } from "../lib/micPermission.ts";
import { promptLang } from "./inAppPromptCopy.ts";
import { MIC_HELP_COPY, micHelpTarget } from "./micHelpCopy.ts";

type HelpAction = "shown" | "reload" | "try_again" | "open_external" | "copy_link" | "dismissed";

function send(action: HelpAction, surface: MicSurface, reason: MicHelpReason): void {
  try {
    captureGameEvent({ type: "mic_help", action, surface, reason });
  } catch {
    // analytics never breaks the mic step
  }
}

export function browserInfo(): InAppBrowser {
  try {
    return detectInAppBrowser(navigator.userAgent);
  } catch {
    return { app: "none", platform: "other" };
  }
}

/** The mic permission state, read on mount; `null` until it answers. */
export function useMicPermission(): MicPermission | null {
  const [perm, setPerm] = useState<MicPermission | null>(null);
  useEffect(() => {
    let live = true;
    void queryMicPermission().then((p) => {
      if (live) setPerm(p);
    });
    return () => {
      live = false;
    };
  }, []);
  return perm;
}

// "Continue here" holds for the rest of the page load, on every surface.
let continuedInApp = false;

/** True when the in-app notice should show before the first mic request. */
export function shouldShowInAppNotice(info: InAppBrowser = browserInfo()): boolean {
  return info.app !== "none" && !continuedInApp;
}

function copy() {
  return MIC_HELP_COPY[promptLang()];
}

/** The "Your browser asks next" line, for a start button's side. */
export function MicAllowNote({ className }: { className?: string }): React.ReactElement | null {
  const perm = useMicPermission();
  if (perm === null || perm === "granted") return null;
  return <p className={`mic-allow-note${className ? ` ${className}` : ""}`}>{copy().allowBody}</p>;
}

function OpenButtons({
  info,
  surface,
  reason,
  primary,
}: {
  info: InAppBrowser;
  surface: MicSurface;
  reason: MicHelpReason;
  primary: boolean;
}): React.ReactElement {
  const t = copy();
  const [copied, setCopied] = useState(false);
  // Android: hand the page to Chrome. If Chrome is absent the intent does
  // nothing, and "Copy link" is right beside it as the fallback.
  const intent = info.platform === "android" ? chromeIntentUrl(window.location.href) : null;
  const onCopy = async () => {
    send("copy_link", surface, reason);
    if (await copyText(window.location.href)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <>
      {intent && (
        <a
          className={`inapp-prompt__btn${primary ? " inapp-prompt__btn--primary" : ""}`}
          href={intent}
          onClick={() => send("open_external", surface, reason)}
        >
          {t.openChrome}
        </a>
      )}
      <button
        type="button"
        className={`inapp-prompt__btn${primary && !intent ? " inapp-prompt__btn--primary" : ""}`}
        onClick={() => void onCopy()}
      >
        {copied ? t.copied : t.copyLink}
      </button>
    </>
  );
}

/**
 * Before the first mic request inside an app's browser. With `onContinue`,
 * "Continue here" is a button that asks for the mic in the same tap; without
 * it, the caller's own start button is the way on.
 */
export function InAppMicNotice({
  surface,
  onContinue,
  busy,
}: {
  surface: MicSurface;
  onContinue?: () => void;
  busy?: boolean;
}): React.ReactElement | null {
  const [info] = useState(browserInfo);
  const [show] = useState(() => shouldShowInAppNotice(info));
  useEffect(() => {
    if (show) send("shown", surface, "in-app");
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!show) return null;
  const t = copy();
  return (
    <div className="mic-help" role="note">
      <strong className="mic-help__title">{t.inAppTitle}</strong>
      <p className="mic-help__body">{t.inAppBody}</p>
      {info.platform === "ios" && <p className="mic-help__hint">{t.iosHint}</p>}
      <div className="mic-help__actions">
        <OpenButtons info={info} surface={surface} reason="in-app" primary />
        {onContinue && (
          <button
            type="button"
            className="inapp-prompt__link"
            disabled={busy}
            onClick={() => {
              continuedInApp = true;
              send("dismissed", surface, "in-app");
              onContinue();
            }}
          >
            {t.continueHere}
          </button>
        )}
      </div>
    </div>
  );
}

/** Marks the in-app notice as passed, for a surface whose own start button continues. */
export function continueInApp(): void {
  continuedInApp = true;
}

/**
 * The blocked-mic panel: the fix for the detected browser, a reload where a
 * reload is the fix, and always "Try again" (`onTryAgain` runs in the tap).
 */
export function MicHelpPanel({
  surface,
  reason,
  onTryAgain,
  onBack,
  busy,
}: {
  surface: MicSurface;
  reason: "permission-denied" | "blocked-before";
  onTryAgain: () => void;
  onBack?: () => void;
  busy?: boolean;
}): React.ReactElement {
  const [info] = useState(browserInfo);
  const target = micHelpTarget(info);
  useEffect(() => {
    send("shown", surface, reason);
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const t = copy();
  const reload = (label: string, primary: boolean) => (
    <button
      type="button"
      className={`inapp-prompt__btn${primary ? " inapp-prompt__btn--primary" : ""}`}
      onClick={() => {
        send("reload", surface, reason);
        window.location.reload();
      }}
    >
      {label}
    </button>
  );
  const tryAgain = (
    <button
      type="button"
      className="inapp-prompt__btn"
      disabled={busy}
      onClick={() => {
        send("try_again", surface, reason);
        onTryAgain();
      }}
    >
      {t.tryAgain}
    </button>
  );
  return (
    <div className="mic-help" role="alert">
      <strong className="mic-help__title">{t.blockedTitle}</strong>
      {target === "ios" && (
        <>
          <div className="mic-help__actions">{reload(t.iosReload, true)}</div>
          <p className="mic-help__body">{t.iosSteps}</p>
          <p className="mic-help__body">{t.iosStill}</p>
        </>
      )}
      {target === "android" && <p className="mic-help__body">{t.androidSteps}</p>}
      {target === "desktop" && <p className="mic-help__body">{t.desktopSteps}</p>}
      {target === "in-app" && <p className="mic-help__body">{t.inAppSteps}</p>}
      {target === "in-app" && info.platform === "ios" && <p className="mic-help__hint">{t.iosHint}</p>}
      <div className="mic-help__actions">
        {target === "in-app" && <OpenButtons info={info} surface={surface} reason={reason} primary />}
        {(target === "android" || target === "desktop") && reload(t.reload, true)}
        {tryAgain}
        {onBack && (
          <button
            type="button"
            className="inapp-prompt__link"
            onClick={() => {
              send("dismissed", surface, reason);
              onBack();
            }}
          >
            {t.back}
          </button>
        )}
      </div>
    </div>
  );
}

/** The allow-step copy, for the game's "Before you start" list. */
export function micAllowStepCopy(): { title: string; body: string } {
  const t = copy();
  return { title: t.allowTitle, body: t.allowBody };
}

/** The `in-use` line in the player's language. */
export function micInUseCopy(): string {
  return copy().inUse;
}
