/**
 * The tone visualizer's microphone engine — the ONE site module allowed to touch
 * Web Audio (CLAUDE.md, "Three entries" rule 1). The page imports it only
 * with `import("./checker/engine.ts")` on the first Start tap, so it is a
 * separate chunk and never in the page's initial JS.
 *
 * Same engine as the in-app visualiser, composed from the same shared
 * modules (mic session, PitchTracker, sessionNoise, ContourRecorder, tone
 * accuracy, classifier v2, drawVisualiser — via `board.ts`); `src/ui/Visualiser.tsx`
 * itself is not imported and not changed. No clip audio.
 *
 * Pitch runs only while the page is open: frames go to the tracker and are
 * dropped; nothing is recorded or sent (hard rule: no audio leaves the device).
 */

import { ensureMic, getMicSession, setFrameSink, stopMic } from "../../audio/session.ts";
import { MicError } from "../../audio/mic.ts";
import { VisualiserCore } from "../../game/visualiserCore.ts";
import { loadSettings } from "../../game/settings.ts";
import { sessionNoiseMeter, startingNoiseFloor } from "../../game/sessionNoise.ts";
import { tuning } from "../../game/tuning.ts";
import { PitchTracker } from "../../pitch/PitchTracker.ts";
import { scaleForDpr } from "../../render/canvas.ts";
import { drawVisualiser } from "../../render/visualiser.ts";
import { micErrorCopy } from "../../ui/micErrors.ts";
import { scoreAttempt, SPAN_MS, targetWord, type AttemptResult } from "./board.ts";
import { refFor, type RefMode, type ToneRef } from "./toneRefs.ts";
import {
  clearQuickCal,
  loadQuickCal,
  quickCalibration,
  saveQuickCal,
  type QuickCal,
} from "./quickCal.ts";

export { micErrorCopy };
export type { AttemptResult };
/** A calibration take ends after this much voiced sound… */
const CAL_TAKE_MS = 450;
/** …followed by this much silence. */
const CAL_END_SILENCE_MS = 300;
/** Until the room is measured, the tracker uses the PitchTracker default. */
const DEFAULT_NOISE = 0.0033;
/** New audio per frame — `HOP_SIZE` in src/audio/mic.ts. */
const HOP_SAMPLES = 1024;
/** A voiced run this long that ends unscored reads "couldn't hear that"; shorter is a click. */
const UNCLEAR_MIN_MS = 80;
/** Hz the calibration tracker searches around before a centre is known. */
const SEED_F0 = 168;

export type CalStep = "high" | "low";

export interface CheckerEvents {
  /** A calibration take is wanted (`retry` after a take that failed). */
  onCalStep(step: CalStep, retry: boolean): void;
  /** Voiced share of the current calibration take, 0..1. */
  onCalProgress(fraction: number): void;
  /** The board is ready (`fromApp` = the game's own calibration was used). */
  onReady(fromApp: boolean): void;
  onAttempt(result: AttemptResult): void;
  /** Tab hidden: the audio is suspended until the next tap. */
  onPaused(): void;
}

export interface Checker {
  /** The line to practise against, and which version of it. */
  setTarget(ref: ToneRef, mode: RefMode): void;
  clear(): void;
  recalibrate(): void;
  /** From a tap, after `onPaused`. */
  resume(): void;
  resize(width: number, height: number): void;
  /** Stops the mic and the loop. Safe to call twice. */
  destroy(): void;
}

/**
 * Opens the microphone. Call it synchronously from the tap handler (hard
 * rule 4) — `ensureMic` creates and resumes the AudioContext before its first
 * await. Rejects with a `MicError`; `micErrorMessage` turns it into copy.
 */
export function openMic(): Promise<unknown> {
  return ensureMic();
}

export function micErrorKind(err: unknown): string {
  return err instanceof MicError ? err.kind : "unknown";
}

export function micErrorMessage(err: unknown): string {
  return micErrorCopy(micErrorKind(err));
}

/** The game's own calibration if this device has one, else the quick one. */
function savedBoard(): { cal: QuickCal; fromApp: boolean } | null {
  const app = loadSettings();
  if (app) return { cal: app, fromApp: true };
  const quick = loadQuickCal();
  return quick ? { cal: quick, fromApp: false } : null;
}

/**
 * Starts the checker on an already-open mic (`openMic` resolved). Draws into
 * `canvas`; reports through `events`.
 */
export function startChecker(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number },
  initial: { ref: ToneRef; mode: RefMode },
  events: CheckerEvents,
): Checker {
  let width = size.width;
  let height = size.height;
  let ctx = scaleForDpr(canvas, width, height);
  let mode = initial.mode;
  let word = targetWord(initial.ref, mode);
  let destroyed = false;

  const measureNoise = sessionNoiseMeter();
  let roomFloor: number | null = null;

  // ---- calibration state
  let board = savedBoard();
  let calStep: CalStep | null = null;
  const calTargets = {
    high: targetWord(refFor("1"), "real"),
    low: targetWord(refFor("3"), "real"),
  };
  let calTracker: PitchTracker | null = null;
  let takeF0s: number[] = [];
  let takeRms: number[] = [];
  let highF0s: number[] = [];
  let highRms: number[] = [];
  let voicedMs = 0;
  let lastVoicedAt = -Infinity;

  // ---- checker state
  let tracker: PitchTracker | null = null;
  /** The per-frame core shared with the app's Visualiser. */
  const core = new VisualiserCore(SPAN_MS);
  let hadLive = false;
  let rafId = 0;

  const beginCal = (step: CalStep, retry: boolean) => {
    calStep = step;
    takeF0s = [];
    takeRms = [];
    voicedMs = 0;
    lastVoicedAt = -Infinity;
    events.onCalProgress(0);
    events.onCalStep(step, retry);
  };

  const ready = (fromApp: boolean) => {
    calStep = null;
    tracker = null; // rebuilt on the next frame with the new board
    core.clear();
    events.onReady(fromApp);
  };

  const finishTake = () => {
    if (calStep === "high") {
      highF0s = takeF0s;
      highRms = takeRms;
      beginCal("low", false);
      return;
    }
    const rms = [...highRms, ...takeRms].sort((a, b) => a - b);
    const cal = quickCalibration(
      highF0s,
      takeF0s,
      roomFloor ?? DEFAULT_NOISE,
      rms.length ? rms[Math.floor(rms.length / 2)] : undefined,
    );
    if (!cal) {
      beginCal("high", true);
      return;
    }
    saveQuickCal(cal);
    board = { cal, fromApp: false };
    ready(false);
  };

  const onFrame = (frame: Float32Array, sampleRate: number) => {
    if (destroyed) return;
    const measured = measureNoise(frame, sampleRate);
    if (measured !== null) {
      roomFloor = measured;
      calTracker?.setNoiseFloor(measured);
      tracker?.setNoiseFloor(measured);
    }
    const now = performance.now();

    if (calStep) {
      calTracker ??= new PitchTracker({
        sampleRate,
        f0Center: SEED_F0,
        noiseFloor: roomFloor ?? DEFAULT_NOISE,
        minVoicedRun: tuning().minVoicedRun,
      });
      const p = calTracker.push(frame);
      if (p.voiced && p.f0 !== null) {
        takeF0s.push(p.f0);
        takeRms.push(p.rms);
        voicedMs += (HOP_SAMPLES / sampleRate) * 1000;
        lastVoicedAt = now;
        events.onCalProgress(Math.min(1, voicedMs / CAL_TAKE_MS));
      } else if (voicedMs >= CAL_TAKE_MS && now - lastVoicedAt > CAL_END_SILENCE_MS) {
        finishTake();
      }
      return;
    }

    if (!board) return;
    if (!tracker) {
      const s = board.cal;
      tracker = new PitchTracker({
        sampleRate,
        f0Center: s.f0Center,
        noiseFloor: roomFloor ?? startingNoiseFloor(s.noiseFloor, s.voiceRms),
        minVoicedRun: tuning().minVoicedRun,
        rangeSemitones: s.rangeSemitones,
        rangeDownSemitones: s.rangeDownSemitones,
      });
    }
    const p = tracker.push(frame);
    core.push(p.smoothedChao, p.voiced, now);
  };
  setFrameSink(onFrame);

  const tick = (now: number) => {
    if (destroyed) return;
    const frame = core.step(now, { syllables: word.syllables, free: false });
    const { live, finished } = frame;
    const head = live?.points.at(-1);
    const latest = frame.attempt;
    if (latest) {
      hadLive = false;
      events.onAttempt(scoreAttempt(latest, word, mode));
    } else if (live) {
      if ((head?.tMs ?? 0) >= UNCLEAR_MIN_MS) hadLive = true;
    } else if (hadLive) {
      // A voiced run closed without becoming an attempt: shorter than
      // `minUtteranceMs`. Neutral, never a wrong score (hard rule 8).
      hadLive = false;
      events.onAttempt({ accuracy: null, read: null, syllables: null });
    }

    if (ctx) {
      // During setup the board shows the tone being asked for (a level Tone 1,
      // then a low Tone 3), so a beginner sees what "high" and "low" mean.
      const shown = calStep ? calTargets[calStep] : word;
      drawVisualiser(ctx, width, height, {
        tone: shown.tone,
        word: shown,
        live: calStep ? null : live,
        finished: calStep ? [] : finished,
        spanMs: SPAN_MS,
        chao: frame.chao,
        voiced: !calStep && frame.dotVoiced,
      });
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const onVisibility = () => {
    if (document.visibilityState !== "hidden" || destroyed) return;
    void getMicSession()?.ctx.suspend();
    events.onPaused();
  };
  document.addEventListener("visibilitychange", onVisibility);

  if (board) ready(board.fromApp);
  else beginCal("high", false);

  return {
    setTarget(ref, m) {
      mode = m;
      word = targetWord(ref, m);
      core.clear();
      hadLive = false;
    },
    clear() {
      core.clear();
      hadLive = false;
    },
    recalibrate() {
      clearQuickCal();
      board = null;
      calTracker = null;
      beginCal("high", false);
    },
    resume() {
      const audio = getMicSession()?.ctx;
      if (audio && audio.state === "suspended") void audio.resume();
    },
    resize(w, h) {
      width = w;
      height = h;
      ctx = scaleForDpr(canvas, width, height);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      setFrameSink(null);
      stopMic();
    },
  };
}

/** Stops the mic without a running checker (a Start that never finished). */
export function shutdownMic(): void {
  stopMic();
}
