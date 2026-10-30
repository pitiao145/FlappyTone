/**
 * The shape of what a play session sends home, and nothing else.
 *
 * Pure by the same rule as `src/pitch/`: values in, plain object out. No
 * network, no React, no `localStorage`, no `document`. That is what makes the
 * whole payload testable without a browser, and it is why the privacy rules
 * below can be checked by reading one file.
 *
 * The transport (`src/analytics/posthog.ts`, `client.ts`) sends each event
 * individually rather than assembling a `SessionRecord` to POST, but this
 * file's `AnalyticsEvent` union and `SessionCalibration` are still the closed
 * vocabulary both sides agree on — `posthog.ts`'s `before_send` re-enforces
 * the same allowlist at the transport boundary that `api/analytics.ts` used
 * to enforce server-side.
 *
 * ## What is sent
 *
 * Gameplay outcomes only. Per gate: the tone asked for, what happened, how
 * accurate it was, how long the player voiced, how far outside the corridor
 * they strayed. Per session: which screens they reached, their calibration
 * numbers, and a coarse device bucket.
 *
 * ## What is never sent — this list is load-bearing
 *
 * - No audio. Not a sample, not a clip, not a duration of anything recorded.
 * - No per-frame pitch or contour data. Gate summaries only, so the trace of
 *   someone's voice cannot be reconstructed from the payload.
 * - No raw user-agent in our own fields — only `deviceBucket`'s closed set.
 *   PostHog's own `$raw_user_agent` is kept by `posthog.ts`'s `PH_ALLOW`, for
 *   bot filtering (DECISIONS.md, 29 Oct 2026).
 * - No IP, geolocation, timezone, screen size, language, or cookies.
 * - No name, handle, email, or anything the player typed. The game has no
 *   text input; keep it that way.
 *
 * `AnalyticsEvent` is a closed discriminated union, so adding a forbidden
 * field is a type error rather than a review comment someone has to catch. If
 * you find yourself widening the union to `Record<string, unknown>`, that is
 * the guardrail breaking, not a nuisance.
 *
 * The calibration numbers are the one judgement call here. `f0Center`, the two
 * range halves and `noiseFloor` are four floats derived from a voice.
 * They are not a recording and cannot be turned back into one, and they are
 * the only way to tell "Tone 3 is hard" from "Tone 3 is broken for low
 * voices" — which is a bug in the mapping, not a fact about the player.
 */

import type { CorridorWidth, Tone } from "../game/gates.ts";
import type { CueStyle, GateLogEntry, RunMode, WordMix } from "../game/run.ts";
import type { SpeechStyle } from "../game/words.ts";
import type { GateOutcome } from "../game/scoring.ts";

/** Why a run stopped. `quit` and `restart` both come from the pause menu, which otherwise leaves no trace. */
export type RunEndReason = "out_of_hearts" | "finished" | "quit" | "restart";

/** The calibration steps, mirrored from Calibration.tsx's `Step`. */
export type CalibStep = "quiet" | "talk" | "low" | "high" | "done" | "preview";

/**
 * Restated rather than imported from `audio/mic.ts`.
 *
 * Importing it would pull the whole Web Audio stack into this module's import
 * graph, and this file stays free of that dependency for the same reason
 * `src/pitch/` stays free of Web Audio — it is what makes it testable without
 * a browser.
 *
 * `session.test.ts` asserts this stays identical to `MicErrorKind`, so the two
 * cannot drift apart silently.
 */
export type MicFailureReason =
  | "permission-denied"
  | "no-microphone"
  | "no-audioworklet"
  | "unknown";

/**
 * Properties a route-table page adds to its own `$pageview` (global tier).
 * Closed and reviewed like `AnalyticsEvent`: the page's own metadata from
 * `src/site/routes.ts`, never anything typed.
 */
export interface SeoPageViewProps {
  page_type: "landing" | "hub" | "tool" | "word" | "teacher" | "legal";
  lang: "en" | "zh-tw";
  angle: "learner" | "teacher" | "general";
  page_path: string;
}

/** The /say/* word pages' slugs (`src/site/sayWords.ts`), restated as a closed set. */
export const SAY_SLUGS = [
  "thank-you",
  "hello",
  "goodbye",
  "please",
  "sorry",
  "youre-welcome",
  "no-problem",
  "yuan",
] as const;
export type SaySlug = (typeof SAY_SLUGS)[number];
export type WordPageAction = "listen" | "see_it" | "practise_tone";

/**
 * Where a Try it now run happened: the landing hero, or a site page's
 * overlay (`page` = route path, `seeded` = the word flown first, or null).
 * Optional so older events still type-check.
 */
export interface DemoWhere {
  surface?: "landing" | "overlay";
  page?: string | null;
  seeded?: string | null;
  /** Classic ("game") or the game's Tone Drill / Tone Pairs. */
  mode?: "game" | "drill" | "pairs";
  /** Drill: the tone ("3"); Pairs: the combo ("3-2") or "shuffle"; null for Classic. */
  target?: string | null;
}

/** The routed CTAs on route-table pages (brief 25's table). */
export type SeoCta =
  | "nav_play"
  | "viewer_try"
  | "pip_cta"
  | "tone_test_result"
  | "tone_test_play_link"
  | "visualizer_above_stage"
  | "visualizer_result_good"
  | "visualizer_result_retry";

export type AnalyticsEvent =
  /**
   * `ref` is the closed set of `?ref=` values this app itself ever generates
   * — currently only the share card's link (`src/share/share.ts`). Absent on
   * an ordinary visit. This is the only way to see share-driven traffic:
   * PostHog's own `$current_url`/`$referrer` are stripped from every
   * gameplay event, `landed` included, by `before_send`'s allowlist.
   */
  | {
      type: "landed";
      ref?: "share";
      /**
       * The route-table page (`src/site/routes.ts`) whose CTA brought the
       * player here, from `?src=`. Validated against the table, so always one
       * of its paths. Absent on a direct visit.
       */
      seoPage?: string;
      seoAngle?: "learner" | "teacher" | "general";
    }
  | { type: "mic"; ok: true }
  | { type: "mic"; ok: false; reason: MicFailureReason }
  | { type: "calib_step"; step: CalibStep }
  | { type: "calib_done" }
  | { type: "calib_abandoned"; step: CalibStep }
  | { type: "recal_offered" }
  | { type: "recal_resolved"; outcome: "accepted" | "dismissed" }
  /** Tap-only post-run sentiment prompt on GameOver — see docs/flappytone-SPEC-run-feedback.md. */
  | {
      type: "run_feedback";
      sentiment: "great" | "calib_off" | "too_easy" | "too_hard";
      mode: RunMode;
    }
  | {
      type: "run_start";
      mode: RunMode;
      corridor: CorridorWidth;
      cue: CueStyle;
    }
  | {
      type: "gate";
      /** Index within the run, so drop-off can be read as "quit after gate 4". */
      i: number;
      tone: Tone;
      /** Every syllable's tone, in order — `[tone]` for a single-syllable gate. Carries a `pairs`/mixed run's combo without a schema bump. */
      tones: number[];
      outcome: GateOutcome;
      /** Score accuracy (corridor fit on the gate's clock), 0..1. */
      acc: number;
      /**
       * Tone accuracy (`src/game/toneAccuracy.ts`), 0..1: did the voice make
       * the right tone shape, timing-free. A single rounded number derived
       * from the contour, never the contour itself. Null when unheard or
       * when the gate has no reference (a combo with a neutral syllable).
       */
      toneAcc: number | null;
      uttMs: number;
      voicedFrac: number;
      seeded: number;
      excMs: number;
    }
  | {
      type: "run_end";
      reason: RunEndReason;
      gates: number;
      score: number;
      bestMult: number;
      missedEarly: number;
      /**
       * The voice the run was flown with — a speaker id from the roster
       * (`inventorySpeaker()`), never anything the player typed, so this
       * module's standing promise is intact.
       *
       * Here rather than on `run_start` because `run_end` is the event every
       * outcome number already lives on: with the voice beside them, "do runs
       * with the male voice score worse, or quit earlier?" is a breakdown
       * rather than a join.
       *
       * Optional because this union is read by more than the game — a future
       * emitter with no inventory in scope must be able to send a `run_end`
       * without inventing a speaker id. The one caller today
       * (`Game.tsx`'s `reportRunEnd`) always has one: `inventorySpeaker()`
       * returns a string unconditionally, defaulting to the default speaker,
       * so in practice the property is always present.
       */
      voice?: string;
      /** Classic `game` mode's word pool setting for this run. Absent for every other mode. */
      wordMix?: WordMix;
      /**
       * The recording style the run flew (`Run.speechStyle`, so a guest or a
       * tutorial reads `textbook` whatever the stored setting says). A closed
       * two-value union, never anything typed. Optional for the same reason
       * as `voice`.
       */
      speechStyle?: SpeechStyle;
    }
  /**
   * The native clip wasn't loaded yet when its cue was due, so the synthetic
   * sweep played instead (see src/audio/reference.ts's `playToneCue`). Should
   * be rare to nonexistent in production; this exists to confirm that.
   */
  | { type: "cue_fallback"; tone: Tone }
  /** Share button tapped on GameOver, before the share sheet opens — see docs/flappytone-SPEC-share.md. */
  | { type: "share_clicked"; mode: RunMode; score: number; is_best: boolean }
  /** A `?c=<score>` challenge link landed on a cold or returning session. */
  | { type: "challenge_landed"; target: number }
  /** The challenge-linked run just ended — closes the share -> click -> play -> beat funnel. */
  | { type: "challenge_resolved"; target: number; score: number; beaten: boolean }
  /**
   * The weekly leaderboard was rendered. `rows` is how many entries were
   * shown, `ranked` whether this player has a position on it — together they
   * answer "is the board empty enough to feel dead?".
   */
  | { type: "leaderboard_viewed"; rows: number; ranked: boolean }
  /** The join-the-board modal was offered on game over. */
  | { type: "join_board_shown"; score: number }
  /**
   * The player accepted or declined the join offer. `accepted` is what they
   * chose; `joined`/`ok` are what came of it. Without `accepted`, a decline
   * and a tapped-Join-that-failed are the same event, and the funnel cannot
   * tell a copy problem from an outage.
   *
   * Deliberately carries no display name — the "nothing the player is
   * identified by" rule at the top of this file covers generated handles too.
   */
  | { type: "join_board_submitted"; accepted: boolean; joined: boolean; ok: boolean }
  /** A score reached (or failed to reach) `api/score.ts`. */
  | { type: "score_submitted"; score: number; is_best: boolean; ok: boolean }
  /** A mode tapped from ModeSelect.tsx's `go()` — the single choke point every mode button calls. */
  | { type: "mode_selected"; intent: string; drillTone?: Tone; pairCombo?: number[] }
  /** A screen became visible — fired from a `[screen]`-keyed effect in GameApp.tsx. Dev-only screens are excluded from `TrackedScreen`. */
  | { type: "screen_viewed"; screen: TrackedScreen }
  /** A Settings control changed. `value` is always stringified (booleans as "on"/"off") so the union stays flat primitives. */
  | { type: "setting_changed"; key: SettingKey; value: string }
  /** AccountCard.tsx's submit handler, fired at the start of the attempt. */
  | { type: "signup_started"; mode: "signup" | "login"; method?: "password" | "magic_link" }
  /** AccountCard.tsx's submit handler, fired once `result.ok`. */
  | { type: "signup_completed"; mode: "signup" | "login"; method?: "password" | "magic_link" }
  /** AuthScreen.tsx (the /app login gate, brief 24): the signup or login card became visible. */
  | { type: "auth_screen_viewed"; screen: "signup" | "login"; source: "challenge" | "direct" | "lp_cta" }
  /** AuthScreen.tsx: a returning player signed in (password), or a magic link brought them back. */
  | { type: "login_completed"; method: "password" | "magic_link" }
  /** The daily run cap blocked a start/retry — replaces the old ad-hoc `daily_limit_earlybird_shown`. */
  | { type: "daily_limit_reached"; trigger: "start" | "retry" }
  /** EarlyBirdModal.tsx's mount/surface-change effect. */
  | { type: "earlybird_modal_shown"; surface: string; feature: string; tier: string }
  | { type: "earlybird_create_account_click"; surface: string; feature: string }
  | { type: "earlybird_pay_click"; surface: string; feature: string }
  | { type: "earlybird_checkout_opened"; surface: string; feature: string }
  /** Profile.tsx's EarlyBird sticker CTA. */
  | { type: "profile_earlybird_cta_click" }
  /** Progress.tsx's locked-feature teaser CTAs (accuracy chart, run history, tone evolution), collapsed into one event with a `card` discriminator instead of a dynamic event name. */
  | { type: "progress_locked_cta_click"; card: string }
  /** Progress.tsx's pricing-section "Join EarlyBird" button. */
  | { type: "progress_earlybird_pricing_click" }
  /** Leaderboard.tsx's first successful board resolution per mount. */
  | {
      type: "visualiser_session";
      toneCount: number;
      wordSelected: boolean;
      durationMs: number;
      attempts: number;
      /** The effective speech style the visualiser played and scored in, at the end of the visit. */
      speechStyle?: SpeechStyle;
      /** The effective speech style when the visit started (before any toggle). */
      startStyle?: SpeechStyle;
      /** Which practice tabs were opened this visit ("free" counts only if tapped). */
      tabsUsed?: VisualiserTab[];
      /** Distinct tone pairs picked. */
      pairCombos?: number;
      /** Finished attempts on a two-syllable word (not counted in `attempts`). */
      pairAttempts?: number;
      /** Every word tap, replays included. */
      wordTaps?: number;
      /** Times the visualiser's own speech toggle changed the style. */
      styleToggles?: number;
      /** TOCFL lists selected at the end of the visit (empty = all the tier allows). */
      levels?: number[];
      /** Whether the player changed the word-list selection this visit. */
      levelsChanged?: boolean;
    }
  /**
   * A "what's new" banner in the game (the landing page's banner sends its own
   * `landing_cta_clicked`). `shown` once per mount while visible.
   */
  | { type: "update_banner"; id: string; surface: UpdateBannerSurface; action: "shown" | "clicked" | "dismissed" }
  /**
   * The Play home's "open in your browser" prompt, shown only inside the
   * Instagram/TikTok/Facebook in-app browsers (`src/lib/inAppBrowser.ts`).
   * `detected` once per session; the rest follow the overlay. Closed unions.
   */
  | {
      type: "inapp_prompt";
      app: "instagram" | "tiktok" | "facebook";
      platform: "ios" | "android" | "other";
      action: "detected" | "shown" | "dismissed" | "open_external_clicked" | "copy_link_clicked";
    }
  /**
   * A route-table tool page was used (`src/site/pages/ToneMarks.tsx`): at most
   * once per page load. Never carries the typed text — only which tool and
   * which way it converted.
   */
  | { type: "tool_used"; tool: "tone-marks"; direction: "to-marks" | "to-numbers" }
  /**
   * The public tone visualizer (`src/site/checker/`): each action at most once per
   * page load. No accuracy, no pitch, no word, nothing typed.
   */
  | {
      type: "tool_used";
      tool: "tone-visualizer";
      action: "started" | "mic_denied" | "calibrated" | "first_attempt";
    }
  /**
   * A /say/<slug> word page (`src/site/pages/SayWord.tsx`): each action at
   * most once per page load. The slug is the page's own, from a closed set.
   */
  | { type: "word_page_action"; slug: SaySlug; action: WordPageAction }
  /** The tone visualizer's visit, once on `pagehide`: counts only. */
  | { type: "tool_summary"; tool: "tone-visualizer"; attempts: number; targets: number }
  /**
   * The tone listening test (`src/site/pages/ToneTest.tsx`): `started` and
   * `round_done` once per round, the summary once on `pagehide`. Counts and a
   * closed style only, never a word.
   */
  | { type: "tool_used"; tool: "tone-test"; action: "started" | "round_done" }
  | {
      type: "tool_summary";
      tool: "tone-test";
      rounds: number;
      cards: number;
      correct: number;
      t1Correct: number;
      t2Correct: number;
      t3Correct: number;
      t4Correct: number;
      style: "standard" | "spoken" | "mixed";
    }
  /** A funnel CTA on a public tool page; `weak_pair` is "2-3" or "none". */
  | {
      type: "tool_cta_click";
      tool: "tone-test";
      weak_pair: string;
      placement: "round_done" | "persistent";
    }
  /**
   * The landing page's Try it now mini run (`src/ui/landing/TryItNow.tsx`).
   * `opened` on the first tap, `started` with the voice preset ("saved" =
   * the device's own calibration), `ready` once the cues loaded, then
   * `finished`, `exited` (with the step it left from) or `mic_denied`/`error`.
   * Closed values only: no pitch, no audio, no word.
   */
  | {
      type: "tool_used";
      tool: "try-now";
      action: "opened" | "started" | "ready" | "finished" | "exited" | "mic_denied" | "error";
      voice?: "lower" | "higher" | "saved";
      stage?: "choose" | "preparing" | "playing";
    }
  /**
   * One finished Try it now run: counts only. `unheard` gates are neutral.
   * Per tone: `tNGates` flown, `tNCleared` flown through, `tNAcc` this run's
   * tone accuracy in % (null when that tone had no heard gate).
   */
  | ({
      type: "tool_summary";
      tool: "try-now";
      /** "pairs" is the "Too easy?" round of two-syllable words. */
      level: "single" | "pairs";
      cleared: number;
      total: number;
      unheard: number;
      t1Gates: number;
      t1Cleared: number;
      t1Acc: number | null;
      t2Gates: number;
      t2Cleared: number;
      t2Acc: number | null;
      t3Gates: number;
      t3Cleared: number;
      t3Acc: number | null;
      t4Gates: number;
      t4Cleared: number;
      t4Acc: number | null;
    } & DemoWhere)
  /** Try it now's way into /app or a new round, from its end screen. */
  | ({ type: "tool_cta_click"; tool: "try-now"; placement: "demo_gameover_signup" | "demo_gameover_retry" | "demo_gameover_pairs" } & DemoWhere)
  /**
   * A routed CTA on a route-table page (brief 25): `overlay` opens the Try it
   * now demo on the page, `signup` leaves for /app. `page` is the route path,
   * `cta` a closed name (`SeoCta`).
   */
  | { type: "seo_cta_click"; page: string; cta: SeoCta; target: "overlay" | "signup" }
  /** /app opened from the tone test's CTA (`?src=/tools/tone-test`), once per load. */
  | { type: "app_open"; source: "tone-test"; weak_pair: string }
  /**
   * The app's TONEder tab (`src/app/TonederScreen.tsx`). Counts only, never a
   * word. `toneder_swipe` is batched: one event per round (or on leaving the
   * tab) carrying how many swipes it covers.
   */
  | { type: "toneder_swipe"; tier: string; style: "standard" | "spoken"; count: number }
  | { type: "toneder_round_done"; tier: string; correct: number }
  | { type: "toneder_cap_hit"; tier: string }
  | { type: "toneder_upgrade_click"; tier: string; from: "cap" | "spoken" }
  /** FeedbackWidget.tsx's submit, once it resolves ok. Never carries the free-text message — screen/rating/tier only. */
  | { type: "feedback_submitted"; screen: string; rating: number | null; tier: string };

/**
 * A closed set mirroring `GameApp.tsx`'s `Screen` type, restated here rather
 * than imported so this file stays free of app-level deps (same rule as
 * `MicFailureReason`). Excludes `"lab"`/`"devlogin"` — dev-only screens that
 * should never reach a production event stream (CLAUDE.md hard rule 7).
 * `session.test.ts` pins this against the real `Screen` type both ways.
 */
export type TrackedScreen =
  | "play"
  | "modes"
  | "howto"
  | "calibrate"
  | "finetune"
  | "levelSelect"
  | "silentGate"
  | "tutorial"
  | "seeding"
  | "tutorialdone"
  | "game"
  | "drill"
  | "learn"
  | "pairs"
  | "gameover"
  | "settings"
  | "visualiser"
  | "progress"
  | "profile"
  | "checkoutSignup"
  | "resetPassword"
  | "toneder";

/** The Settings controls that emit a `setting_changed` event. */
/** The visualiser's practice tabs, mirrored from Visualiser.tsx. */
export type VisualiserTab = "free" | "tone" | "pairs";

/** Where an in-game update banner sits. */
export type UpdateBannerSurface = "play_home";

export type SettingKey =
  | "voice"
  | "proficiency"
  | "tunnel_width"
  | "translation"
  | "pinyin"
  | "tone_marks"
  | "speech_style"
  | "theme"
  | "sharing";

/**
 * Which consent gate an event answers to. Gameplay events are dropped when
 * the player has turned off "Anonymous game data" (`setPostHogConsent`);
 * global events always send in production, gated only by `posthog.ts`'s
 * `enabled()` check. A new event type must be added to `EVENT_TIERS` below —
 * it is exhaustive by construction (a missing key is a type error), so this
 * is the one place tier is decided, never inferred at a call site.
 */
export type AnalyticsTier = "gameplay" | "global";

/**
 * Every event type with its tier. A `Record` over the union, so a new type
 * without a tier, or a tier for a type that does not exist, is a type error.
 * `posthog.ts`'s `APP_EVENTS` (the sanitizer's list) is built from these keys.
 */
export const EVENT_TIERS: Record<AnalyticsEvent["type"], AnalyticsTier> = {
  mic: "gameplay",
  calib_step: "gameplay",
  calib_done: "gameplay",
  calib_abandoned: "gameplay",
  recal_offered: "gameplay",
  recal_resolved: "gameplay",
  run_feedback: "gameplay",
  run_start: "gameplay",
  gate: "gameplay",
  run_end: "gameplay",
  cue_fallback: "gameplay",
  visualiser_session: "gameplay",
  landed: "global",
  share_clicked: "global",
  challenge_landed: "global",
  challenge_resolved: "global",
  leaderboard_viewed: "global",
  join_board_shown: "global",
  join_board_submitted: "global",
  score_submitted: "global",
  mode_selected: "global",
  screen_viewed: "global",
  setting_changed: "global",
  signup_started: "global",
  signup_completed: "global",
  auth_screen_viewed: "global",
  login_completed: "global",
  daily_limit_reached: "global",
  earlybird_modal_shown: "global",
  earlybird_create_account_click: "global",
  earlybird_pay_click: "global",
  earlybird_checkout_opened: "global",
  profile_earlybird_cta_click: "global",
  progress_locked_cta_click: "global",
  progress_earlybird_pricing_click: "global",
  feedback_submitted: "global",
  update_banner: "global",
  inapp_prompt: "global",
  tool_used: "global",
  tool_summary: "global",
  word_page_action: "global",
  tool_cta_click: "global",
  seo_cta_click: "global",
  app_open: "global",
  toneder_swipe: "global",
  toneder_round_done: "global",
  toneder_cap_hit: "global",
  toneder_upgrade_click: "global",
};

export function eventTier(type: AnalyticsEvent["type"]): AnalyticsTier {
  return EVENT_TIERS[type];
}

export interface SessionCalibration {
  f0Center: number;
  /** Semitones from centre up to Chao 5. */
  rangeSemitones: number;
  /** Semitones from centre down to Chao 1 — the board is not symmetric. */
  rangeDownSemitones: number;
  noiseFloor: number;
}

/**
 * Rounds away meaningless precision before calibration numbers are sent.
 * The raw floats carry ~15 significant digits from the pitch math; none of
 * that is signal.
 */
export function roundCalibration(cal: SessionCalibration): SessionCalibration {
  return {
    f0Center: round(cal.f0Center, 1),
    rangeSemitones: round(cal.rangeSemitones, 2),
    rangeDownSemitones: round(cal.rangeDownSemitones, 2),
    noiseFloor: round(cal.noiseFloor, 5),
  };
}

/**
 * Flattens one gate's diagnostics into an event.
 *
 * Everything here is already computed by the run; this adds no measurement.
 * Values are rounded because the raw floats carry ~15 significant digits of
 * meaningless precision, which is most of the payload's size.
 */
export function gateEvent(entry: GateLogEntry, index: number): AnalyticsEvent {
  return {
    type: "gate",
    i: index,
    tone: entry.tone,
    tones: entry.tones,
    outcome: entry.outcome,
    acc: round(entry.accuracy, 3),
    toneAcc: entry.toneAccuracy === null ? null : round(entry.toneAccuracy, 3),
    uttMs: Math.round(entry.utteranceMs),
    voicedFrac: round(entry.voicedFraction, 3),
    seeded: entry.seeded,
    excMs: Math.round(entry.worstExcursionMs),
  };
}

function round(n: number, places: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * A short, closed set — never the raw user-agent, which is a fingerprint.
 *
 * The point is to know which reports come from iOS Safari, since that is where
 * the audio stack fails silently (PRD §10) and where a bug report is most
 * likely to be about the platform rather than the game. Anything unrecognised
 * is "other"; there is deliberately no fallback that echoes the input.
 */
export function deviceBucket(ua: string): string {
  const s = ua.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(s);
  // iPadOS reports as a Mac; a touch-capable "Mac" is an iPad.
  const android = /android/.test(s);

  let engine = "other";
  // Order matters: Chrome and Edge both claim Safari, Edge also claims Chrome.
  if (/edg\//.test(s)) engine = "edge";
  else if (/firefox|fxios/.test(s)) engine = "firefox";
  else if (/crios|chrome/.test(s)) engine = "chrome";
  else if (/safari/.test(s)) engine = "safari";

  const platform = ios ? "ios" : android ? "android" : "desktop";
  // On iOS every browser is WebKit underneath, but the wrapper still changes
  // getUserMedia behaviour enough to be worth distinguishing.
  return `${platform}/${engine}`;
}
