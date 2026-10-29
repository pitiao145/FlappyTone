/**
 * The landing trial's "Try it now": a short real run, on the landing page.
 *
 * This is mic code, like `src/site/checker/engine.ts`, and follows its rules
 * (ARCHITECTURE.md, "Three entries", rule 1): the page loads it only with a
 * dynamic `import()` on the first tap, and the second tap calls `start`, so
 * `ensureMic` runs inside a gesture (hard rule 4). Nothing here is React
 * state: one rAF loop and one frame sink, like `Game.tsx`, without the HUD,
 * accounts or stats.
 *
 * Cues work as in the game ("listen", then fly), but play through the site's
 * guest-ticket `wordAudio.ts`, not `src/audio/reference.ts`, whose ticket
 * pulls in the account code. Every word comes from `sampler-beginner` (the
 * app's guest pool), so a guest ticket plays it. No iOS loud-speaker dance: cues take the earpiece
 * route there, like Chrome on iOS does in the game.
 */
import { ensureMic, setFrameSink, stopMic } from "../../audio/session.ts";
import { MicError } from "../../audio/mic.ts";
import { Run, type RunSnapshot } from "../../game/run.ts";
import type { RunStats } from "../../game/scoring.ts";
import type { Tone } from "../../game/gates.ts";
import { loadSettings, type CalibrationSettings } from "../../game/settings.ts";
import { sessionNoiseMeter, startingNoiseFloor } from "../../game/sessionNoise.ts";
import { tuning } from "../../game/tuning.ts";
import type { Word } from "../../game/words.ts";
import { PitchTracker } from "../../pitch/PitchTracker.ts";
import { scaleForDpr } from "../../render/canvas.ts";
import { drawWorld, lockWorldTheme } from "../../render/world.ts";
import { micErrorCopy } from "../micErrors.ts";
import { clipUrl, playWord, stopWord, unlockAudio } from "../../site/wordAudio.ts";

export { micErrorCopy };

export type VoicePreset = "lower" | "higher";

/**
 * Calibration for a visitor who never calibrated: one preset per voice
 * register, centred on typical speaking pitch (about 115 Hz and 200 Hz) with
 * a generous range, so most voices stay on the grid without the calibration
 * screen. A device that has calibrated in /app uses its own numbers.
 */
const PRESETS: Record<VoicePreset, CalibrationSettings> = {
  lower: { f0Center: 115, noiseFloor: 0.002, rangeSemitones: 6, rangeDownSemitones: 5 },
  higher: { f0Center: 200, noiseFloor: 0.002, rangeSemitones: 6, rangeDownSemitones: 5 },
};

export function hasSavedCalibration(): boolean {
  return loadSettings() !== null;
}

export interface MiniResult {
  /** Gates flown through (perfect, good or ok). */
  cleared: number;
  /** Gates flown. */
  total: number;
  /** Gates we could not hear: neutral, never counted against the player (hard rule 8). */
  unheard: number;
  /** The run's real stats, as `Run` built them: what the end screen shows. */
  stats: RunStats;
  /** Single-syllable gates per tone: flown, and flown through. For tracking. */
  perTone: Record<Tone, { gates: number; cleared: number }>;
}

/**
 * Which of the game's run modes to fly. "game" flies `words` in exactly that
 * order (Try it now's rounds); "drill" and "pairs" are the game's own Tone
 * Drill and Tone Pairs runs, drawing from `words` as the pool.
 */
export type MiniMode =
  | { mode: "game" }
  | { mode: "drill"; drillTone: Tone }
  | { mode: "pairs"; pairCombo: Tone[] | null };

export interface MiniGameOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** The round's words ("game"), or the pool a drill/pairs run draws from. */
  words: Word[];
  /** Default: `{ mode: "game" }`. */
  run?: MiniMode;
  /** Ignored when this device already has a calibration. */
  voice: VoicePreset;
  gates: number;
  /** Edge-triggered when the gate being flown changes (null between gates). */
  onEnd: (result: MiniResult) => void;
  /** Every cue clip has loaded (or timed out); the run starts now. */
  onReady: () => void;
}

export interface MiniGame {
  stop: () => void;
  /** The live run state, for the host's HUD poll. Never per frame in React. */
  snapshot: () => RunSnapshot;
}

/** Longest we hold the start for clips; a slow one falls back to silence. */
const PRELOAD_MAX_MS = 8000;

export function micErrorKind(err: unknown): string {
  return err instanceof MicError ? err.kind : "unknown";
}

/** Opens the mic (call from a tap), loads every cue, then flies `gates` gates. */
export async function startMiniGame(opts: MiniGameOptions): Promise<MiniGame> {
  // Inside the tap, before any await: lets later cue clips play on iOS.
  unlockAudio();
  await ensureMic();
  // Every cue loads before the first gate, so no gate flies in silence.
  await Promise.race([
    Promise.all(opts.words.map((w) => clipUrl(w.id))),
    new Promise((done) => setTimeout(done, PRELOAD_MAX_MS)),
  ]);
  const settings = loadSettings() ?? PRESETS[opts.voice];
  lockWorldTheme("pixel-flappy");

  const kind = opts.run ?? { mode: "game" };
  const run = new Run({
    mode: kind.mode,
    width: opts.width,
    corridor: "wide",
    cueStyle: "pause",
    cueDurationMsFor: (word) => (word?.clipS ?? 0.8) * 1000,
    words: opts.words,
    speechStyle: "textbook",
    ...(kind.mode === "game"
      ? // Exactly these words, in this order: no repeats within a round.
        { wordSequence: opts.words }
      : kind.mode === "drill"
        ? { drillTone: kind.drillTone }
        : { pairCombo: kind.pairCombo }),
  });

  let tracker: PitchTracker | null = null;
  const measureNoise = sessionNoiseMeter(settings.voiceRms);
  /** The cue plays through the speaker; the mic must not fly it. */
  let cueAudibleUntil = 0;
  let lastCueX = -Infinity;
  setFrameSink((frame, sampleRate) => {
    if (performance.now() < cueAudibleUntil) return;
    tracker ??= new PitchTracker({
      sampleRate,
      f0Center: settings.f0Center,
      noiseFloor: startingNoiseFloor(settings.noiseFloor, settings.voiceRms),
      minVoicedRun: tuning().minVoicedRun,
      rangeSemitones: settings.rangeSemitones,
      rangeDownSemitones: settings.rangeDownSemitones,
    });
    const measured = measureNoise(frame, sampleRate);
    if (measured !== null) tracker.setNoiseFloor(measured);
    run.tickAudio(tracker.push(frame), performance.now());
  });

  let raf = 0;
  let last = performance.now();
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    setFrameSink(null);
    stopWord();
    stopMic();
    lockWorldTheme(null);
  };

  const CLEARED = ["perfect", "good", "ok"];
  const count = (snap: RunSnapshot, ...o: string[]) => snap.gateLog.filter((g) => o.includes(g.outcome)).length;
  const perTone = (snap: RunSnapshot): MiniResult["perTone"] => {
    const out = { 1: { gates: 0, cleared: 0 }, 2: { gates: 0, cleared: 0 }, 3: { gates: 0, cleared: 0 }, 4: { gates: 0, cleared: 0 } };
    for (const g of snap.gateLog) {
      if (g.tones.length !== 1 || !(g.tone in out)) continue;
      const t = out[g.tone as Tone];
      t.gates++;
      if (CLEARED.includes(g.outcome)) t.cleared++;
    }
    return out;
  };

  const tick = (now: number) => {
    run.tickFrame(now - last, now);
    last = now;
    const snap = run.snapshot();
    const ctx = scaleForDpr(opts.canvas, opts.width, opts.height);
    if (ctx) drawWorld(ctx, opts.width, opts.height, snap, now);

    if (snap.cue && snap.cue.xStart > lastCueX) {
      lastCueX = snap.cue.xStart;
      const cueWord = snap.cue.word;
      cueAudibleUntil = now + snap.cue.durationMs + 150;
      if (cueWord) void playWord(cueWord.id);
    }

    if (snap.over || snap.gateLog.length >= opts.gates) {
      const result: MiniResult = {
        cleared: count(snap, ...CLEARED),
        total: snap.gateLog.length,
        unheard: count(snap, "unheard"),
        stats: snap.stats,
        perTone: perTone(snap),
      };
      stop();
      opts.onEnd(result);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  opts.onReady();
  last = performance.now();
  raf = requestAnimationFrame(tick);
  return { stop, snapshot: () => run.snapshot() };
}
