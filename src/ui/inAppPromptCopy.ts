// Copy for the in-app-browser prompt. The app has no i18n layer yet (every
// other screen is English), so this is the one place that holds both
// languages: English, and Traditional Chinese (hard rule 9 — never Simplified).
export type PromptLang = "en" | "zh";

export function promptLang(nav: { language?: string } | undefined = typeof navigator === "undefined" ? undefined : navigator): PromptLang {
  return /^zh/i.test(nav?.language ?? "") ? "zh" : "en";
}

export interface PromptCopy {
  title: string;
  body: string;
  iosHint: string;
  openChrome: string;
  copyLink: string;
  copied: string;
  keepPlaying: string;
  dismissLabel: string;
}

export const PROMPT_COPY: Record<PromptLang, PromptCopy> = {
  en: {
    title: "Save your progress",
    body: "You're in an in-app browser. Open FlappyTone in your browser so your runs and streaks are saved. For a better experience, use your real browser.",
    iosHint: "Tap ⋯ (top right) → Open in browser",
    openChrome: "Open in Chrome",
    copyLink: "Copy link",
    copied: "Copied!",
    keepPlaying: "Keep playing here",
    dismissLabel: "Dismiss",
  },
  zh: {
    title: "保存你的進度",
    body: "你正在 App 內建瀏覽器。請用瀏覽器開啟 FlappyTone，進度才會保存。使用瀏覽器體驗更佳。",
    iosHint: "點右上角 ⋯ → 在瀏覽器中開啟",
    openChrome: "用 Chrome 開啟",
    copyLink: "複製連結",
    copied: "已複製！",
    keepPlaying: "留在這裡繼續玩",
    dismissLabel: "關閉",
  },
};
