/**
 * PostHog — the whole analytics pipeline: traffic and gameplay both.
 *
 * This used to be traffic-only, deliberately walled off from gameplay data
 * (see git history) because a third-party SDK inside `session.ts`'s closed
 * event union would have broken the property that made it auditable. That
 * wall came down on purpose: the gameplay pipeline's own storage (Vercel
 * Blob, `api/analytics.ts`) was metered per-write and heading for its cap as
 * player volume grew, and PostHog gives live funnels/breakdowns in exchange
 * for the same anonymous-events-only posture this file already had.
 *
 * The discipline that made the old wall unnecessary to keep: `session.ts`'s
 * `AnalyticsEvent` union is still the closed vocabulary for what a gameplay
 * event can contain, and `before_send` below re-enforces it at the transport
 * boundary the way `api/analytics.ts` used to server-side — every property on
 * a known gameplay event name is reduced to a fixed allowlist before it ever
 * leaves the SDK's queue.
 *
 * Three things are switched off that PostHog turns on by default: autocapture
 * (every click and input on the page), session recording, and `$exception`
 * capture. All three would send content this file has not looked at, from a
 * game whose entire input is a microphone. What events *do* send is decided
 * at the call site: `capturePostHogEvent`/`captureGameEvent`, never a default.
 *
 * ## Reverse proxy
 *
 * Requests go to `/relay/...` on this domain (see `vercel.json`), not
 * `us.i.posthog.com` directly. Ad/tracker blockers (Brave, uBlock's
 * EasyPrivacy list) block PostHog's own domains by name, which used to only
 * cost a few marketing clicks — now it would silently drop 100% of a blocked
 * player's gameplay events too, so the proxy is no longer optional.
 *
 * ## Country-level geo — the one deliberate exception to "no geolocation"
 *
 * PostHog enriches events with `$geoip_*` properties from the request IP at
 * ingest. `before_send` keeps only `$geoip_country_name`/`$geoip_country_code`
 * on gameplay events and drops city/region/lat-long. Raw IP retention itself
 * is a project-level setting (`anonymize_ips`) this file does not control —
 * the PostHog project is shared across several of Pierre's other apps, so
 * that setting is left as-is rather than changed on FlappyTone's behalf; see
 * CLAUDE.md. Country-level data answers a real open product question (PRD
 * §14: Taiwan vs. Beijing reference audio) at a re-identification risk no
 * higher than the `device` bucket this file already sends.
 *
 * ## The pre-load race
 *
 * The SDK is ~77kB gzipped, so it is imported dynamically and never blocks
 * first paint or the mic gesture. But `landed` — the very first event of
 * every visit — would otherwise race that import on every single page load,
 * not just occasionally. `pending` queues capture calls made before the chunk
 * lands and replays them in order once it does, so that race costs nothing.
 * This is a same-page-load ordering fix, not a substitute for durability
 * across a reload — PostHog's SDK does not persist a queue across a tab
 * close/force-quit, and that gap is accepted (see the migration design doc)
 * in exchange for a much simpler pipeline than the one this replaced.
 */

import type { BeforeSendFn, CaptureResult } from "posthog-js";
import type posthogType from "posthog-js";
import { roundCalibration, type AnalyticsEvent, type SessionCalibration } from "./session.ts";

let ph: typeof posthogType | null = null;

/** Publishable ingestion token for the "Default project" on us.posthog.com. */
const KEY = "phc_sSykUkf4P7wAmEdGomRPERvDdmNjBZhv4U4yTa93ymVW";

/** Proxied through our own domain — see the header note and `vercel.json`. */
const API_HOST = "/relay";
const UI_HOST = "https://us.posthog.com";

let started = false;
/** A consent change that arrived before the chunk did; `null` means untouched. */
let wanted: boolean | null = null;

/** Capture calls made before the SDK chunk has loaded, replayed in order once it has. */
let pending: Array<() => void> = [];
/** Defensive bound — if the dynamic import never resolves, this must not grow forever. */
const MAX_PENDING = 200;

/**
 * Production only, matching `reportingEnabled()`'s old rationale: a dev
 * session is one person reloading the same page forty times, and mixing that
 * into the traffic or gameplay numbers makes them a lie. A Vercel *preview*
 * deploy is a production build, so a preview URL does report.
 */
function enabled(): boolean {
  if (import.meta.env.PROD) return true;
  try {
    return new URLSearchParams(location.search).has("analytics");
  } catch {
    return false;
  }
}

/**
 * Event names `before_send` treats as gameplay data — `session.ts`'s closed
 * union, plus `calib_numbers` (the calibration readout, not part of that
 * union since it isn't a moment-in-time event). Anything else (marketing CTA
 * clicks, `$pageview`, newsletter events) keeps PostHog's normal properties.
 */
const GAME_EVENTS = new Set<string>([
  "landed",
  "mic",
  "calib_step",
  "calib_done",
  "calib_abandoned",
  "calib_numbers",
  "recal_offered",
  "recal_resolved",
  "run_feedback",
  "run_start",
  "gate",
  "run_end",
  "cue_fallback",
]);

/** The only `$`-prefixed properties allowed through on a gameplay event. */
const GEO_ALLOW = new Set(["$geoip_country_name", "$geoip_country_code"]);

/**
 * Reduces a gameplay event's properties to what CLAUDE.md's closed-vocabulary
 * rule permits: PostHog's own `$`-prefixed defaults are dropped except the
 * two country-level geo fields; everything else (our own event fields) passes
 * through, since the `AnalyticsEvent`/`SessionCalibration` type unions are
 * already the guard on those. Pure and exported so it is testable without
 * mocking the SDK.
 */
export function sanitizeGameProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (k.startsWith("$")) {
      if (GEO_ALLOW.has(k)) out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

const beforeSend: BeforeSendFn = (cr: CaptureResult | null) => {
  if (!cr || !GAME_EVENTS.has(cr.event)) return cr;
  return { ...cr, properties: sanitizeGameProperties(cr.properties) };
};

/** Runs now if the SDK is ready, otherwise queues for replay after it loads. */
function runOrQueue(fn: () => void): void {
  if (ph) {
    fn();
    return;
  }
  if (started && pending.length < MAX_PENDING) pending.push(fn);
}

/**
 * Starts PostHog. Call once from app start; later calls are ignored so a
 * strict-mode double-mount cannot initialise twice.
 *
 * Never throws — an analytics failure must not break a run (CLAUDE.md).
 */
export function initPostHog(consent: boolean): void {
  try {
    if (started || !enabled() || typeof window === "undefined") return;
    started = true;
    void import("posthog-js")
      .then(({ default: posthog }) => {
        ph = posthog;
        posthog.init(KEY, {
          api_host: API_HOST,
          ui_host: UI_HOST,
          defaults: "2025-05-24",
          autocapture: false,
          capture_exceptions: false,
          disable_session_recording: true,
          person_profiles: "always",
          // Shrinks the batching window per the accepted reliability trade-off
          // (see the migration design doc): events send close to immediately
          // instead of accumulating for up to the default 3s.
          request_queue_config: { flush_interval_ms: 250 },
          before_send: beforeSend,
          // Read again rather than closed over: the player may have hit the
          // toggle in the time the chunk took to arrive.
          opt_out_capturing_by_default: !(wanted ?? consent),
        });
        const queued = pending;
        pending = [];
        for (const run of queued) run();
      })
      .catch(() => {});
  } catch {
    // Nothing here is worth a broken page.
  }
}

/**
 * Fires a named event. `properties` must stay flat primitives, matching the
 * discipline `session.ts` enforces by type for gameplay events and this file
 * enforces by convention for marketing ones.
 *
 * A silent no-op before the chunk loads is queued rather than dropped (see
 * the header note); a no-op because the build never enabled PostHog at all is
 * a true no-op, matching "a disabled build stores nothing."
 */
export function capturePostHogEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
  options?: { instant?: boolean },
): void {
  try {
    runOrQueue(() => {
      try {
        ph?.capture(name, properties, options?.instant ? { send_instantly: true } : undefined);
      } catch {
        // Same posture as everywhere else in this file.
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Fires a gameplay event straight from `session.ts`'s closed union — `type`
 * becomes the event name, the rest becomes its properties. `run_end` sends
 * instantly rather than joining the (already short) batch window, since it is
 * the single most valuable event to not lose to a same-tab navigation.
 */
export function captureGameEvent(event: AnalyticsEvent): void {
  const { type, ...rest } = event;
  capturePostHogEvent(type, rest as Record<string, string | number | boolean>, {
    instant: type === "run_end",
  });
}

/**
 * Stamps calibration numbers two ways: as person properties, so any later
 * event from this anonymous id can be filtered/grouped by voice profile
 * (what makes "does calibration work across voice types" answerable), and as
 * a `calib_numbers` event, so a single row also carries them without needing
 * a person-property join.
 */
export function setCalibrationProperties(cal: SessionCalibration): void {
  const props = roundCalibration(cal);
  runOrQueue(() => {
    try {
      ph?.setPersonProperties(props);
    } catch {
      // ignore
    }
  });
  capturePostHogEvent("calib_numbers", { ...props });
}

/**
 * Stamps the coarse device bucket as a person property once per session,
 * rather than repeating it on every gameplay event. `deviceBucket`'s closed
 * set, never the raw user-agent — see `session.ts`.
 */
export function setDeviceProperty(device: string): void {
  runOrQueue(() => {
    try {
      ph?.setPersonProperties({ device });
    } catch {
      // ignore
    }
  });
}

/**
 * Mirrors the "Anonymous game data" toggle for both traffic and gameplay
 * events — there is one consent flag, not two. Opting out stops capture and
 * drops the stored distinct id, the same "off means erased" posture the old
 * gameplay queue took.
 */
export function setPostHogConsent(on: boolean): void {
  try {
    wanted = on;
    if (!ph) return; // still loading — `wanted` is read when it lands
    if (on) ph.opt_in_capturing();
    else {
      ph.opt_out_capturing();
      ph.reset();
    }
  } catch {
    // Same posture as everywhere else in this file.
  }
}
