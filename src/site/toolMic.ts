/**
 * Brief 53: the tone visualizer tool's mic and board settings. Loaded with
 * `toolVisualiser.tsx` on the first Start press only, never with the page
 * (hard rule 13): together they replace the old `checker/engine.ts` and its
 * "say mā, then mǎ" calibration. The board comes from this device's game
 * settings when it has them, else from the lower/higher voice choice (brief
 * 50's quick start). Only the choice itself is saved (`saveVoiceStart`,
 * shared with /app on the same origin); the app's settings are never written.
 *
 * No voice leaves the device: frames go to the pitch tracker and are dropped
 * (hard rule 12).
 */
import { MicError } from "../audio/mic.ts";
import { ensurePlaybackCtx } from "../audio/reference.ts";
import { ensureMic, stopMic } from "../audio/session.ts";
import { withLearnedScale } from "../game/playerRuler.ts";
import { loadSettings, type CalibrationSettings } from "../game/settings.ts";
import { tuning } from "../game/tuning.ts";
import { loadVoiceStart, quickStartSettings } from "../game/voiceStart.ts";
import { micErrorCopy } from "../ui/micErrors.ts";

/**
 * Opens the microphone and the cue output. Call it synchronously from the tap
 * handler (hard rule 4): both create and resume their AudioContext before
 * their first await.
 */
export function openMic(): Promise<unknown> {
  void ensurePlaybackCtx();
  return ensureMic("visualizer-tool");
}

/** Stops the mic (leaving the page, or the visualizer unmounting). */
export function closeMic(): void {
  stopMic();
}

export function micErrorKind(err: unknown): string {
  return err instanceof MicError ? err.kind : "unknown";
}

export function micErrorMessage(err: unknown): string {
  return micErrorCopy(micErrorKind(err));
}

/**
 * The board to draw on: the game's own settings on this device (with the
 * learned scale, as /app does), else the quick start from the saved voice
 * choice. Null: the visitor must choose a voice first.
 */
export function toolSettings(): CalibrationSettings | null {
  const app = loadSettings();
  if (app) return tuning().playerRulerV2 ? withLearnedScale(app) : app;
  const voice = loadVoiceStart();
  return voice ? quickStartSettings(voice) : null;
}
