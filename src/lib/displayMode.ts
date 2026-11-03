// Whether the page runs as an installed PWA (opened from the Home Screen) or
// in a browser tab. iOS has no install event, so a launch in standalone mode
// is the only install signal there; `navigator.standalone` is the iOS flag and
// the `display-mode` media query covers everything else. An iOS Home Screen
// launch has no `Safari/` token in its user-agent, so `detectInAppBrowser`
// reads it as `webview-ios`: check this first when that matters.

/** A closed set: every value is safe to send to analytics as-is. */
export type DisplayMode = "standalone" | "browser";

/** Pure, for tests: the two platform signals in, the mode out. */
export function displayModeFrom(iosStandalone: boolean | undefined, standaloneMedia: boolean): DisplayMode {
  return iosStandalone || standaloneMedia ? "standalone" : "browser";
}

/** The mode of the current page. Never throws; `browser` outside a browser. */
export function currentDisplayMode(): DisplayMode {
  try {
    if (typeof navigator === "undefined") return "browser";
    const iosStandalone = (navigator as { standalone?: boolean }).standalone;
    const media = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
    return displayModeFrom(iosStandalone, media);
  } catch {
    return "browser";
  }
}
