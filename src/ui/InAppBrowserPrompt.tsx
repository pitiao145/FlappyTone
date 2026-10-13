// A soft, dismissible prompt for the Instagram/TikTok/Facebook in-app
// browsers, whose localStorage is separate from the player's real browser.
// Never blocks play, never redirects on its own. Renders nothing elsewhere.
import { useEffect, useState } from "react";
import { track } from "../analytics/client.ts";
import {
  chromeIntentUrl,
  detectInAppBrowser,
  dismissInAppPrompt,
  isInAppPromptDismissed,
  type InAppBrowser,
} from "../lib/inAppBrowser.ts";
import { PROMPT_COPY, promptLang } from "./inAppPromptCopy.ts";

type Detected = InAppBrowser & { app: NonNullable<InAppBrowser["app"]> };

function detect(): Detected | null {
  try {
    const d = detectInAppBrowser(navigator.userAgent);
    return d.app ? (d as Detected) : null;
  } catch {
    return null;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older webviews: execCommand fallback.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function InAppBrowserPrompt(): React.ReactElement | null {
  const [info] = useState(detect);
  const [hidden, setHidden] = useState(() => !info || isInAppPromptDismissed());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (info && !hidden) {
      track({ type: "inapp_prompt", app: info.app, platform: info.platform, action: "shown" });
    }
    // Once per mount: a dismissal hides it, it does not re-show it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!info || hidden) return null;
  const t = PROMPT_COPY[promptLang()];
  const send = (action: "dismissed" | "open_external_clicked" | "copy_link_clicked") =>
    track({ type: "inapp_prompt", app: info.app, platform: info.platform, action });

  const dismiss = () => {
    send("dismissed");
    dismissInAppPrompt();
    setHidden(true);
  };

  const copy = async () => {
    send("copy_link_clicked");
    if (await copyText(window.location.href)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Android: hand the page to Chrome. If Chrome is absent the intent does
  // nothing, and "Copy link" is right beside it as the fallback.
  const intent = info.platform === "android" ? chromeIntentUrl(window.location.href) : null;

  return (
    <aside className="inapp-prompt" role="note" aria-label={t.title}>
      <button type="button" className="inapp-prompt__close" aria-label={t.dismissLabel} onClick={dismiss}>
        ✕
      </button>
      <strong className="inapp-prompt__title">{t.title}</strong>
      <p className="inapp-prompt__body">{t.body}</p>
      {info.platform === "ios" && <p className="inapp-prompt__hint">{t.iosHint}</p>}
      <div className="inapp-prompt__actions">
        {intent && (
          <a className="inapp-prompt__btn inapp-prompt__btn--primary" href={intent} onClick={() => send("open_external_clicked")}>
            {t.openChrome}
          </a>
        )}
        <button type="button" className="inapp-prompt__btn" onClick={copy}>
          {copied ? t.copied : t.copyLink}
        </button>
        <button type="button" className="inapp-prompt__link" onClick={dismiss}>
          {t.keepPlaying}
        </button>
      </div>
    </aside>
  );
}
