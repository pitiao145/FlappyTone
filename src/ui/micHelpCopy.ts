// Copy for the mic step: the "allow the microphone" line before the browser
// asks, the in-app "open in your browser" notice, and the blocked-mic help
// panel. English and Traditional Chinese (hard rule 9 — never Simplified),
// picked like the in-app prompt (`promptLang`). The privacy line must match
// docs/legal/privacy-policy.md (hard rule 12: voice audio never leaves the
// device).
//
// The blocked-mic panel picks its copy by cause (brief 32): the browser
// (`detectInAppBrowser` + the iOS browser's UA token), the error's `denial`
// (Chrome's message: dismissed / denied / by system) and how fast the
// request was refused (under 1 s = no prompt was shown, so a saved Deny or a
// system switch). See docs/reports/mic-permission-research-2026-11-04.md.
import type { MicHelpVariantValue } from "../analytics/session.ts";
import type { InAppBrowser } from "../lib/inAppBrowser.ts";
import { detectInAppBrowser } from "../lib/inAppBrowser.ts";
import type { MicFailureInfo } from "../lib/micFailure.ts";
import type { PromptLang } from "./inAppPromptCopy.ts";

/** Which fix-it steps the blocked-mic panel shows. Pure, for tests. */
export type MicHelpTarget = "ios" | "android" | "desktop" | "in-app";

export function micHelpTarget(info: InAppBrowser): MicHelpTarget {
  if (info.app !== "none") return "in-app";
  if (info.platform === "ios") return "ios";
  if (info.platform === "android") return "android";
  return "desktop";
}

/**
 * The blocked-mic panel's copy, a closed set (analytics `help_variant`).
 * `*-retry`: a prompt was shown and refused, so "Try again" comes first.
 * `*-settings`: refused with no prompt, so the settings steps come first.
 */
export type MicHelpVariant = MicHelpVariantValue;

/** A refusal faster than this showed no prompt (a saved Deny, a system switch). */
export const FAST_REFUSAL_MS = 1000;

/** iOS browsers other than Safari and Chrome (all WebKit, all with an iOS mic switch). */
const IOS_OTHER = /FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave|YaBrowser/;

/**
 * The panel's copy for this browser and failure. Pure, for tests. `failure`
 * is `null` when the panel shows before any request (the permission already
 * reads `denied`): treated as a refusal with no prompt.
 */
export function micHelpVariant(userAgent: string, failure: MicFailureInfo | null): MicHelpVariant {
  const info = detectInAppBrowser(userAgent);
  const target = micHelpTarget(info);
  if (target === "in-app") return "in-app";
  const fast = failure === null || failure.ms < FAST_REFUSAL_MS;
  const denial = failure?.denial ?? "none";
  if (target === "ios") {
    const browser = /CriOS/.test(userAgent) ? "chrome" : IOS_OTHER.test(userAgent) ? "other" : "safari";
    return `ios-${browser}-${fast ? "settings" : "retry"}`;
  }
  if (denial === "dismissed") return "dismissed";
  if (denial === "system") return target === "android" ? "android-system" : "desktop-system";
  return target === "android" ? "android-denied" : "desktop-denied";
}

/** A copy line of the blocked-mic panel. */
export type MicHelpLine =
  | "retryLead"
  | "settingsLead"
  | "dismissed"
  | "iosSafariSite"
  | "iosSafariSystem"
  | "iosChromeSystem"
  | "iosOtherSystem"
  | "androidSteps"
  | "androidSystem"
  | "desktopSteps"
  | "desktopSystem"
  | "inAppSteps";

/**
 * What the panel shows for a variant, in order: `before` lines, then the
 * buttons (`primary` first), then `after` lines. Pure, for tests.
 */
export interface MicHelpLayout {
  before: MicHelpLine[];
  primary: "try_again" | "reload" | "open";
  /** A Reload button besides the primary one. */
  reload: boolean;
  after: MicHelpLine[];
}

export function micHelpLayout(variant: MicHelpVariant): MicHelpLayout {
  switch (variant) {
    case "ios-safari-retry":
      return { before: ["retryLead"], primary: "try_again", reload: true, after: ["iosSafariSite", "iosSafariSystem"] };
    case "ios-safari-settings":
      return { before: ["settingsLead", "iosSafariSite", "iosSafariSystem"], primary: "try_again", reload: true, after: [] };
    case "ios-chrome-retry":
      return { before: ["retryLead"], primary: "try_again", reload: true, after: ["iosChromeSystem"] };
    case "ios-chrome-settings":
      return { before: ["iosChromeSystem"], primary: "try_again", reload: true, after: [] };
    case "ios-other-retry":
      return { before: ["retryLead"], primary: "try_again", reload: true, after: ["iosOtherSystem"] };
    case "ios-other-settings":
      return { before: ["iosOtherSystem"], primary: "try_again", reload: true, after: [] };
    case "dismissed":
      return { before: ["dismissed"], primary: "try_again", reload: false, after: [] };
    case "android-denied":
      return { before: ["androidSteps"], primary: "reload", reload: false, after: [] };
    case "android-system":
      return { before: ["androidSystem"], primary: "try_again", reload: true, after: [] };
    case "desktop-denied":
      return { before: ["desktopSteps"], primary: "reload", reload: false, after: [] };
    case "desktop-system":
      return { before: ["desktopSystem"], primary: "reload", reload: false, after: [] };
    case "in-app":
      return { before: ["inAppSteps"], primary: "open", reload: false, after: [] };
  }
}

export interface MicHelpCopy extends Record<MicHelpLine, string> {
  allowTitle: string;
  allowBody: string;
  inAppTitle: string;
  inAppBody: string;
  iosHint: string;
  openChrome: string;
  copyLink: string;
  copied: string;
  continueHere: string;
  blockedTitle: string;
  reload: string;
  tryAgain: string;
  back: string;
  inUse: string;
}

export const MIC_HELP_COPY: Record<PromptLang, MicHelpCopy> = {
  en: {
    allowTitle: "Allow the microphone",
    allowBody: "Your browser asks next. Tap Allow. Your voice stays on your device and is never uploaded.",
    inAppTitle: "Open FlappyTone in your browser",
    inAppBody: "Some app browsers can't use the microphone. FlappyTone works best in Chrome or Safari.",
    iosHint: "Tap ⋯ or the share icon → Open in browser",
    openChrome: "Open in Chrome",
    copyLink: "Copy link",
    copied: "Copied!",
    continueHere: "Continue here",
    blockedTitle: "The microphone is blocked",
    retryLead: "Tap Try again, then choose Allow when your browser asks.",
    settingsLead: "Your settings block the microphone. Change them, then tap Try again.",
    dismissed: "You closed the box. Tap Try again and choose Allow.",
    iosSafariSite: "Tap aA → Website Settings → Microphone → Allow.",
    iosSafariSystem: "Still blocked? Settings → Apps → Safari → Microphone → Allow.",
    iosChromeSystem: "Open iOS Settings → Apps → Chrome → turn on Microphone, then come back and tap Try again.",
    iosOtherSystem: "Open iOS Settings → Apps → your browser → turn on Microphone, then come back and tap Try again.",
    androidSteps: "Tap the icon left of the address → Permissions → Microphone → Allow, then reload.",
    androidSystem: "Your phone blocks the browser's microphone. Settings → Apps → Chrome (or your browser) → Permissions → Microphone → Allow, then tap Try again.",
    desktopSteps: "Click the icon left of the address → Microphone → Allow, then reload.",
    desktopSystem: "Your computer blocks the browser's microphone. Turn it on in your system's privacy settings (Microphone), then reload.",
    inAppSteps: "This app's browser can't use the microphone. Open FlappyTone in Chrome or Safari.",
    reload: "Reload",
    tryAgain: "Try again",
    back: "Back",
    inUse: "Another app is using the microphone. Close it, then try again.",
  },
  zh: {
    allowTitle: "允許使用麥克風",
    allowBody: "接下來瀏覽器會詢問你，請點「允許」。你的聲音只留在你的裝置上，絕不會上傳。",
    inAppTitle: "用瀏覽器開啟 FlappyTone",
    inAppBody: "部分 App 內建瀏覽器無法使用麥克風。FlappyTone 在 Chrome 或 Safari 中效果最好。",
    iosHint: "點 ⋯ 或分享圖示 → 在瀏覽器中開啟",
    openChrome: "用 Chrome 開啟",
    copyLink: "複製連結",
    copied: "已複製！",
    continueHere: "留在這裡繼續",
    blockedTitle: "麥克風被封鎖了",
    retryLead: "點「再試一次」，瀏覽器詢問時選「允許」。",
    settingsLead: "你的設定封鎖了麥克風。改好設定後，再點「再試一次」。",
    dismissed: "你關掉了詢問視窗。點「再試一次」，然後選「允許」。",
    iosSafariSite: "點 aA → 網站設定 → 麥克風 → 允許。",
    iosSafariSystem: "還是不行？設定 → App → Safari → 麥克風 → 允許。",
    iosChromeSystem: "打開 iOS 設定 → App → Chrome → 開啟「麥克風」，再回來點「再試一次」。",
    iosOtherSystem: "打開 iOS 設定 → App → 你的瀏覽器 → 開啟「麥克風」，再回來點「再試一次」。",
    androidSteps: "點網址左邊的圖示 → 權限 → 麥克風 → 允許，然後重新載入。",
    androidSystem: "你的手機封鎖了瀏覽器的麥克風。設定 → 應用程式 → Chrome（或你的瀏覽器）→ 權限 → 麥克風 → 允許，然後點「再試一次」。",
    desktopSteps: "點網址左邊的圖示 → 麥克風 → 允許，然後重新載入。",
    desktopSystem: "你的電腦封鎖了瀏覽器的麥克風。請到系統的隱私權設定（麥克風）開啟它，然後重新載入。",
    inAppSteps: "這個 App 的內建瀏覽器無法使用麥克風。請用 Chrome 或 Safari 開啟 FlappyTone。",
    reload: "重新載入",
    tryAgain: "再試一次",
    back: "返回",
    inUse: "另一個 App 正在使用麥克風。請先關閉它，再試一次。",
  },
};
