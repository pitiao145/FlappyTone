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
