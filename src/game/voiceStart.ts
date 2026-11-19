/**
 * Brief 50 quick start: a new player does not calibrate. They pick "lower
 * voice" or "higher voice" once (or the landing demo already did, on this
 * device), the game starts from that preset, and the learned scale (brief 44,
 * `playerRuler.ts`) fits it to their voice while they play, with a faster
 * start (`tuning().gridLearnStart*`).
 *
 * The choice is one word in this browser's storage. Never uploaded (hard rule 12).
 * Nothing here throws (hard rule 10).
 */
import type { CalibrationSettings } from "./settings.ts";

export type VoicePreset = "lower" | "higher";

const KEY = "toneflap.voiceStart.v1";

/**
 * One preset per voice register, centred on typical speaking pitch (about 115
 * and 200 Hz), with a generous range so most voices stay on the grid. The
 * landing demo flies on these too (`miniGame.ts`).
 */
export const VOICE_PRESETS: Record<VoicePreset, CalibrationSettings> = {
  lower: { f0Center: 115, noiseFloor: 0.002, rangeSemitones: 6, rangeDownSemitones: 5 },
  higher: { f0Center: 200, noiseFloor: 0.002, rangeSemitones: 6, rangeDownSemitones: 5 },
};

/** The saved choice on this device, or null. */
export function loadVoiceStart(): VoicePreset | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "lower" || v === "higher" ? v : null;
  } catch {
    return null;
  }
}

export function saveVoiceStart(p: VoicePreset): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // storage blocked: the player is asked again next time
  }
}

/** The settings a quick-start player flies on: the preset, marked as not calibrated. */
export function quickStartSettings(p: VoicePreset): CalibrationSettings {
  return { ...VOICE_PRESETS[p], voice: { gender: p === "lower" ? "male" : "female" }, quickStart: true };
}
