/**
 * Dot dynamics constants shared by the calibration preview loop (loop.ts) and
 * the game run state machine (run.ts), so both feel identical.
 * Pure: no Web Audio, no React, no canvas. See docs/PRD.md §5.3.
 */

// PRD §5.3: hold the last position for 120ms of unvoiced (stop consonants,
// dropouts), then drift toward the centre line at 0.8 screen-heights/sec.
// Chao 1–5 spans 0.6H, so 0.8H/s = 0.8/0.6 * 4 ≈ 5.33 chao/s.
export const GRACE_MS = 120;
export const DRIFT_CHAO_PER_SEC = 5.33;
export const REST_CHAO = 3;

// Render easing time constant: the drawn dot closes ~63% of the gap to the
// measured value in this many ms. Visual only — never touches scoring data.
export const EASE_TAU_MS = 45;

/** PRD §6: creak concentrates on Tone 3, so T3 gates get a longer grace and hold instead of drifting. */
export const T3_GRACE_MS = 250;

/**
 * Seconds of movement kept in the bird's trail (PRD §8).
 *
 * Was 1.5s when the trail was drawn at a fixed 45% of canvas width regardless
 * of scroll speed — i.e. ~126 px/s against a world moving at 220. The trail is
 * now drawn in world space so it lines up with the corridor it was flown
 * through, which stretches it by the same ratio; 1.0s keeps its on-screen
 * length close to what it was (220px vs 189px at base speed).
 */
export const TRAIL_SECONDS = 1.0;
