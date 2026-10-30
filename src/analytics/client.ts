/**
 * The gameplay analytics call sites' entry point.
 *
 * This used to own a localStorage queue, a debounced flush, `sendBeacon`, and
 * a retry-on-load drain — the durability design that made the old Blob-backed
 * pipeline lossless across an offline period or a force-quit. That design
 * moved to PostHog (`./posthog.ts`), which does not offer the same
 * across-reload guarantee; the trade was accepted deliberately (see the
 * migration design doc) in exchange for not maintaining this machinery.
 * `initAnalytics`/`track`/`trackCalibration`/`setSharingEnabled` keep their
 * names and shapes so every call site — `App.tsx`, `Game.tsx`,
 * `Calibration.tsx`, `src/audio/session.ts` — needed no changes.
 *
 * Consent still gates the gameplay tier: `loadShareData()` is read by
 * `initAnalytics` and threaded through to `initPostHog`. Global-tier events
 * (screen views, mode selection, the leaderboard/signup funnel) are not
 * gated by this at all — see `session.ts`'s `eventTier` and `posthog.ts`'s
 * Play analytics rule 3 in CLAUDE.md.
 */

import { loadShareData, type CalibrationSettings } from "../game/settings.ts";
import type { SpeechStyle } from "../game/words.ts";
import { deviceBucket, type AnalyticsEvent, type SeoPageViewProps } from "./session.ts";
import {
  captureGameEvent,
  initPostHog,
  setCalibrationProperties,
  setDeviceProperty,
  setInAppBrowserProperty,
  setFirstSeoTouch,
  setPostHogConsent,
  setSpeechStyleProperty,
} from "./posthog.ts";

let initialized = false;

/**
 * Starts the PostHog client. Call once, from the entry module before the first
 * render: an event tracked before this is dropped, not queued. Later calls are
 * ignored, so pass a route-table page's `$pageview` props on this first call.
 */
export function initAnalytics(pageProps?: SeoPageViewProps): void {
  if (initialized) return;
  initialized = true;
  initPostHog(loadShareData(), pageProps);
  if (typeof navigator !== "undefined") {
    setDeviceProperty(deviceBucket(navigator.userAgent));
  }
}

/** Records a gameplay event. Never throws — analytics must not break a run. */
export function track(event: AnalyticsEvent): void {
  try {
    captureGameEvent(event);
  } catch {
    // ignore
  }
}

/** Stamps the calibration numbers, as person properties and as an event. */
export function trackCalibration(cal: CalibrationSettings): void {
  try {
    setCalibrationProperties(cal);
  } catch {
    // ignore
  }
}

/** Stamps the effective speech style as a super/person property. */
export function trackSpeechStyle(style: SpeechStyle): void {
  try {
    setSpeechStyleProperty(style);
  } catch {
    // ignore
  }
}

/** First-touch SEO attribution (`$set_once` person properties). */
export function trackFirstSeoTouch(page: string, angle: string): void {
  try {
    setFirstSeoTouch(page, angle);
  } catch {
    // ignore
  }
}

/** Stamps the in-app browser (instagram/tiktok/facebook) as a super property. */
export function trackInAppBrowser(app: string): void {
  try {
    setInAppBrowserProperty(app);
  } catch {
    // ignore
  }
}

/**
 * Mirrors the "Anonymous game data" toggle — the gameplay tier only. Off
 * stops gameplay/calibration events immediately; global-tier events (screen
 * views, mode selection, the leaderboard/signup funnel) are unaffected. See
 * `posthog.ts`'s `setPostHogConsent`.
 */
export function setSharingEnabled(enabled: boolean): void {
  try {
    setPostHogConsent(enabled);
  } catch {
    // ignore
  }
}
