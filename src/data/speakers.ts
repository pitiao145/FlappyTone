/**
 * The speaker roster.
 *
 * Obeys `supabase.ts`'s first rule without exception: **nothing here throws
 * into a caller, and nothing here returns an empty roster.** A player with no
 * network must still hear a voice, so every failure resolves to the bundled
 * floor below rather than to nothing — an empty roster would resolve to no
 * speaker at all, which is a game with no reference audio.
 *
 * The roster is read once per session and memoised: it changes when a voice is
 * added, which is a deploy-scale event, not something a running tab needs to
 * notice.
 */
import { getSupabase, warn } from "./supabase.ts";
import { DEFAULT_SPEAKER_ID } from "./catalogRows.ts";
import type { Gender, Speaker } from "../game/voice.ts";

/**
 * The floor. Jane is the whole inventory today, so this is not a degraded
 * experience — it is the same roster the database holds, minus the ability to
 * learn about a voice added since this build.
 */
const BUNDLED: Speaker[] = [
  {
    id: DEFAULT_SPEAKER_ID,
    name: "Jane",
    gender: "female",
    accent: "tw",
    isDefault: true,
    active: true,
  },
];

/** The roster, or the bundled floor. Never throws, never returns empty. */
export async function fetchSpeakers(): Promise<Speaker[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) return BUNDLED;
    const { data, error } = await supabase
      .from("speakers")
      .select("id,name,gender,accent,is_default,active");
    if (error || !data?.length) {
      warn("speakers", `roster read failed: ${error?.message ?? "empty"}`);
      return BUNDLED;
    }
    return data.map((r) => ({
      id: r.id,
      name: r.name,
      gender: r.gender as Gender,
      accent: r.accent,
      isDefault: r.is_default,
      active: r.active,
    }));
  } catch (err) {
    warn("speakers", "roster read threw", err);
    return BUNDLED;
  }
}

let cached: Promise<Speaker[]> | null = null;

/**
 * The roster, fetched at most once per session. Callers that only want to
 * resolve a preference should use this rather than `fetchSpeakers`, so the
 * calibration screen, Settings and app start share one round trip.
 */
export function loadRoster(): Promise<Speaker[]> {
  cached ??= fetchSpeakers();
  return cached;
}
