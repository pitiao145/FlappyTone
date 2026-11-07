// Detects which app's in-app browser (if any) a page runs in, from the
// user-agent. Pure: no `window`, no storage, so it tests offline against real
// UA strings (`inAppBrowser.fixtures.ts`). Those browsers keep their own
// localStorage, so a player who later returns via Safari/Chrome starts from
// zero and PostHog splits them in two — the reason the Play home shows a soft
// "open in your browser" prompt. The mic does not always work there: some
// (LINE on Android, seen 2026-11) deny it at once with no prompt, so the mic
// step also offers to open the page in the real browser. Nothing here blocks
// or redirects.

/** A closed set: every value is safe to send to analytics as-is. */
export type InAppApp =
  | "instagram"
  | "facebook"
  | "threads"
  | "line"
  | "wechat"
  | "tiktok"
  | "linkedin"
  | "snapchat"
  | "pinterest"
  | "reddit"
  | "x"
  | "kakaotalk"
  | "google-app"
  | "webview-android"
  | "webview-ios"
  | "none";
export type InAppPlatform = "ios" | "android" | "other";

export interface InAppBrowser {
  app: InAppApp;
  platform: InAppPlatform;
}

/**
 * Named apps first, in order: Threads ("Barcelona") and Instagram before
 * Facebook, whose tokens can sit beside theirs. The generic webviews last.
 */
const APP_RULES: ReadonlyArray<readonly [InAppApp, RegExp]> = [
  ["threads", /Barcelona/],
  ["instagram", /Instagram/i],
  ["facebook", /FBAN|FBAV|FB_IAB|FB4A/], // Messenger included (FBAN/MessengerForiOS, FB_IAB/MESSENGER)
  ["line", /\bLine\//],
  ["wechat", /MicroMessenger/i],
  ["tiktok", /musical_ly|BytedanceWebview|TikTok|trill_/i],
  ["linkedin", /LinkedInApp/i],
  ["snapchat", /Snapchat/i],
  ["pinterest", /Pinterest/i],
  ["reddit", /Reddit/i],
  ["x", /Twitter/i],
  ["kakaotalk", /KAKAOTALK/i],
  ["google-app", /\bGSA\//],
];

/** iOS browsers that, like a webview, leave `Safari/` out of their UA. */
const IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave|YaBrowser/;

export function detectInAppBrowser(userAgent: string): InAppBrowser {
  const ua = userAgent ?? "";
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const platform: InAppPlatform = ios ? "ios" : /Android/i.test(ua) ? "android" : "other";
  for (const [app, re] of APP_RULES) if (re.test(ua)) return { app, platform };
  if (platform === "android" && /; wv\)/.test(ua)) return { app: "webview-android", platform };
  if (ios && !/Safari\//.test(ua) && !IOS_BROWSERS.test(ua)) return { app: "webview-ios", platform };
  return { app: "none", platform };
}

/** The apps that get the Play home's open-in-browser prompt (brief 03). */
export const PROMPT_APPS: ReadonlySet<InAppApp> = new Set(["instagram", "tiktok", "facebook"]);

/**
 * In-app browsers where "Continue with Google" is hidden (brief 30). Google
 * refuses OAuth inside an embedded webview (`403 disallowed_useragent`, its
 * secure-browser policy since 2021), so the button would only lead to an
 * error page. Not listed, so the button shows: `none`, `reddit`, `x` and
 * `google-app` (they open links in SFSafariViewController / Custom Tabs, or
 * are Google's own app). Discord is not detected at all: it opens links in
 * SFSafariViewController / Custom Tabs, and Google works there. Pinterest is
 * not in the brief's lists; it is a plain webview, so it is hidden too.
 * Change this list if a real player hits the error.
 */
export const GOOGLE_BLOCKED_APPS: ReadonlySet<InAppApp> = new Set([
  "instagram",
  "threads",
  "facebook",
  "tiktok",
  "linkedin",
  "line",
  "wechat",
  "snapchat",
  "kakaotalk",
  "pinterest",
  "webview-android",
  "webview-ios",
]);

/** Whether the "Continue with Google" button may show for this user-agent. */
export function canUseGoogleSignIn(userAgent: string): boolean {
  return !GOOGLE_BLOCKED_APPS.has(detectInAppBrowser(userAgent).app);
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
