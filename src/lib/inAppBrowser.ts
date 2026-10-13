// Detects the Instagram / TikTok / Facebook in-app browsers from the
// user-agent. Pure: no `window`, no storage, so it tests offline. Those
// browsers keep their own localStorage, so a player who later returns via
// Safari/Chrome starts from zero and PostHog splits them in two — the reason
// the Play home shows a soft "open in your browser" prompt. The game itself
// works there (mic included), so nothing here blocks or redirects.

export type InAppApp = "instagram" | "tiktok" | "facebook";
export type InAppPlatform = "ios" | "android" | "other";

export interface InAppBrowser {
  app: InAppApp | null;
  platform: InAppPlatform;
}

export function detectInAppBrowser(userAgent: string): InAppBrowser {
  const ua = userAgent ?? "";
  const platform: InAppPlatform = /iPhone|iPad|iPod/i.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : "other";
  // Instagram first: its Android UA can sit next to Facebook-family tokens.
  let app: InAppApp | null = null;
  if (/Instagram/i.test(ua)) app = "instagram";
  else if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) app = "tiktok";
  else if (/FBAN|FBAV/.test(ua)) app = "facebook";
  return { app, platform };
}

/**
 * The Android Chrome intent for a page URL. Path, query (so `utm_*` survives)
 * are kept; the fragment is dropped because `#Intent;…` owns it.
 */
export function chromeIntentUrl(href: string): string | null {
  try {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return null;
  }
}

// ---- dismissal memory ------------------------------------------------------

export const INAPP_DISMISS_KEY = "toneflap.inapp-prompt.v1";
export const INAPP_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

// Fallback when localStorage is unavailable: lasts the page session.
let memoryDismissedAt: number | null = null;

function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** True while a dismissal made less than 7 days ago is still in force. */
export function isInAppPromptDismissed(
  now: number = Date.now(),
  store: StorageLike | null = storage(),
): boolean {
  let at = memoryDismissedAt;
  try {
    const raw = store?.getItem(INAPP_DISMISS_KEY);
    const n = raw == null ? NaN : Number(raw);
    if (Number.isFinite(n)) at = Math.max(at ?? 0, n);
  } catch {
    // storage blocked: memory only
  }
  return at != null && now - at < INAPP_DISMISS_MS && now >= at;
}

export function dismissInAppPrompt(
  now: number = Date.now(),
  store: StorageLike | null = storage(),
): void {
  memoryDismissedAt = now;
  try {
    store?.setItem(INAPP_DISMISS_KEY, String(now));
  } catch {
    // memory fallback already set
  }
}

/** Test hook: forget the in-memory fallback. */
export function resetInAppPromptMemory(): void {
  memoryDismissedAt = null;
}
