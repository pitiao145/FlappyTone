// Plays a synthetic reference tone through the speakers so the player can
// hear a contour before imitating it. Own AudioContext, created lazily on
// first play (button click = user gesture, satisfies iOS).
//
// This is honest v1 audio: it models the tone's *contour* (per PRD §6's
// corridor polyline), swept through the player's own calibrated pitch
// range — not a recording of a native syllable. MSU Tone Perfect's licence
// for shipping is unresolved (PRD §9), so no external clips are used.
import { corridorChaoAt, type Tone } from "../game/gates.ts";
import { RANGE_SEMITONES } from "../pitch/math.ts";

let ctx: AudioContext | null = null;

const CUE_MS = 500;
const FADE_MS = 20;
/** Points sampled along the corridor for the frequency curve; 10ms apart. */
const CURVE_POINTS = 50;

/** Inverse of pitch/math's semitonesToChao: chao -> semitones -> Hz. */
function chaoToHz(chao: number, f0Center: number, rangeSemitones: number): number {
  const semitones = ((chao - 3) / 2) * rangeSemitones;
  return f0Center * Math.pow(2, semitones / 12);
}

/**
 * Synthesizes and plays a 500ms sine sweep whose f0 follows `tone`'s
 * corridor contour (src/game/gates.ts `corridorChaoAt`), mapped through the
 * player's own calibration (`f0Center`, `rangeSemitones`) via the inverse of
 * the chao<->semitone mapping in src/pitch/math.ts. Fades 20ms in/out to
 * avoid clicks. Caller owns `ctx` and must have resumed it behind a user
 * gesture already.
 */
export function playToneCue(
  ctx: AudioContext,
  tone: Tone,
  f0Center: number,
  rangeSemitones: number = RANGE_SEMITONES,
): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  const durationS = CUE_MS / 1000;
  const fadeS = FADE_MS / 1000;

  const curve = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) {
    const t = i / (CURVE_POINTS - 1);
    const chao = corridorChaoAt(tone, t);
    curve[i] = chaoToHz(chao, f0Center, rangeSemitones);
  }
  osc.frequency.setValueCurveAtTime(curve, now, durationS);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fadeS);
  gain.gain.setValueAtTime(1, Math.max(now + fadeS, now + durationS - fadeS));
  gain.gain.linearRampToValueAtTime(0, now + durationS);

  osc.start(now);
  osc.stop(now + durationS);
}

/**
 * Convenience wrapper for UI call sites (dev panel, calibration): owns a
 * lazily-created AudioContext and resumes it (must be called from a user
 * gesture) before playing the cue for `tone`.
 */
export async function playReferenceTone(
  tone: Tone,
  f0Center: number,
  rangeSemitones: number = RANGE_SEMITONES,
): Promise<void> {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  playToneCue(ctx, tone, f0Center, rangeSemitones);
}
