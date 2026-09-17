/**
 * Resolving a stored voice preference to an active speaker.
 *
 * Pure — no `src/data/` import. This is read by game code and the UI, and
 * must not drag the Supabase graph into either.
 */
import { tuning } from "./tuning.ts";

export type Gender = "female" | "male";

export interface Speaker {
  id: string;
  name: string;
  gender: Gender;
  accent: string;
  isDefault: boolean;
  active: boolean;
}

export interface VoicePref {
  gender?: Gender;
}

/**
 * Resolves a stored preference to one active speaker, or the active default
 * when nothing on the roster names one:
 *
 * - No preference at all: the active default (or null if none is active).
 * - Exactly one active speaker matches the preference's axis: that speaker.
 * - Zero matches: nobody active fits, fall back to the default.
 * - More than one match: the preference does not name a specific speaker —
 *   picking arbitrarily would make the voice a player hears depend on row
 *   order — fall back to the default.
 *
 * Never returns an inactive speaker, even the default. An empty roster
 * returns null rather than throwing.
 */
export function resolveSpeaker(roster: Speaker[], pref: VoicePref | null): Speaker | null {
  const active = roster.filter((s) => s.active);
  const fallback = active.find((s) => s.isDefault) ?? null;
  if (!pref?.gender) return fallback;
  const matches = active.filter((s) => s.gender === pref.gender);
  return matches.length === 1 ? matches[0] : fallback;
}

/** Guesses a gender axis from a measured f0 centre, against the tunable threshold. */
export function guessGender(f0Center: number): Gender {
  return f0Center < tuning().voiceMatchF0Hz ? "male" : "female";
}
