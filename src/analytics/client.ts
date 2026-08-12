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
 * Consent is still checked before anything is captured: `loadShareData()` is
 * read by `initAnalytics` and threaded through to `initPostHog`, which mints
 * no id at all when the player has opted out.
 */

import { loadShareData, type CalibrationSettings } from "../game/settings.ts";
import { deviceBucket, type AnalyticsEvent } from "./session.ts";
import {
  captureGameEvent,
  initPostHog,
  setCalibrationProperties,
  setDeviceProperty,
  setPostHogConsent,
} from "./posthog.ts";

let initialized = false;

/**
 * Starts the PostHog client. Call once, from app start — later calls are
 * ignored so a React strict-mode double-mount cannot start it twice.
 */
export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;
  initPostHog(loadShareData());
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

/**
 * Mirrors the "Anonymous game data" toggle. Off erases the stored id and
 * stops capture immediately; on resumes capture under a fresh anonymous id.
 */
export function setSharingEnabled(enabled: boolean): void {
  try {
    setPostHogConsent(enabled);
  } catch {
    // ignore
  }
}
