/**
 * PostHog — traffic analytics, and nothing else.
 *
 * This answers one question the gameplay analytics deliberately cannot: do
 * people who are sent a link actually arrive, on what, from where. It is
 * pageviews and sessions, not gates and tones.
 *
 * **It is separate from `src/analytics/` proper on purpose.** That pipeline is
 * a closed event union posted to our own `api/analytics`, and the reason it is
 * auditable is that `session.ts` decides what is sent and nothing else does.
 * A third-party SDK inside it would break that property. So the two never
 * touch: PostHog sees no gate, no score, no calibration, no pitch.
 *
 * Three things are switched off that PostHog turns on by default:
 * autocapture (every click and input on the page), session recording, and
 * `$exception` capture. All three would send content we have not looked at,
 * from a game whose entire input is a microphone. Pageviews only.
 *
 * The project token is not a secret — it is a publishable, write-only
 * ingestion key, so it is inlined rather than plumbed through an env var that
 * has to exist in three Vercel environments before the first deploy works.
 */

import type posthogType from "posthog-js";

/**
 * The SDK is ~77kB gzipped — three times the rest of the app — so it is
 * imported dynamically and never blocks first paint or the mic gesture. If it
 * fails to load, nothing else notices.
 */
let ph: typeof posthogType | null = null;

/** Publishable ingestion token for the "Default project" on us.posthog.com. */
const KEY = "phc_sSykUkf4P7wAmEdGomRPERvDdmNjBZhv4U4yTa93ymVW";

/** Reverse proxy would need a rewrite; the direct host is fine for a hobby app. */
const HOST = "https://us.i.posthog.com";

let started = false;
/** A consent change that arrived before the chunk did; `null` means untouched. */
let wanted: boolean | null = null;

/**
 * Production only, matching `reportingEnabled()` in `client.ts` and for the
 * same reason: a dev session is one person reloading the same page forty
 * times, and mixing that into the traffic numbers makes them a lie. A Vercel
 * *preview* deploy is a production build, so a preview URL does report.
 */
function enabled(): boolean {
  if (import.meta.env.PROD) return true;
  try {
    return new URLSearchParams(location.search).has("posthog");
  } catch {
    return false;
  }
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
          api_host: HOST,
          defaults: "2025-05-24",
          autocapture: false,
          capture_exceptions: false,
          disable_session_recording: true,
          person_profiles: "always",
          // Read again rather than closed over: the player may have hit the
          // toggle in the time the chunk took to arrive.
          opt_out_capturing_by_default: !(wanted ?? consent),
        });
      })
      .catch(() => {});
  } catch {
    // Nothing here is worth a broken page.
  }
}

/**
 * Mirrors the "Anonymous game data" toggle. Opting out stops capture and drops
 * the stored distinct id, the same posture `forgetEverything()` takes for the
 * gameplay queue — off means erased, not held back.
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
    // Same posture as above.
  }
}
