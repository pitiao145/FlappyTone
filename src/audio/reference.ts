// Plays the reference cue through the speakers so the player can hear a
// contour before imitating it.
//
// Preferred source: native recordings (public/ref/ma{1-4}.wav — Jane, a native
// Taiwanese speaker, recorded direct to mic and used with permission), built by
// `npm run make-ref-clips` from the same `fixtures/captures/jane_ma*.wav` the
// corridor polylines were measured from. That shared origin is the point: the
// example the player hears and the shape they are scored against come from one
// voice and one take. They previously disagreed — the clips were a different
// speaker whose contours did not match the corridors.
//
// Until they are loaded (or if fetch/decode fails), playToneCue falls back to
// the v1 synthetic sweep: the tone's corridor polyline swept through the
// player's own calibrated pitch range.
import { corridorChaoAt,
  shapeForTone, GATE_DURATION_S, type Tone } from "../game/gates.ts";
import { RANGE_SEMITONES } from "../pitch/math.ts";
import type { Word } from "../game/words.ts";

let ctx: AudioContext | null = null;

/**
 * Fallback cue length when no native clip is loaded. The synthetic sweep must
 * take exactly as long as the gate it is demonstrating, or it teaches a rate
 * the corridor then refuses — T3's gate is 1.2s, so a flat 500ms demo showed
 * the contour at more than twice the speed the player is scored against.
 */
function synthCueMsFor(tone: Tone): number {
  return GATE_DURATION_S[tone] * 1000;
}
const FADE_MS = 20;
/** Points sampled along the corridor for the frequency curve; 10ms apart. */
const CURVE_POINTS = 50;

// ------------------------------------------------------------- native clips

interface RefClip {
  buffer: AudioBuffer;
  /**
   * Consonant audio before the tone begins, from the manifest.
   *
   * Not re-derived from the samples here. It used to be — a 3%-of-peak trim
   * left over from when these were third-party mp3s — and that rule deletes
   * quiet audio from the front of a clip, which is exactly what an aspirated
   * onset is. Two measurements of the same thing is one too many; the cutter's
   * is the one the corridor was built from.
   */
  onsetS: number;
  /** The tone window — what the corridor lasts. */
  durationS: number;
  /**
   * The whole file — what is actually audible.
   *
   * Since the clips became the raw takes, the audio does not end where the tone
   * does: `onsetS + durationS` under-reports it, which would both cut the world
   * freeze short and re-open the mic while the cue is still playing.
   */
  clipS: number;
}

/** Keyed by word id — the inventory is 120 clips now, not four per tone. */
const clips = new Map<string, RefClip>();
/** In-flight or finished loads, so a word is fetched at most once. */
const loads = new Map<string, Promise<void>>();

/**
 * Fetches and decodes one word's clip (idempotent per id). Failures are silent
 * by design — a missing clip must never block a run; the cue falls back to the
 * synthetic sweep.
 *
 * Fetched per word rather than all at once. Four clips could be preloaded on
 * game start; 120 cannot, and would not be worth it — a run touches a couple of
 * dozen. The Run asks for a word two gates ahead of the bird, which is seconds
 * of warning for a ~100KB file.
 */
export function loadClip(audio: AudioContext, word: Word): Promise<void> {
  const existing = loads.get(word.id);
  if (existing) return existing;
  const load = (async () => {
    const url = `${import.meta.env.BASE_URL}ref/${word.file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const buffer = await audio.decodeAudioData(await res.arrayBuffer());
    clips.set(word.id, {
      buffer,
      onsetS: word.onsetS,
      durationS: word.durationS,
      clipS: word.clipS,
    });
  })().catch(() => undefined);
  loads.set(word.id, load);
  return load;
}

/**
 * Audible cue length in ms — the whole file, where loaded, else the word's own
 * manifest length. Drives the pause window, so eye and ear stay in sync.
 *
 * The word's manifest duration is the fallback rather than the tone's: a gate
 * built from a word is exactly as long as that clip, and answering with the
 * tone default would put the demo and the corridor on different clocks for
 * however long the fetch takes.
 */
export function cueDurationMsFor(word: Word | null, tone: Tone): number {
  const clip = word ? clips.get(word.id) : undefined;
  if (clip) return clip.clipS * 1000;
  return word ? word.clipS * 1000 : synthCueMsFor(tone);
}

/** Inverse of pitch/math's semitonesToChao: chao -> semitones -> Hz. */
function chaoToHz(chao: number, f0Center: number, rangeSemitones: number): number {
  const semitones = ((chao - 3) / 2) * rangeSemitones;
  return f0Center * Math.pow(2, semitones / 12);
}

/**
 * Plays the reference cue for `tone`: the native clip when loaded, else a
 * synthetic 500ms sine sweep of the tone's corridor contour (src/game/gates.ts
 * `corridorChaoAt`) mapped through the player's own calibration (`f0Center`,
 * `rangeSemitones`). Caller owns `ctx` and must have resumed it behind a user
 * gesture already.
 */
/**
 * The cue plays through the speakers while the mic is live, and it sits in
 * the player's own pitch range — the mic picks it up and the dot flies the
 * cue instead of the player (seen on a real session recording: spurious
 * voiced frames at the calibrated f0 during every "listen" phase). While a
 * cue is audible (plus a short room tail), the game must not listen.
 */
let cueAudibleUntilMs = 0;
const CUE_TAIL_MS = 150;

export function isCueAudible(): boolean {
  return performance.now() < cueAudibleUntilMs;
}

export function playToneCue(
  ctx: AudioContext,
  tone: Tone,
  f0Center: number,
  rangeSemitones: number = RANGE_SEMITONES,
  word: Word | null = null,
): void {
  const clip = word ? clips.get(word.id) : undefined;
  if (clip) {
    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.connect(ctx.destination);
    // From 0: the consonant is the front of the syllable, not silence to skip.
    src.start(ctx.currentTime);
    const audibleMs = clip.clipS * 1000;
    cueAudibleUntilMs = performance.now() + audibleMs + CUE_TAIL_MS;
    return;
  }
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  const durationS = synthCueMsFor(tone) / 1000;
  const fadeS = FADE_MS / 1000;

  const curve = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) {
    const t = i / (CURVE_POINTS - 1);
    const chao = corridorChaoAt(shapeForTone(tone), t);
    curve[i] = chaoToHz(chao, f0Center, rangeSemitones);
  }
  osc.frequency.setValueCurveAtTime(curve, now, durationS);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fadeS);
  gain.gain.setValueAtTime(1, Math.max(now + fadeS, now + durationS - fadeS));
  gain.gain.linearRampToValueAtTime(0, now + durationS);

  osc.start(now);
  osc.stop(now + durationS);
  cueAudibleUntilMs = performance.now() + durationS * 1000 + CUE_TAIL_MS;
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
