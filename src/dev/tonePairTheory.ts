/**
 * The textbook citation shape for a tone pair, per `docs/tonepairs/
 * mandarin_tone_pairs_technical_reference.md` — Section 2's Chao 5-level
 * citation values and Section 3's sandhi rules. Used only to draw a
 * reference overlay in the dev Lab's "tone pairs" tab, next to the
 * *measured* contour, so the two can be compared by eye. Not part of any
 * shipped pipeline and not sandhi-aware beyond what that doc covers (no
 * neutral tone, no 一/不 sandhi).
 */

import type { Tone } from "../game/gates.ts";
import type { Polyline } from "../game/tuning.ts";

/**
 * A tone's citation shape in isolation, chao 1–5, t in [0,1] within its own
 * half. A straight two-point line between a tone's start and end value is
 * the textbook *value* pair (e.g. "35", "51") but not how the movement is
 * actually paced — a real tone reaches its target well before the syllable
 * ends and holds there (exactly what `DEFAULT_POLYLINES` in `tuning.ts`
 * measures off real recordings). These add that same early-move-then-hold
 * shape so a rendered "35" doesn't read as a slow, even ramp across the
 * whole syllable when a real one is closer to "hold low, then rise fast
 * near the end."
 */
const CITATION_SHAPES: Record<Tone, Polyline> = {
  1: [[0, 5], [1, 5]],
  2: [[0, 3], [0.7, 3], [1, 5]],
  3: [[0, 2], [0.3, 1], [0.5, 1], [1, 4]],
  4: [[0, 5], [0.3, 1], [1, 1]],
};

/**
 * Rule A: half-3rd — drop 2→1, no return to 4 (§3, "3rd + anything but
 * 3rd"). The drop itself is fast (reached by 30% of the syllable, the same
 * pace `CITATION_SHAPES[3]`'s own fall uses), then held only briefly — NOT
 * all the way to the syllable's own end. `textbookTonePairPolyline` splices
 * this straight into the transition toward syllable 2's start value, so a
 * hold that runs to relT=1 leaves no room before that jump and the whole
 * rise gets crammed into the short co-articulation window as a near-vertical
 * spike. Ending the hold at relT=0.5 instead lets the spline carry the climb
 * across most of the co-articulation gap, not just inside it.
 */
const HALF_THIRD: Polyline = [[0, 2], [0.3, 1], [0.5, 1]];

/** Rule C: half-4th — drop 5→3 fast, then a brief hold (§3, "4th + 4th"), same reasoning as `HALF_THIRD`. */
const HALF_FOURTH: Polyline = [[0, 5], [0.3, 3], [0.5, 3]];

/**
 * Syllable 1's effective shape given what follows it — the only syllable
 * whose citation contour a sandhi rule ever changes (§3):
 *
 * - Rule B (3+3): syllable 1 becomes a 2nd tone (35).
 * - Rule A (3 + not-3): syllable 1 becomes the half-3rd (21).
 * - Rule C (4+4): syllable 1 becomes the half-4th (53).
 * - Otherwise: its own ordinary citation shape.
 */
function effectiveFirstShape(tone1: Tone, tone2: Tone): Polyline {
  if (tone1 === 3) return tone2 === 3 ? CITATION_SHAPES[2] : HALF_THIRD;
  if (tone1 === 4 && tone2 === 4) return HALF_FOURTH;
  return CITATION_SHAPES[tone1];
}

/** Where syllable 1 ends and syllable 2 begins — §6's coordinate system. */
const SYLLABLE_1_END = 0.45;
const SYLLABLE_2_START = 0.55;

/**
 * The full-word textbook polyline for a tone pair: syllable 1's (possibly
 * sandhi-adjusted) shape compressed into [0, 0.45], syllable 2's own
 * citation shape into [0.55, 1], with the short co-articulation gap between
 * them left as a straight transition — exactly §6's own worked examples.
 */
export function textbookTonePairPolyline(tone1: Tone, tone2: Tone): Polyline {
  const first = effectiveFirstShape(tone1, tone2);
  const second = CITATION_SHAPES[tone2];
  const line: Polyline = [];
  for (const [relT, chao] of first) line.push([relT * SYLLABLE_1_END, chao]);
  for (const [relT, chao] of second) {
    line.push([SYLLABLE_2_START + relT * (1 - SYLLABLE_2_START), chao]);
  }
  return line;
}
