/**
 * The `PitchTracker` currently driving something on screen, published so dev
 * tooling can retune it live.
 *
 * Why this exists: the dev panel's sliders used to mutate the *calibration
 * preview* tracker in loop.ts, while `Game.tsx` builds its own tracker inside
 * its frame sink and never exposed it. So every slider was inert during play —
 * moving it changed a tracker nobody was listening to. Whoever is running now
 * registers here, and the panel targets that.
 *
 * Pure module: no Web Audio, no React. It holds references, it does not build
 * anything.
 */

import type { PitchTracker } from "../pitch/PitchTracker.ts";
import type { PitchState } from "../pitch/types.ts";

let active: PitchTracker | null = null;
let latest: PitchState | null = null;

/** Called by whichever screen owns the mic. Pass null on teardown. */
export function setActiveTracker(t: PitchTracker | null): void {
  active = t;
  if (t === null) latest = null;
}

export function getActiveTracker(): PitchTracker | null {
  return active;
}

/** The last frame the active tracker produced — the dev readout's source. */
export function publishState(s: PitchState): void {
  latest = s;
}

export function getLiveState(): PitchState | null {
  return latest;
}
