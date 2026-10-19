/**
 * The tone checker's microphone engine — the ONE site module allowed to touch
 * Web Audio (CLAUDE.md, "Three entries" rule 1). The page imports it only
 * with `import("./checker/engine.ts")` on the first Start tap, so it is a
 * separate chunk and never in the page's initial JS.
 *
 * Same engine as the in-app visualiser, composed from the same shared
 * modules (mic session, PitchTracker, sessionNoise, ContourRecorder, tone
 * accuracy, classifier v2, drawVisualiser); `src/ui/Visualiser.tsx` itself is
 * not imported and not changed. Textbook style only.
 *
 * Pitch runs only while the page is open: frames go to the tracker and are
 * dropped; nothing is recorded or sent (hard rule: no audio leaves the device).
 */

import {
  acquireMicStream,
  ensureMic,
  getMicSession,
  releaseMicStream,
  setFrameSink,
  stopMic,
} from "../../audio/session.ts";
import { MicError } from "../../audio/mic.ts";
import { ContourRecorder, type Contour } from "../../game/contours.ts";
import type { Tone } from "../../game/gates.ts";
import { spokenTones } from "../../game/sandhi.ts";
import { loadSettings } from "../../game/settings.ts";
import { sessionNoiseMeter, startingNoiseFloor } from "../../game/sessionNoise.ts";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { referenceFromWord, toneAccuracyDetail } from "../../game/toneAccuracy.ts";
import { tuning } from "../../game/tuning.ts";
import type { Word } from "../../game/words.ts";
import { PitchTracker } from "../../pitch/PitchTracker.ts";
import { scaleForDpr } from "../../render/canvas.ts";
import { drawVisualiser } from "../../render/visualiser.ts";
import { micErrorCopy } from "../../ui/micErrors.ts";
import { playWord } from "../wordAudio.ts";
import type { CheckerWord } from "./checkerWords.ts";
import {
  clearQuickCal,
  loadQuickCal,
  quickCalibration,
  saveQuickCal,
  type QuickCal,
} from "./quickCal.ts";

export { micErrorCopy };

/** The same span the in-app visualiser draws (`Visualiser.tsx`'s SPAN_MS). */
const SPAN_MS = 1600;
/** Kept attempts on screen, as in the visualiser. */
const MAX_KEPT = 3;
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

export interface AttemptResult {
  /** 0..1, against the word's own recording; null = couldn't hear that. */
  accuracy: number | null;
  /** v2's read, single syllables only. */
  read: { tone: Tone | "none"; confidence: number } | null;
}

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
  setWord(w: CheckerWord): void;
  /** Plays the word; the mic is deaf (and on iOS released) while it plays. */
  listen(w: CheckerWord): Promise<boolean>;
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

/** A `Word` for the shared renderer/scorer, from a checker list entry. */
export function wordOf(w: CheckerWord): Word {
  return {
    id: w.id,
    hanzi: w.hanzi,
    pinyin: w.pinyin,
    speakerId: "jane",
    english: w.english,
    tone: w.tone,
    tones: w.tones,
    syllables: w.tones.length,
    clipKey: "",
    durationS: w.durationS,
    onsetS: w.onsetS,
    clipS: w.clipS,
    polyline: w.polyline,
    minTier: "free",
    updatedAt: "",
    listIds: [],
  };
}

/** What a finished utterance scored against `word` — pure, see engine.test.ts. */
export function scoreAttempt(contour: Contour, word: Word): AttemptResult {
  const accuracy =
    toneAccuracyDetail(contour.points, spokenTones(word), referenceFromWord(word), "textbook")
      ?.accuracy ?? null;
  // The classifier misreads a two-syllable contour (same rule as the app).
  const r = word.syllables === 1 && accuracy !== null ? classifyToneV2(contour) : null;
  return { accuracy, read: r ? { tone: r.tone, confidence: r.confidence } : null };
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
  initial: CheckerWord,
  events: CheckerEvents,
): Checker {
  let width = size.width;
  let height = size.height;
  let ctx = scaleForDpr(canvas, width, height);
  let word = wordOf(initial);
  let deaf = false;
  let destroyed = false;

  const measureNoise = sessionNoiseMeter();
  let roomFloor: number | null = null;

  // ---- calibration state
  let board = savedBoard();
  let calStep: CalStep | null = null;
  let calTracker: PitchTracker | null = null;
  let takeF0s: number[] = [];
  let takeRms: number[] = [];
  let highF0s: number[] = [];
  let highRms: number[] = [];
  let voicedMs = 0;
  let lastVoicedAt = -Infinity;

  // ---- checker state
  let tracker: PitchTracker | null = null;
  const recorder = new ContourRecorder({ maxKept: MAX_KEPT });
  let scoredAt = -1;
  let hadLive = false;
  let displayChao = 3;
  let voiced = false;
  let lastT = performance.now();
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
    recorder.clear();
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
    if (deaf || destroyed) return;
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
    recorder.push(p.smoothedChao, p.voiced, now);
    voiced = p.voiced;
    if (p.voiced) lastVoicedAt = now;
  };
  setFrameSink(onFrame);

  const tick = (now: number) => {
    if (destroyed) return;
    const dt = Math.min(100, now - lastT);
    lastT = now;
    const pair = word.syllables > 1;
    const gapMs = pair ? tuning().multiMergeGapMs : tuning().mergeGapMs;
    recorder.setMergeGapMs(gapMs);
    const live = recorder.live();
    const finished = recorder.finished();
    const head = live?.points.at(-1);
    const holding = pair && head !== undefined && now - lastVoicedAt <= gapMs;
    const target = head && (voiced || holding) ? head.chao : 3;
    displayChao += (target - displayChao) * (1 - Math.exp(-dt / tuning().easeTauMs));

    const latest = finished.at(-1);
    if (latest && latest.startedAtMs !== scoredAt) {
      scoredAt = latest.startedAtMs;
      hadLive = false;
      events.onAttempt(scoreAttempt(latest, word));
    } else if (live) {
      if ((head?.tMs ?? 0) >= UNCLEAR_MIN_MS) hadLive = true;
    } else if (hadLive) {
      // A voiced run closed without becoming an attempt: shorter than
      // `minUtteranceMs`. Neutral, never a wrong score (hard rule 8).
      hadLive = false;
      events.onAttempt({ accuracy: null, read: null });
    }

    if (ctx) {
      drawVisualiser(ctx, width, height, {
        tone: word.tone,
        word,
        live: calStep ? null : live,
        finished: calStep ? [] : finished,
        spanMs: SPAN_MS,
        chao: displayChao,
        voiced: !calStep && (voiced || holding || now - lastVoicedAt <= tuning().graceMs),
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
    setWord(w) {
      word = wordOf(w);
      recorder.clear();
      scoredAt = -1;
      hadLive = false;
    },
    async listen(w) {
      deaf = true;
      recorder.clear();
      scoredAt = -1;
      hadLive = false;
      // iOS plays through the earpiece while the mic is held: release it so
      // the clip comes out of the loud speaker (same dance as the game's cue).
      releaseMicStream();
      try {
        return await playWord(w.id);
      } finally {
        await acquireMicStream();
        recorder.clear();
        deaf = false;
      }
    },
    clear() {
      recorder.clear();
      scoredAt = -1;
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
