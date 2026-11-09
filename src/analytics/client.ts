/**
 * The gameplay analytics call sites' entry point.
 *
 * This used to own a localStorage queue, a debounced flush, `sendBeacon`, and
 * a retry-on-load drain — the durability design that made the old Blob-backed
 * pipeline lossless across an offline period or a force-quit. That design
 * moved to PostHog (`./posthog.ts`), which does not offer the same
 * across-reload guarantee; the trade was accepted deliberately (see the
 * migration design doc) in exchange for not maintaining this machinery.
 * `initAnalytics`/`track`/`setSharingEnabled` keep their names and shapes so
 * every call site needed no changes.
 *
 * One switch, "Usage analytics" (brief 35): `loadShareData()` is read by
 * `initAnalytics` and off stops every event, see `posthog.ts`'s
 * `setPostHogConsent`.
 */

import { loadShareData } from "../game/settings.ts";
import type { SpeechStyle } from "../game/words.ts";
import { deviceBucket, type AnalyticsEvent, type SeoPageViewProps } from "./session.ts";
import {
  captureGameEvent,
  initPostHog,
  setDeviceProperty,
  setFirstSeoTouch,
  setPostHogConsent,
  setSpeechStyleProperty,
} from "./posthog.ts";

let initialized = false;

/**
 * Starts the PostHog client. Call once, from the entry module before the first
 * render: an event tracked before this is dropped, not queued. Later calls are
 * ignored, so pass a route-table page's `$pageview` props on this first call.
 *
 * `waitForAccount` (`/app`): unless this browser already says off, nothing is
 * sent until the account's own value is known (`setSharingEnabled`, called by
 * `src/data/usageAnalytics.ts` or by AuthGate for a signed-out visitor).
 */
export function initAnalytics(pageProps?: SeoPageViewProps, opts?: { waitForAccount?: boolean }): void {
  if (initialized) return;
  initialized = true;
  const on = loadShareData();
  initPostHog(!on ? "off" : opts?.waitForAccount ? "pending" : "on", pageProps);
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

/**
 * The "Usage analytics" switch. Off stops every event at once; on sends from
 * that moment. See `posthog.ts`'s `setPostHogConsent`.
 */
export function setSharingEnabled(enabled: boolean): void {
  try {
    setPostHogConsent(enabled);
  } catch {
    // ignore
  }
}
