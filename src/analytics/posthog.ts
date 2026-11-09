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
 * `AnalyticsEvent` union is the closed vocabulary for what a gameplay event
 * can contain — and it is the ONLY property-level gate. Be exact about what
 * `before_send` below actually does, because it is easy to read as more: it
 * matches the event NAME against `APP_EVENTS`, then drops `$`-prefixed keys
 * except a short allowlist (`PH_ALLOW`: page host/path, device/user-agent,
 * SDK/session ids, country-level geo), and passes every other property
 * straight through. It filters PostHog's defaults, not ours.
 *
 * The consequence, stated plainly: a field added to `AnalyticsEvent` ships
 * unfiltered. Nothing downstream will catch it. That is why the union has to
 * stay a closed, reviewed type rather than a convenience — reviewing the
 * addition is the whole control, and there is no second one.
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
 * ## IP address and geo — stored by PostHog, not decided here
 *
 * `before_send` keeps only `$geoip_country_name`/`$geoip_country_code` on app
 * events, but that only filters what the browser sends. PostHog adds `$ip`
 * and its full GeoIP set (city, region, postcode, lat/long, time zone) to
 * every event and person at ingest, after `before_send` has run. IP retention
 * is the project-level `anonymize_ips` setting, and the project is shared
 * with Pierre's other apps, so it is left as-is. The privacy policy states
 * this (30 Oct 2026, DECISIONS.md). Do not claim "country only" anywhere.
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
import type { SpeechStyle } from "../game/words.ts";
import { detectInAppBrowser, type InAppBrowser } from "../lib/inAppBrowser.ts";
import { currentDisplayMode, type DisplayMode } from "../lib/displayMode.ts";
import { APP_EVENT_TYPES, type AnalyticsEvent, type SeoPageViewProps } from "./session.ts";

let ph: typeof posthogType | null = null;

/** Publishable ingestion token for the "Default project" on us.posthog.com. */
const KEY = "phc_sSykUkf4P7wAmEdGomRPERvDdmNjBZhv4U4yTa93ymVW";

/** Proxied through our own domain — see the header note and `vercel.json`. */
const API_HOST = "/relay";
const UI_HOST = "https://us.posthog.com";

/**
 * The "Usage analytics" switch (brief 35), the one gate on everything this
 * file sends:
 * - `on`: the SDK runs and every event is sent.
 * - `off`: nothing is sent. The SDK is never started when the page loads
 *   with it off (no PostHog id stored, no request made), and `beforeSend`
 *   drops every event, autocaptured ones included, if it is turned off after
 *   the SDK started.
 * - `pending`: `/app` before the account's value is known. Events are held
 *   in memory (`pending`, bounded) and the SDK is not started. `on` sends
 *   them, `off` discards them, so nothing is sent unless the result is on.
 */
export type UsageConsent = "on" | "off" | "pending";

let consent: UsageConsent = "off";
/** `initPostHog` ran on this page (an `enabled()` build, in a browser). */
let armed = false;
/** The SDK chunk import has been started. */
let loading = false;

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
 * Event names `before_send` sanitizes — every event this app itself fires.
 * This is a property-sanitization allowlist, not a consent gate: it strips
 * PostHog's own `$`-prefixed defaults (except `PH_ALLOW`) from anything named
 * here. Anything NOT named here (marketing CTA clicks on
 * the landing site, `$pageview`, newsletter events) keeps PostHog's normal
 * properties, since those were never built from `session.ts`'s closed union
 * in the first place.
 *
 * Built from `APP_EVENT_TYPES`, so every union type is sanitized by construction.
 * A hand-kept list here once missed `seo_cta_click`, which then shipped with
 * PostHog's full defaults.
 */
export const APP_EVENTS = new Set<string>(Object.keys(APP_EVENT_TYPES));

/**
 * The only `$`-prefixed properties allowed through on an app event. Each one
 * is set by the SDK and carries no text the player typed:
 * - page: `$host`, `$pathname`, `$referring_domain`. Never `$current_url`
 *   (its query string can hold a challenge `?n=<name>`) or `$referrer`.
 * - device: the user agent, browser/OS, device type and screen/viewport
 *   sizes. PostHog's bot filter reads the user agent; without it every app
 *   event was classed as "Automation" (DECISIONS.md, 2026-10-29).
 * - SDK/session: what ingestion and session funnels need.
 * - geo: country only from the client. PostHog adds `$ip` and city-level
 *   `$geoip_*` again at ingestion, after this runs (see the header note).
 */
export const PH_ALLOW = new Set([
  "$host",
  "$pathname",
  "$referring_domain",
  "$raw_user_agent",
  "$browser",
  "$browser_version",
  "$os",
  "$os_version",
  "$device_type",
  "$screen_width",
  "$screen_height",
  "$viewport_width",
  "$viewport_height",
  "$lib",
  "$lib_version",
  "$session_id",
  "$window_id",
  "$insert_id",
  "$time",
  "$process_person_profile",
  "$geoip_country_name",
  "$geoip_country_code",
]);

/**
 * Reduces an app event's properties to what CLAUDE.md's closed-vocabulary
 * rule permits: PostHog's own `$`-prefixed defaults are dropped except
 * `PH_ALLOW`; everything else (our own event fields) passes
 * through, since the `AnalyticsEvent` type union is already the guard on
 * those. Pure and exported so it is testable without
 * mocking the SDK.
 *
 * So a field added to the union — `run_end`'s `voice`, the roster speaker id a
 * run was flown with — reaches PostHog by passing through here, and
 * `session.test.ts` asserts that rather than assuming it. Adding a field to
 * the union is therefore the whole decision: there is no second list to
 * update, and equally no second gate to catch a field that should not have
 * been added. Nothing the player typed may enter the union.
 */
export function sanitizeGameProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (k.startsWith("$")) {
      if (PH_ALLOW.has(k)) out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Drops full URLs from the person properties the SDK adds to an app event
 * (`$set_once` carries `$initial_current_url`, `$initial_referrer`,
 * `$current_url`, `$referrer`). A challenge link's `?n=<name>` can be in
 * them. Host, path, referring domain and UTM keys stay. Pure, for tests.
 */
export function stripPersonUrls(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.endsWith("current_url") || k.endsWith("referrer")) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Set by a route-table page's entry (`initPostHog`'s second argument): merged
 * into that page load's `$pageview` only — not registered as a super
 * property, which would persist and stamp every later event, /app included.
 */
let pageViewProps: SeoPageViewProps | undefined;

/** Merges a route-table page's props into its `$pageview`; other events untouched. Pure, for tests. */
export function withPageViewProps(
  cr: CaptureResult,
  props: SeoPageViewProps | undefined,
): CaptureResult {
  if (cr.event !== "$pageview" || !props) return cr;
  return { ...cr, properties: { ...cr.properties, ...props } };
}

/** A URL with a challenge link's `?n=<name>` removed; anything unparsable passes unchanged. */
export function withoutNameParam(url: unknown): unknown {
  if (typeof url !== "string" || !url.includes("n=")) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("n")) return url;
    u.searchParams.delete("n");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Removes `?n=<name>` from every full-URL field (`$current_url`, `$referrer`,
 * their `$initial_` person forms). Runs on every event, `$pageview` included,
 * since those keep their URLs. Pure, for tests.
 */
export function scrubNameFromUrls(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = k.endsWith("current_url") || k.endsWith("referrer") ? withoutNameParam(v) : v;
  }
  return out;
}

const beforeSend: BeforeSendFn = (input: CaptureResult | null) => {
  // The switch's last line: with analytics not on, every event the SDK would
  // send is dropped here — `$pageview`, `$pageleave`, `$web_vitals`, `$set`,
  // `$identify` and our own alike, since all of them pass through here.
  if (consent !== "on") return null;
  const raw = input && withPageViewProps(input, pageViewProps);
  if (!raw) return raw;
  const cr: CaptureResult = { ...raw, properties: scrubNameFromUrls(raw.properties) ?? raw.properties };
  if (raw.$set) cr.$set = scrubNameFromUrls(raw.$set);
  if (raw.$set_once) cr.$set_once = scrubNameFromUrls(raw.$set_once);
  if (!APP_EVENTS.has(cr.event)) return cr;
  const out: CaptureResult = { ...cr, properties: sanitizeGameProperties(cr.properties) };
  if (cr.$set) out.$set = stripPersonUrls(cr.$set);
  if (cr.$set_once) out.$set_once = stripPersonUrls(cr.$set_once);
  return out;
};

/**
 * Runs now if the SDK is ready and analytics is on; holds it while the SDK
 * loads or the switch is `pending`; drops it when off (never sent later).
 */
function runOrQueue(fn: () => void): void {
  if (!armed || consent === "off") return;
  if (ph && consent === "on") {
    fn();
    return;
  }
  if (pending.length < MAX_PENDING) pending.push(fn);
}

/**
 * Starts PostHog with the switch's state at page load. Call once from the
 * entry; later calls are ignored so a strict-mode double-mount cannot
 * initialise twice. `off` and `pending` do not load the SDK at all; it
 * starts when `setPostHogConsent(true)` is called.
 *
 * Never throws — an analytics failure must not break a run (CLAUDE.md).
 */
export function initPostHog(state: UsageConsent, pageProps?: SeoPageViewProps): void {
  try {
    if (armed || !enabled() || typeof window === "undefined") return;
    armed = true;
    pageViewProps = pageProps;
    consent = state;
    if (state === "on") loadSdk();
  } catch {
    // Nothing here is worth a broken page.
  }
}

function loadSdk(): void {
  if (loading) return;
  loading = true;
  try {
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
          // The SDK's own opt-out is not used: it is saved per browser, not
          // per account, so it would fight the account's switch. The switch
          // is `consent` above, checked in `runOrQueue` and `beforeSend`.
          opt_out_capturing_by_default: false,
        });
        // Registered before the first `$pageview`, which the SDK sends on a
        // 1 ms timer after init, so every event of the visit carries it.
        registerInAppBrowser(posthog);
        forgetCalibrationProperties(posthog);
        flushPending();
      })
      .catch(() => {});
  } catch {
    // ignore
  }
}

function flushPending(): void {
  if (!ph || consent !== "on") return;
  const queued = pending;
  pending = [];
  for (const run of queued) run();
}

/** Device-level marker: the old calibration person properties were removed. */
const CALIB_UNSET_KEY = "toneflap.calib.unset.v1";
const CALIB_PERSON_KEYS = ["f0Center", "rangeSemitones", "rangeDownSemitones", "noiseFloor"];

/** The saved mic calibration (`src/game/settings.ts`, per device). Only a
 * browser that calibrated ever sent the calibration person properties. */
const CALIBRATION_KEYS = ["toneflap.settings.v3", "toneflap.settings.v2", "toneflap.settings.v1"];

/**
 * Brief 35: calibration numbers are no longer sent. A person who already has
 * them on their PostHog profile gets one `$unset` (`unsetPersonProperties`,
 * a `$set` event) the next time the SDK runs here, then never again. A
 * browser that never calibrated never sent them, so it sends nothing.
 */
function forgetCalibrationProperties(client: typeof posthogType): void {
  try {
    if (localStorage.getItem(CALIB_UNSET_KEY)) return;
    if (CALIBRATION_KEYS.some((k) => localStorage.getItem(k) !== null)) {
      client.unsetPersonProperties(CALIB_PERSON_KEYS);
    }
    localStorage.setItem(CALIB_UNSET_KEY, "1");
  } catch {
    // ignore
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
  options?: { instant?: boolean; beacon?: boolean },
): void {
  try {
    runOrQueue(() => {
      try {
        // `beacon`: the page is going away (pagehide), so only sendBeacon is
        // sure to leave before it does.
        const opts = options?.beacon
          ? { send_instantly: true, transport: "sendBeacon" as const }
          : options?.instant
            ? { send_instantly: true }
            : undefined;
        ph?.capture(name, properties, opts);
      } catch {
        // Same posture as everywhere else in this file.
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Fires an event straight from `session.ts`'s closed union — `type` becomes
 * the event name, the rest becomes its properties. `run_end` sends instantly
 * rather than joining the (already short) batch window, since it is the
 * single most valuable event to not lose to a same-tab navigation.
 *
 * The switch is checked in `runOrQueue` (and again in `beforeSend`): with it
 * off the event is dropped, never sent later.
 */
export function captureGameEvent(event: AnalyticsEvent): void {
  const { type, ...rest } = event;
  capturePostHogEvent(type, rest as Record<string, string | number | boolean>, {
    instant: INSTANT_EVENTS.has(type) || (type === "seo_cta_click" && event.target === "signup"),
    // An abandoned run may end inside `pagehide` (brief 31), so it goes the
    // same way: only sendBeacon is sure to leave a closing page.
    beacon: type === "mic_unanswered" || (event.type === "run_end" && event.reason === "abandoned"),
  });
}

/**
 * Sent at once, not in the 250ms batch: each is followed by a page change
 * (to /app, a reload after signup, or the checkout), where a batched send can
 * be lost. `run_end` is here because it is the most valuable event to keep.
 */
const INSTANT_EVENTS = new Set<AnalyticsEvent["type"]>([
  "run_end",
  "tool_summary",
  "tool_cta_click",
  "signup_completed",
  "login_completed",
  "earlybird_pay_click",
  "earlybird_checkout_opened",
]);

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
 * Stamps the player's effective speech style on every later event (a super
 * property) and on the person, so any chart can be split by it — including
 * players who never touched the setting and so never sent `setting_changed`.
 * A closed two-value union.
 */
export function setSpeechStyleProperty(style: SpeechStyle): void {
  runOrQueue(() => {
    try {
      ph?.register({ speech_style: style });
      ph?.setPersonProperties({ speech_style: style });
    } catch {
      // ignore
    }
  });
}

/**
 * First-touch SEO attribution: the route-table page whose CTA first brought
 * this person into /app. `$set_once`, so a later visit from another page never
 * overwrites it. Values come from the route table only.
 */
export function setFirstSeoTouch(page: string, angle: string): void {
  runOrQueue(() => {
    try {
      ph?.setPersonProperties(undefined, { first_seo_page: page, first_seo_angle: angle });
    } catch {
      // ignore
    }
  });
}

/**
 * The in-app browser super properties and person properties for a UA. Every
 * value comes from `detectInAppBrowser`'s closed sets; `none` is sent too, so
 * a filter can select "normal browser". Pure, for tests.
 */
export function inAppBrowserProperties(info: InAppBrowser): {
  register: { in_app_browser: string; in_app_platform: string };
  set: { last_in_app_browser: string };
  setOnce: { initial_in_app_browser: string };
} {
  return {
    register: { in_app_browser: info.app, in_app_platform: info.platform },
    set: { last_in_app_browser: info.app },
    setOnce: { initial_in_app_browser: info.app },
  };
}

/**
 * The display-mode super property and person properties. `first_standalone_at`
 * is set once, on the first Home Screen launch: on iOS, which has no install
 * event, that is the install signal. Pure, for tests.
 */
export function displayModeProperties(
  mode: DisplayMode,
  now: Date,
): {
  register: { display_mode: DisplayMode };
  set: { last_display_mode: DisplayMode };
  setOnce: { initial_display_mode: DisplayMode; first_standalone_at?: string };
} {
  return {
    register: { display_mode: mode },
    set: { last_display_mode: mode },
    setOnce: {
      initial_display_mode: mode,
      ...(mode === "standalone" ? { first_standalone_at: now.toISOString() } : {}),
    },
  };
}

/**
 * Stamps `in_app_browser`/`in_app_platform`/`display_mode` on every event of
 * the visit (super properties), and the first/last value on the person. Runs
 * at SDK start on every entry (`/`, the site pages, `/app`). Also listens for
 * `appinstalled` (Chromium only) to send `pwa_installed`.
 */
function registerInAppBrowser(client: typeof posthogType): void {
  try {
    if (typeof navigator === "undefined") return;
    const p = inAppBrowserProperties(detectInAppBrowser(navigator.userAgent));
    const d = displayModeProperties(currentDisplayMode(), new Date());
    client.register({ ...p.register, ...d.register });
    client.setPersonProperties({ ...p.set, ...d.set }, { ...p.setOnce, ...d.setOnce });
    window.addEventListener("appinstalled", () => captureGameEvent({ type: "pwa_installed" }), { once: true });
  } catch {
    // ignore
  }
}

/**
 * The "Usage analytics" switch (brief 35). Off stops every PostHog event from
 * this page at once: held events are discarded, `runOrQueue` drops new ones,
 * and `beforeSend` drops what the SDK itself sends (`$pageview`,
 * `$pageleave`, `$web_vitals`, `$set`, `$identify`). On starts the SDK if
 * the page loaded with the switch off or pending, and sends from that moment:
 * nothing captured while off is sent later. Events held while `pending` are
 * sent, because the switch was never off for them.
 *
 * Does not call `ph.opt_out_capturing()` or `ph.reset()`: PostHog saves its
 * opt-out per browser, not per account, and a reset would orphan the
 * person's history for no privacy gain (nothing is sent while off).
 */
export function setPostHogConsent(on: boolean): void {
  if (!armed) {
    consent = on ? "on" : "off";
    return;
  }
  if (!on) {
    consent = "off";
    pending = [];
    return;
  }
  consent = "on";
  if (ph) flushPending();
  else loadSdk();
}

/** Test seam: back to a fresh page. */
export function resetPostHogForTests(): void {
  ph = null;
  consent = "off";
  armed = false;
  loading = false;
  pending = [];
  pageViewProps = undefined;
}
