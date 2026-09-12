// Platform detection for audio-route behaviour that is specific to iOS WebKit.
//
// Every browser on iOS is WebKit (Safari, Chrome-iOS, and any installed PWA),
// and they all share the process-wide audio-session routing that forces cue
// playback to the earpiece while the mic is live. Detecting "iOS" therefore
// covers exactly the surface the routing fix targets — see
// docs/flappytone-SPEC-ios-audio-routing.md.

/**
 * True on iPhone/iPad/iPod (any browser). iPadOS 13+ reports as "MacIntel", so
 * a Mac UA with a touch screen is treated as iPad — the false-positive cost is
 * only that a touch-screen Mac would also do the (harmless) release-during-cue
 * dance.
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/**
 * True for Chrome (`CriOS`) or Firefox (`FxiOS`) on iOS. Still WebKit
 * underneath, but their app wrappers pop a "microphone access" toast on every
 * fresh `getUserMedia` and degrade capture when the mic is re-acquired per cue
 * — so the release-during-cue dance is a net loss there. Callers gate it off
 * (the cue falls back to the earpiece route, like Safari/PWA before the fix).
 */
export function isChromeIOS(): boolean {
  if (!isIOS()) return false;
  return /CriOS|FxiOS/.test(navigator.userAgent);
}
