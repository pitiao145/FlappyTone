/**
 * The landing trial's "Try it now": a short real run, on the landing page.
 *
 * This is mic code, like `src/site/checker/engine.ts`, and follows its rules
 * (ARCHITECTURE.md, "Three entries", rule 1): the page loads it only with a
 * dynamic `import()` on the first tap, and the second tap calls `start`, so
 * `ensureMic` runs inside a gesture (hard rule 4). Nothing here is React
 * state: one rAF loop and one frame sink, like `Game.tsx`, without the HUD,
 * accounts, cues or stats. Dev-only trial for now.
 */
import { ensureMic, setFrameSink, stopMic } from "../../audio/session.ts";
import { MicError } from "../../audio/mic.ts";
import { Run, type RunSnapshot } from "../../game/run.ts";
import { loadSettings, type CalibrationSettings } from "../../game/settings.ts";
import { sessionNoiseMeter, startingNoiseFloor } from "../../game/sessionNoise.ts";
import { tuning } from "../../game/tuning.ts";
import type { Word } from "../../game/words.ts";
import { PitchTracker } from "../../pitch/PitchTracker.ts";
import { scaleForDpr } from "../../render/canvas.ts";
import { drawWorld, lockWorldTheme } from "../../render/world.ts";
import { micErrorCopy } from "../micErrors.ts";

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
}

export interface MiniGameOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  words: Word[];
  /** Ignored when this device already has a calibration. */
  voice: VoicePreset;
  gates: number;
  /** Edge-triggered when the gate being flown changes (null between gates). */
  onWord: (word: Word | null) => void;
  onEnd: (result: MiniResult) => void;
}

export function micErrorKind(err: unknown): string {
  return err instanceof MicError ? err.kind : "unknown";
}

/** Opens the mic (call from a tap) and flies `gates` gates. Returns stop. */
export async function startMiniGame(opts: MiniGameOptions): Promise<() => void> {
  await ensureMic();
  const settings = loadSettings() ?? PRESETS[opts.voice];
  lockWorldTheme("pixel-flappy");

  const run = new Run({
    mode: "game",
    width: opts.width,
    corridor: "wide",
    cueStyle: "off",
    words: opts.words,
    speechStyle: "textbook",
  });

  let tracker: PitchTracker | null = null;
  const measureNoise = sessionNoiseMeter(settings.voiceRms);
  setFrameSink((frame, sampleRate) => {
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
  let lastWordId: string | null | undefined;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    setFrameSink(null);
    stopMic();
    lockWorldTheme(null);
  };

  const count = (snap: RunSnapshot, ...o: string[]) => snap.gateLog.filter((g) => o.includes(g.outcome)).length;

  const tick = (now: number) => {
    run.tickFrame(now - last, now);
    last = now;
    const snap = run.snapshot();
    const ctx = scaleForDpr(opts.canvas, opts.width, opts.height);
    if (ctx) drawWorld(ctx, opts.width, opts.height, snap, now);

    const word = snap.activeGate?.word ?? snap.upcoming?.word ?? null;
    const id = word?.id ?? null;
    if (id !== lastWordId) {
      lastWordId = id;
      opts.onWord(word);
    }

    if (snap.over || snap.gateLog.length >= opts.gates) {
      const result = {
        cleared: count(snap, "perfect", "good", "ok"),
        total: snap.gateLog.length,
        unheard: count(snap, "unheard"),
      };
      stop();
      opts.onEnd(result);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return stop;
}
