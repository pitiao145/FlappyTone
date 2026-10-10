/**
 * Live-tunable game constants.
 *
 * Every number the dev Lab can move lives here rather than as a module
 * constant, so a tuning session does not need an edit-save-reload cycle and a
 * run can be re-tuned while it is being flown. The defaults are exactly the
 * values that were previously hard-coded, and production never calls
 * `setTuning`, so nothing changes for a player until a default below is edited.
 *
 * Pure: no Web Audio, no React, no canvas. The modules that used to own these
 * constants still export them, at their default values, so tests and docs keep
 * their names — but runtime code reads `tuning()`.
 */

import type { Tone } from "./gates.ts";

/** A corridor centreline: (t, chao) control points, ascending in t over [0,1]. */
export type Polyline = Array<[number, number]>;

/**
 * Corridor centrelines as (t, chao) control points, measured from a native
 * speaker's citation takes in `fixtures/captures/jane_ma*.wav`.
 *
 * These are now read off the *shipped reference clips* — `npm run
 * make-ref-clips` cuts `public/ref/ma{1-4}.wav` from those same captures and
 * prints the contour over each clip's own timeline, which is the timeline the
 * demo dot sweeps. Example and target therefore agree by construction: the
 * player hears a contour, watches the dot trace that contour, and is scored
 * against it. Before this they were three different things.
 *
 * `t` is normalised over `GATE_DURATION_S[tone]`, which equals the clip length,
 * so a control point at t=0.3 is 30% of the way through what the player heard.
 *
 * Every contour completes before t=1 and then holds its final chao. That tail
 * is load-bearing: a speaker who finishes a rise and sustains the note was
 * otherwise left above a corridor still climbing underneath her. The clips'
 * own trailing release (T2 falls back to ~3.0 after its peak) is deliberately
 * *not* modelled — releasing is not part of the tone, and scoring it would
 * punish holding.
 *
 * Editable from the dev Lab's shapes tab, which is how "some of them look a
 * bit funky" gets answered with a change rather than an argument. Whatever the
 * corridor is, the demo dot sweeps the same function, so example and target
 * cannot drift apart.
 *
 * These replaced the PRD §6 table, which was drawn from the shapes of the tone
 * *marks* rather than from speech. Real tones are not constant-rate ramps: they
 * hold, then move fast. Her T4 sits at the top for ~60% of the syllable and
 * then drops in ~170ms; the PRD's linear 5→1 glide across the whole gate asked
 * her to fall at roughly 17 st/s when she actually falls at ~95 st/s (the same
 * figure the slew clamp in PitchTracker.ts is set from). No tone she produced
 * could fit that corridor, and a run of 22 gates bore it out — she cleared 90%
 * of T1, the only corridor that demands no particular rate, and 8% of the rest.
 *
 * Caveat on the evidence: one speaker, one syllable (`ma`), citation register.
 * That is thin, and it is still a large improvement on a hand-drawn diagram.
 * Widen it with more speakers and syllables before treating these as settled.
 *
 * Fixed at a 2/3/4/3-vertex template per tone, printed by `npm run
 * make-ref-clips` via `templateContour` — the same function every recorded
 * word's own polyline goes through, so the tutorial/fallback shapes and the
 * 120-word inventory are built by one rule. `corridorChaoAt` then interpolates
 * these with a smooth (monotone cubic) spline, not straight segments — see
 * its doc comment in gates.ts.
 */
export const DEFAULT_POLYLINES: Record<Tone, Polyline> = {
  // Flat, and at 4.58 rather than a textbook 5 — that is where she actually
  // holds a high level tone.
  1: [
    [0, 4.584],
    [1, 4.584],
  ],
  // Dips well below its start before climbing, and holds the peak it reaches
  // rather than the release that follows it.
  2: [
    [0, 2.989],
    [0.2788, 1.832],
    [1, 5],
  ],
  // Falls to the floor, then a real sample partway up the rise, then holds
  // the peak — the low dip is the part a two-segment polyline had no room for.
  3: [
    [0, 2.234],
    [0.5465, 1.185],
    [0.7715, 2.751],
    [1, 5],
  ],
  // Reaches a peak early, then falls to the floor and holds it.
  4: [
    [0, 4.7],
    [0.6024, 5],
    [1, 1.213],
  ],
};


export interface Tuning {
  // ---- pacing
  /** Base world scroll speed in px/s before ramp (PRD §6). */
  baseScrollSpeed: number;
  /** Base corridor half-height as a fraction of canvas height. */
  baseToleranceH: number;
  /** Rest interval between gates at the start of a run, in ms. */
  baseRestMs: number;
  /** Floor the difficulty ramp may shrink `baseRestMs` to. */
  restMsFloor: number;
  /**
   * Still beat after the demo trace, before the world resumes.
   *
   * This is the player's preparation window: the dot has stopped, the corridor
   * has not moved, and nothing is being scored yet. Raised from 450ms once the
   * inventory became 120 words — a one-syllable game only ever asked for `ma`,
   * and some of these words need a moment to get the mouth ready for before
   * the tone starts.
   *
   * Deliberately this knob rather than `cueApproachMs`: that one buys the same
   * time by firing the cue further out, which also pushes the corridor further
   * right while the demo is drawn over it. At 700ms the gate's start already
   * sits ~154px ahead of the dot on a 420px canvas, so a long word's trace runs
   * off the edge. The freeze costs nothing on screen.
   */
  cuePauseHoldMs: number;
  /**
   * Leading delay before a cue's audio plays when the host releases the mic for
   * it (iOS loud-speaker fix — docs/flappytone-SPEC-ios-audio-routing.md). After
   * the mic's MediaStream is stopped, iOS clings to the earpiece route for a few
   * hundred ms before flipping the process route to the built-in speaker; play
   * the clip before that and it still comes out the earpiece. Sits entirely
   * inside the frozen "listen" window, so it costs no gameplay time. Only
   * applied when `releaseMicForCue` is set (iOS); 0 elsewhere. Measured/tuned on
   * a real iPhone — the default is a conservative starting point.
   */
  cueReleaseMs: number;
  /**
   * The bird's fixed horizontal position, as a fraction of canvas width.
   *
   * This is half of the call-and-response beat, and the cheap half. The gap
   * between the demo ending and the corridor arriving is `cueApproachMs` of
   * travel, and buying more of it by firing the cue earlier also pushes the
   * gate rightward on screen until a long word's corridor runs off the edge.
   * Moving the bird left buys the same runway without moving the gate: the
   * corridor is drawn at its real position either way, so the space has to
   * come from somewhere, and the left of the screen is holding a trail that is
   * already clipped.
   *
   * Costs trail: at 165px/s the last 1.5s is 248px against the ~76px to the
   * left of the bird here, so the trace was being cut off long before this
   * moved. What is left is the recent part, which is the part being compared
   * to the corridor.
   */
  birdXFrac: number;
  /**
   * How much travel is left between the end of the freeze
   * and the corridor reaching the bird. This is the call-and-response beat —
   * see spec B3. 0 means the gate arrives the instant the world resumes.
   */
  cueApproachMs: number;

  // ---- judging
  /** Continuous ms outside the corridor before it counts as a wall. */
  collisionSustainMs: number;
  /** How far out of step with the corridor a correct attempt may be. */
  timingSlackS: number;
  /** Cap on timing widening, as a multiple of the gate's base tolerance. */
  maxTimingWidenFactor: number;
  /**
   * Blur radius, in seconds of gate time, over the timing widening.
   *
   * The widening is a max over a window and is therefore cuspy; the renderer
   * draws it, so each cusp was a spike on the corridor wall. Applied after the
   * max, so it can only round a peak, never open the corridor wider than the
   * max found. 0 restores the old, peaky walls exactly.
   */
  slackSmoothS: number;
  /** How far back a gate reaches for an utterance begun before it opened. */
  preGateBufferMs: number;
  /** A voiced run shorter than this is not an attempt. */
  minUtteranceMs: number;
  /** Voiced runs separated by less than this are one utterance. */
  mergeGapMs: number;
  /**
   * `mergeGapMs`'s multi-syllable counterpart — the gap a two-syllable
   * attempt's own pause between syllables must fit inside to still read as
   * one utterance. Wider than the single-syllable default on purpose: a
   * deliberate pause between two syllables is not the same signal as a
   * within-syllable creak gap, and a single-syllable-tuned value would split
   * a perfectly good pair attempt into two "couldn't hear that" runs.
   */
  multiMergeGapMs: number;
  /**
   * Classic `game` mode's `wordMix: "all"` setting: the chance, per gate,
   * that the queue draws a multi-syllable word instead of a single one. Only
   * consulted when `wordMix === "all"` — `"single"`/`"multi"` bypass the
   * roll entirely. 0.5 is an even mix, not a measured value; retune from the
   * Lab once pairs have been flown in the classic mode.
   */
  multiGateChance: number;
  /**
   * Points multiplier for a multi-syllable (pairs) gate's outcome, on top of
   * the ordinary combo multiplier — a pair gate is objectively harder (wider
   * tolerance across both tones, and the tone-mismatch classifier/boost are
   * both off for it, see CLAUDE.md's "Tone pairs") but scored the same as a
   * single syllable until this was added. A flat multiplier on
   * `BASE_POINTS[outcome]` rather than a fixed bonus: it scales with outcome
   * quality (a perfect pair earns more extra than an "ok" one) and rewards
   * flying a pair well rather than flying many of them, which matters since
   * a free/guest tier's smaller word pool means fewer pair attempts.
   *
   * 3.0, echoing the combo ladder's own cap (×3) — not a coincidence: a pair
   * gate's accuracy is scored purely off corridor tracking (the
   * classifier's mismatch-collision and accuracy boost are both off for
   * `syllables > 1`, see CLAUDE.md's "Tone pairs"), and averaging error
   * across two syllables' worth of frames routinely drags a genuinely clean
   * attempt down to "ok" rather than "perfect"/"good". A 1.5× first attempt
   * left an "ok" pair (50 base) at 75 points — still far below a single
   * "good" (150) — so this compensates for the *tier* a pair tends to land
   * in, not just for it deserving a bonus at whatever tier it lands in. Not
   * a measured value, retune from the Lab once pairs have actually been
   * flown at scale.
   */
  pairScoreMultiplier: number;

  // ---- tone accuracy (src/game/toneAccuracy.ts) — learning metric, never the score
  /**
   * Weight of shape — correlation of the player's utterance with the
   * reference, clamped at 0 — in tone accuracy. The reference is the tone's
   * average (single syllable) or the exact combo's average (pair).
   */
  toneAccShapeWeight: number;
  /** Weight of movement size: player range ÷ reference range, penalised both ways (`min(r, 1/r)`). */
  toneAccMovementWeight: number;
  /** Weight of height: mean absolute chao distance from the reference, 0 → 1, `toneAccHeightZeroChao` → 0. */
  toneAccHeightWeight: number;
  /**
   * Weight of the T2/T3 cue, single-syllable T2 and T3 targets only: how far
   * the classifier's T2-vs-T3 vote (drop, low point, drop share, shape) sits
   * toward the target. Shape correlation alone can't tell these two apart —
   * their averages correlate 0.73 — so without this a T2 said for a T3 would
   * keep most of its accuracy.
   */
  toneAccT23Weight: number;
  /** Mean chao distance from the reference at which the height part reaches 0. */
  toneAccHeightZeroChao: number;
  /**
   * A reference moving less than this (chao range) is judged as a level
   * tone: flatness and height only, no correlation — a level line has no
   * shape to correlate against. Tone 1, and a 1+1 pair.
   */
  toneAccFlatTargetChao: number;
  /**
   * An attempt moving less than this on a tone that does move scores near 0
   * whatever its correlation: the correlation of a flat, noisy line is
   * meaningless. Below it, accuracy is at most `toneAccFlatAttemptMax`,
   * scaled by how much it did move.
   */
  toneAccFlatAttemptChao: number;
  /** The ceiling for a near-flat attempt on a moving tone (see `toneAccFlatAttemptChao`). */
  toneAccFlatAttemptMax: number;

  // ---- tone classifier
  /**
   * Below this score, `classifyTone` reports "none" rather than picking a
   * winner — the shape didn't resemble any of the four tones closely enough
   * to call. See `src/game/toneClassifier.ts`. Standalone from gate judging:
   * nothing here feeds `scoreGate`.
   */
  toneClassifierMinConfidence: number;
  /**
   * Fraction of the contour's own span (by time) dropped from the front
   * before any processing — small on purpose, just enough to clear a click
   * or brief silence right at the very start. A bigger shared cut risked
   * shaving into genuine early signal (T3's dip starts early); tones that
   * need more onset protection get their own dedicated window instead (see
   * `toneClassifierT1TailFraction`).
   */
  toneClassifierOnsetTrimFraction: number;
  /**
   * The chao-excursion at which a shape counts as "definitely not flat", for
   * tone 1's continuous confidence score (1 at zero excursion, 0 at or past
   * this value), judged only over the last `toneClassifierT1TailFraction` of
   * the sample. T1 has no correlation to compute — its target is level — so
   * this is what lets it compete against T2–T4's correlation scores on equal
   * footing instead of a binary flat/not-flat gate.
   */
  toneClassifierFlatnessScaleChao: number;
  /**
   * How much of the sample's *end* tone 1's flatness score is judged over —
   * the voice may still be settling early on even after the onset trim, so
   * only the tail (where it's had time to settle) is checked. 0.45 = the
   * last 45%.
   */
  toneClassifierT1TailFraction: number;
  /**
   * The winning score must beat the runner-up by at least this much, or the
   * attempt is "none" (ambiguous) rather than a confident pick — a near-tie
   * between two tones is not a confident read of the winner, even if the
   * winner alone clears `toneClassifierMinConfidence`.
   */
  toneClassifierMarginThreshold: number;
  /**
   * T2 vs T3 is decided by four votes, each placed on the line from the T2
   * average (-1) to the T3 average (+1): how far the voice drops before its
   * low point, how low that point is, what share of the whole movement the
   * drop is, and which of the two averaged shapes it correlates with more. See
   * `t2t3Cue` in `toneClassifier.ts`. A mean vote inside ±this reads "none"
   * — too close to the midpoint between the two averages to name either.
   */
  toneClassifierT23DeadZone: number;
  /**
   * A T2↔T3 read only costs a heart (`isDrasticToneMismatch`) when the vote
   * is at least this far from the midpoint. Deliberately wider than
   * `toneClassifierT23DeadZone`: naming the tone in the visualiser or
   * granting the boost can afford a close call, taking a heart cannot.
   * Measured on Jane's 211 single-syllable textbook clips under simulated
   * miscalibration, jitter, dropouts and creak (28 Sep 2026): 0.5 held
   * wrongful wall hits at or below the old classifier's.
   */
  toneMismatchMinT23Cue: number;
  /**
   * …and only when no single cue votes for the *other* tone by this much or
   * more. A heart needs the cues to agree, not just to outvote: an 80ms-late
   * fallback T3 (`run.test.ts`'s timing-slack case) loses the top of its fall,
   * so drop, drop share and shape all say T2 while its low point says T3 at
   * full strength — that used to cost a correct speaker a heart.
   */
  toneMismatchMaxT23Dissent: number;
  /**
   * A T2↔T3 read never costs a heart when the voiced contour has an internal
   * gap at least this long — creak concentrates in Tone 3's low point and
   * goes unvoiced, so the one part that separates T3 from T2 is exactly what
   * is missing. CLAUDE.md rule 8: unclear signal is never scored wrong.
   */
  toneMismatchMaxGapMs: number;
  /**
   * When true, a confident classifier read that is *drastically* wrong —
   * T1/T4 confused with any other tone, or a confident T2↔T3 mixup — forces
   * the gate to a wall-style collision (heart lost, gate scores 0). See
   * `isDrasticToneMismatch` in `src/game/scoring.ts`.
   *
   * On by default (25 Aug 2026), enabled directly off a played-back Lab
   * session: correct-shape T2/T3 attempts into the wrong gate were caught
   * reliably in practice. Known, accepted gaps remain — not fixed, just
   * outweighed by that result for now:
   *
   * - A shape with the *exact* corridor timing, shifted ~80ms late, can
   *   still read as a confident wrong tone (`trimOnset`/`resample`
   *   normalize against the contour's own span, so a shift alters what the
   *   classifier sees). See "clears a contour that is a beat late" in
   *   `run.test.ts`.
   * - A brief off-corridor wobble too short to be a real wall hit can read
   *   as a confident tone mismatch on its own (a short blip inside T1's
   *   tail-judging window, or T3's normal creaky/silent onset misread as
   *   T2) — see the "isolated from the classifier's mismatch-collision
   *   feature" tests in `run.test.ts` for the specific shapes.
   *
   * A softer sibling — capping (not colliding) any mismatch, drastic or not
   * — existed earlier and was removed (26 Aug 2026): it fired on far more
   * borderline cases than this drastic-only check, was never separately
   * validated in play, and this feature already covers the misses that
   * actually matter.
   */
  toneMismatchCollisionEnabled: boolean;
  /**
   * When true, `run.ts` runs `applyClassifierBoost` on every scored,
   * non-collision gate: a confident classifier read of the *correct* tone
   * can raise accuracy/outcome, not just lower it — see the function's doc
   * comment in `scoring.ts`. Unlike `toneMismatchCollisionEnabled`, a false
   * positive here only over-rewards rather than costing a heart, so this
   * ships on by default.
   */
  toneClassifierBoostEnabled: boolean;
  /**
   * Two extra T2/T3 votes, off while they are measured (`classifier-check
   * --votes lowTime,dwell`). `lowTime`: when the low point falls, as a share
   * of the contour. `dwell`: the share of the contour spent in the bottom
   * third of its OWN range — a T2 sits near its shallow bottom for most of
   * the syllable, a T3 drops through it. Both read 84–88% alone on Jane's
   * natural T2/T3 clips, where the depth votes fall to ~88% (8 Oct 2026).
   */
  toneClassifierLowTimeVote: boolean;
  toneClassifierDwellVote: boolean;
  /**
   * Classifier v2 (`toneClassifierV2.ts`): measured cues with fixed
   * thresholds, no correlation with Jane's averages. When true, `classifyTone`
   * delegates to it everywhere (game included). False in the game while it is
   * evaluated; the visualiser calls v2 directly.
   */
  toneClassifierV2: boolean;
  /** v2: a tail whose mean sits at or under this chao is never a Tone 1, however flat. */
  toneV2T1MinChao: number;
  /** v2: a flat line shorter than this is a fragment, never a Tone 1 (Jane's shortest T1: 512ms). */
  toneV2T1MinMs: number;
  /** v2: total movement over range above this is a zigzag, read "none". Real tones stay under ~2.1; a jittery T1 (tiny range) reaches ~6; a 5-1 zigzag is 10.6. */
  toneV2MaxWiggle: number;
  /**
   * v2's own `toneMismatchMinT23Cue`: a T2/T3 read costs a heart only past
   * this vote. 0.6, not v1's 0.5 — the shape midway between Jane's T2 and
   * T3 averages votes -0.52 under v2 and must not take a heart.
   */
  toneV2MinT23Cue: number;
  /**
   * v2: a fall whose peak sits at or under this chao is a falling-only T3,
   * not a T4; full T4 from half a chao above it.
   */
  toneV2T4MinPeakChao: number;
  /**
   * v2: each T2/T3 cue's [T2, T3] anchor — the feature's value that votes -1
   * and +1. See `toneClassifierV2.ts` for what each measures.
   */
  toneV2T23Anchors: {
    turnTime: [number, number];
    riseShare: [number, number];
    riseRate: [number, number];
    drop: [number, number];
    dropShare: [number, number];
    low: [number, number];
  };
  /**
   * Confidence floor before `applyClassifierBoost` does anything — a reward
   * for being *sure*, not a general softening. 0.9 per the player call this
   * was tuned from: "if a player does a tone 100% accurately according to
   * the classifier, we should definitely give more points."
   */
  toneClassifierBoostMinConfidence: number;
  /**
   * The accuracy `applyClassifierBoost` grants right at
   * `toneClassifierBoostMinConfidence` — set to land exactly on the "good"
   * tier floor (`GOOD_ACCURACY` in `scoring.ts`), so clearing the confidence
   * bar guarantees at least "good", not an automatic "perfect"; confidence
   * approaching 1 is what climbs the rest of the way there.
   */
  toneClassifierBoostFloorAccuracy: number;

  // ---- dot dynamics
  /** Hold the last position for this long after voicing stops. */
  graceMs: number;
  /** The longer grace inside a T3 gate, where creak drops the signal. */
  t3GraceMs: number;
  /** Render easing time constant for the drawn dot. Visual only. */
  easeTauMs: number;
  /** Drift rate toward the rest line once grace has run out. */
  driftChaoPerSec: number;
  /** Seconds of movement kept in the trail. */
  trailSeconds: number;

  // ---- audio prefetch
  /**
   * Speculative clip prefetch depth, in words per tone.
   *
   * The gates the Run has already queued are fetched unconditionally and
   * first (audio/prefetch.ts's "exact" tier); this is the bet placed on top
   * of it, and the only thing it costs is bandwidth. `pickWord` draws
   * pseudo-randomly from the full 30-word tone pool, so a cap of N warms
   * roughly N/30 of the gates a run actually flies. Chosen by simulating the
   * pick over a 20-gate run: 6 costs ~39 clips (~4.7 MB) for a ~20% hit rate,
   * 8 costs ~46 (~5.5 MB) for ~27%, against the whole 120-clip, ~15 MB
   * catalog the prefetch used to pull. A 3-heart run reaches ~20-40 gates, so
   * anything much deeper is paying for words the run will never reach.
   * 0 disables the speculative tier entirely,
   * leaving only the 2-gate look-ahead (production's behaviour before the
   * prefetch existed).
   */
  prefetchWordsPerTone: number;

  /**
   * The cap on the pre-run warm-up wait, in ms.
   *
   * When the player presses Play the run holds on a short warming screen
   * until the first gate's own clip has fetched and decoded, so the very
   * first cue is a real recording rather than the synthetic sweep. This is
   * the ceiling on that hold: past it the run starts anyway and the first cue
   * falls back to the sweep. A dead or pathological network must never be
   * able to trap the player on a loading screen — a worse first cue is
   * recoverable, a run that never begins is not.
   */
  warmupMaxMs: number;
  /**
   * The floor on the pre-run warm-up wait, in ms.
   *
   * On a warm cache `loadClip` resolves in single-digit ms, and a screen that
   * appears and vanishes inside a frame or two reads as a flicker rather than
   * as the game getting ready. Holding it for a beat makes the transition
   * deliberate. Kept well under the cap so the common case is still a blink.
   */
  warmupMinMs: number;

  // ---- calibration
  /**
   * Fraction of the measured Tone-1 level that becomes the board's upward half
   * — see `REACH_TO_TONE_SPACE_UP` in `pitch/calibration.ts`. Since 29 Aug 2026
   * the input is an actual T1 from the calibration run, not a high "ahh" sweep;
   * at 1 the board's chao 5 sits at the speaker's own T1. Flown, not derived —
   * retune in the Lab from real calibrations.
   */
  reachToToneSpaceUp: number;
  /**
   * Fraction of the T3-floor measurement that becomes the board's downward
   * half — see `REACH_TO_TONE_SPACE_DOWN`. Raised 0.6 → 1 (29 Aug 2026): the
   * down input is no longer a "reach as low as comfortable" sweep but an actual
   * Tone 3 floor from the calibration run, so the 40% claw-back (which existed
   * to shrink a maximal reach into a tone space) would under-build the down
   * half and turn the T3 corridor floor into a wall. Mirrors
   * `reachToToneSpaceUp`. Flown, not derived — retune in the Lab.
   */
  reachToToneSpaceDown: number;

  /**
   * Per-tone gate length in seconds.
   *
   * These started as the shipped reference clips' own lengths, so that the
   * demo, the corridor and the scorer all ran on one clock. T1 and T3 no
   * longer match their clip (0.55 against an 880ms `ma1.wav`, 1.25 against
   * 1.33s) — tuned down from play, where T1 was the worst-scoring tone
   * precisely because it asked for a note longer than the flat part of one.
   * The demo still sweeps over the *clip's* length, so for T1 the example
   * currently shows a longer hold than the gate scores. See make-ref-clips.
   */
  gateDurationS: Record<Tone, number>;
  /** Per-tone corridor centreline. See DEFAULT_POLYLINES. */
  polylines: Record<Tone, Polyline>;

  /**
   * The f0 centre, in Hz, below which a player is matched to a male speaker.
   *
   * A threshold on a continuum: adult female centres cluster near 190-220Hz
   * and male near 100-130Hz, so 160 separates them with room either side. What
   * is being matched is pitch RANGE, not gender — a low-voiced woman matched
   * to the male recordings is the right outcome for the game, and the Settings
   * switch exists for everyone the guess suits badly.
   */
  voiceMatchF0Hz: number;
}

export const DEFAULT_TUNING: Readonly<Tuning> = Object.freeze({
  baseScrollSpeed: 200,
  baseToleranceH: 0.11,
  // These absorb the old default pace's (relaxed, ×2.0) multiplier now that
  // pace is gone (16 Aug 2026 removal) — was 1200/600 before scaling, so
  // removing the multiplier doesn't silently halve breathing room in play.
  baseRestMs: 2400,
  restMsFloor: 1200,
  cuePauseHoldMs: 800,
  cueReleaseMs: 300,
  birdXFrac: 0.2,
  cueApproachMs: 825,
  collisionSustainMs: 200,
  timingSlackS: 0.11,
  maxTimingWidenFactor: 1.5,
  slackSmoothS: 0.15,
  preGateBufferMs: 400,
  minUtteranceMs: 160,
  mergeGapMs: 150,
  multiMergeGapMs: 400,
  multiGateChance: 0.5,
  pairScoreMultiplier: 5.0,
  toneAccShapeWeight: 0.6,
  toneAccMovementWeight: 0.25,
  toneAccHeightWeight: 0.15,
  toneAccT23Weight: 0.8,
  toneAccHeightZeroChao: 1.5,
  toneAccFlatTargetChao: 0.6,
  toneAccFlatAttemptChao: 0.4,
  toneAccFlatAttemptMax: 0.1,
  toneClassifierMinConfidence: 0.5,
  toneClassifierOnsetTrimFraction: 0.05,
  toneClassifierFlatnessScaleChao: 1.25,
  toneClassifierT1TailFraction: 0.45,
  toneClassifierMarginThreshold: 0.12,
  toneClassifierT23DeadZone: 0.1,
  toneMismatchMinT23Cue: 0.5,
  toneMismatchMaxT23Dissent: 1,
  toneMismatchMaxGapMs: 100,
  toneMismatchCollisionEnabled: true,
  toneClassifierBoostEnabled: true,
  toneClassifierLowTimeVote: false,
  toneClassifierDwellVote: false,
  toneClassifierV2: false,
  toneV2T1MinChao: 3,
  toneV2T1MinMs: 350,
  toneV2MaxWiggle: 8,
  toneV2MinT23Cue: 0.6,
  toneV2T4MinPeakChao: 3.4,
  toneV2T23Anchors: {
    turnTime: [0.36, 0.54],
    riseShare: [0.56, 0.41],
    riseRate: [4, 6.6],
    drop: [0.7, 1.9],
    dropShare: [0.22, 0.4],
    low: [2.2, 1.6],
  },
  toneClassifierBoostMinConfidence: 0.9,
  toneClassifierBoostFloorAccuracy: 0.6,
  graceMs: 120,
  t3GraceMs: 250,
  easeTauMs: 35,
  driftChaoPerSec: 5.33,
  trailSeconds: 1.0,
  prefetchWordsPerTone: 6,
  warmupMaxMs: 3500,
  warmupMinMs: 400,
  reachToToneSpaceUp: 1,
  reachToToneSpaceDown: 1,
  gateDurationS: Object.freeze({ 1: 0.55, 2: 1.07, 3: 1.25, 4: 0.6 }),
  polylines: DEFAULT_POLYLINES,
  voiceMatchF0Hz: 160,
}) as Readonly<Tuning>;

function clonePolylines(p: Record<Tone, Polyline>): Record<Tone, Polyline> {
  return {
    1: p[1].map((pt) => [...pt] as [number, number]),
    2: p[2].map((pt) => [...pt] as [number, number]),
    3: p[3].map((pt) => [...pt] as [number, number]),
    4: p[4].map((pt) => [...pt] as [number, number]),
  };
}

function clone(t: Readonly<Tuning>): Tuning {
  return {
    ...t,
    gateDurationS: { ...t.gateDurationS },
    polylines: clonePolylines(t.polylines),
  };
}

let current: Tuning = clone(DEFAULT_TUNING);

/** The values in force right now. Read this per use — never cache it. */
export function tuning(): Readonly<Tuning> {
  return current;
}

/** Patches one or more values. Dev only; nothing in the player-facing app calls this. */
export function setTuning(patch: Partial<Tuning>): void {
  current = {
    ...current,
    ...patch,
    gateDurationS: { ...current.gateDurationS, ...(patch.gateDurationS ?? {}) },
    polylines: { ...current.polylines, ...(patch.polylines ?? {}) },
  };
}

export function resetTuning(): void {
  current = clone(DEFAULT_TUNING);
}
