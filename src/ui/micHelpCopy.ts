// Copy for the mic step: the "allow the microphone" line before the browser
// asks, the in-app "open in your browser" notice, and the blocked-mic help
// panel. English and Traditional Chinese (hard rule 9 — never Simplified),
// picked like the in-app prompt (`promptLang`). The privacy line must match
// docs/legal/privacy-policy.md (hard rule 12: voice audio never leaves the
// device).
import type { InAppBrowser } from "../lib/inAppBrowser.ts";
import type { PromptLang } from "./inAppPromptCopy.ts";

/** Which fix-it steps the blocked-mic panel shows. Pure, for tests. */
export type MicHelpTarget = "ios" | "android" | "desktop" | "in-app";

export function micHelpTarget(info: InAppBrowser): MicHelpTarget {
  if (info.app !== "none") return "in-app";
  if (info.platform === "ios") return "ios";
  if (info.platform === "android") return "android";
  return "desktop";
}

export interface MicHelpCopy {
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
  iosReload: string;
  iosSteps: string;
  iosStill: string;
  androidSteps: string;
  desktopSteps: string;
  inAppSteps: string;
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
    iosReload: "Reload and try again",
    iosSteps: "Or tap aA → Website Settings → Microphone → Allow.",
    iosStill: "Still blocked? Settings → Safari → Microphone.",
    androidSteps: "Tap the icon left of the address → Permissions → Microphone → Allow, then reload.",
    desktopSteps: "Click the icon left of the address → Microphone → Allow, then reload.",
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
    iosReload: "重新載入再試一次",
    iosSteps: "或點 aA → 網站設定 → 麥克風 → 允許。",
    iosStill: "還是不行？設定 → Safari → 麥克風。",
    androidSteps: "點網址左邊的圖示 → 權限 → 麥克風 → 允許，然後重新載入。",
    desktopSteps: "點網址左邊的圖示 → 麥克風 → 允許，然後重新載入。",
    inAppSteps: "這個 App 的內建瀏覽器無法使用麥克風。請用 Chrome 或 Safari 開啟 FlappyTone。",
    reload: "重新載入",
    tryAgain: "再試一次",
    back: "返回",
    inUse: "另一個 App 正在使用麥克風。請先關閉它，再試一次。",
  },
};
