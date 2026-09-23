/**
 * The in-app feedback form's one write.
 *
 * Insert-only: `public.feedback` (migration 0022) grants INSERT to `anon` and
 * `authenticated` and nothing else, so the browser can file a row but never
 * read one back. `user_id` is not sent — the column defaults to `auth.uid()`
 * and the policy pins it there.
 *
 * Same contract as the rest of `src/data/`: never throws, resolves `false` on
 * any failure so the form can say "didn't send" instead of breaking.
 */
import type { Tier } from "../game/tiers.ts";
import { getSupabase, warn } from "./supabase.ts";

export const FEEDBACK_MAX_CHARS = 2000;

export interface FeedbackInput {
  message: string;
  /** 1 (😭) … 5 (🤩), or null when the player picked no emoji. */
  rating: number | null;
  /** Which app screen the form was opened from. */
  screen: string;
  tier: Tier;
}

export async function submitFeedback(input: FeedbackInput): Promise<boolean> {
  const message = input.message.trim().slice(0, FEEDBACK_MAX_CHARS);
  if (!message) return false;
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("feedback").insert({
      message,
      rating: input.rating,
      screen: input.screen.slice(0, 40),
      tier: input.tier,
      user_agent: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 400),
    });
    if (error) {
      warn("feedback", "insert failed", error);
      return false;
    }
    return true;
  } catch (err) {
    warn("feedback", "insert threw", err);
    return false;
  }
}
