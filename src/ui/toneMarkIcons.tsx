/**
 * Tone-mark glyphs for the HUD's pronunciation clue.
 *
 * Tones 1–4 and neutral reuse `toneIcons.tsx`'s existing traced marks
 * (`TONE_PATHS`/`NEUTRAL_TONE_PATH`) — the same glyphs the visualiser's tone
 * picker uses — for visual consistency across the app, rather than a second,
 * differently-drawn set. `half3` is genuinely new (that shape doesn't exist
 * anywhere else in the app): a short low dip with no rise, drawn as a stroke
 * in the same 120x90 coordinate space so it sits at the same size and weight
 * as the traced set. See `src/game/sandhi.ts` for why half3 needs its own
 * shape rather than reusing T3's.
 */

import type { SandhiTone } from "../game/sandhi.ts";
import { NEUTRAL_TONE_PATH, TONE_PATHS, type ToneOrNeutral } from "./toneIcons.tsx";

/**
 * Hand-drawn to match the traced set's coordinate space (120x90, the same
 * dip starting point T3's own path uses) rather than vector-traced from a
 * recording — there is no reference clip for a shape that never gets its
 * own corridor (see sandhi.ts's doc comment: this is a labeling glyph, not
 * a scoring one).
 */
const HALF_THIRD_PATH = "M14,44 C 46,64 70,74 80,74 L106,74";

function TracedToneMark({ tone }: { tone: ToneOrNeutral }) {
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <path d={tone === 0 ? NEUTRAL_TONE_PATH : TONE_PATHS[tone]} fill="currentColor" />
    </svg>
  );
}

function HalfThirdMark() {
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <path
        d={HALF_THIRD_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * User-with-sound-waves glyph, marking the tone-mark row as "say it like
 * this." — the exact icon supplied for this feature.
 */
export function ToneClueSpeakerIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <circle
        cx="108"
        cy="108"
        r="60"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
      />
      <path
        d="M24,208c20.55-24.45,49.56-40,84-40s63.45,15.55,84,40"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
      />
      <path
        d="M229.36,56a132.39,132.39,0,0,1,0,104"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
      />
      <path
        d="M196,69.57a96.3,96.3,0,0,1,0,76.86"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
      />
    </svg>
  );
}

/** Renders the glyph for one sandhi-adjusted tone value. */
export function ToneMarkIcon({ tone }: { tone: SandhiTone }) {
  return tone === "half3" ? <HalfThirdMark /> : <TracedToneMark tone={tone} />;
}
