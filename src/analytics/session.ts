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
 * - No raw user-agent — that is a fingerprint. Only `deviceBucket`'s closed set.
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
import type { CueStyle, GateLogEntry, RunMode } from "../game/run.ts";
import type { GateOutcome } from "../game/scoring.ts";

/** Why a run stopped. `quit` covers the pause menu's exits, which otherwise leave no trace. */
export type RunEndReason = "out_of_hearts" | "finished" | "quit";

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

export type AnalyticsEvent =
  | { type: "landed" }
  | { type: "mic"; ok: true }
  | { type: "mic"; ok: false; reason: MicFailureReason }
  | { type: "calib_step"; step: CalibStep }
  | { type: "calib_done" }
  | { type: "calib_abandoned"; step: CalibStep }
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
      outcome: GateOutcome;
      acc: number;
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
    }
  /**
   * The native clip wasn't loaded yet when its cue was due, so the synthetic
   * sweep played instead (see src/audio/reference.ts's `playToneCue`). Should
   * be rare to nonexistent in production; this exists to confirm that.
   */
  | { type: "cue_fallback"; tone: Tone };

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
    outcome: entry.outcome,
    acc: round(entry.accuracy, 3),
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
