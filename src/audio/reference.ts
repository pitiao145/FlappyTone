// Plays the reference cue through the speakers so the player can hear a
// contour before imitating it.
//
// Preferred source: native recordings (public/ref/ma{1-4}.mp3 — speaker Chen
// Wang, audio-cmn, CC-BY-SA), preloaded via loadReferenceClips. Until they
// are loaded (or if fetch/decode fails), playToneCue falls back to the v1
// synthetic sweep: the tone's corridor polyline swept through the player's
// own calibrated pitch range.
import { corridorChaoAt, type Tone } from "../game/gates.ts";
import { RANGE_SEMITONES } from "../pitch/math.ts";

let ctx: AudioContext | null = null;

const CUE_MS = 500;
const FADE_MS = 20;
/** Points sampled along the corridor for the frequency curve; 10ms apart. */
const CURVE_POINTS = 50;

// ------------------------------------------------------------- native clips

interface RefClip {
  buffer: AudioBuffer;
  /** Seconds of leading silence to skip when playing. */
  offsetS: number;
  /** Audible length in seconds (silence trimmed both ends). */
  durationS: number;
}

const clips = new Map<Tone, RefClip>();
let loading: Promise<void> | null = null;

/** Samples below this fraction of the clip's peak count as silence. */
const TRIM_FLOOR = 0.03;

function trimBounds(buffer: AudioBuffer): { offsetS: number; durationS: number } {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  const floor = peak * TRIM_FLOOR;
  let start = 0;
  while (start < data.length && Math.abs(data[start]) < floor) start++;
  let end = data.length - 1;
  while (end > start && Math.abs(data[end]) < floor) end--;
  return {
    offsetS: start / buffer.sampleRate,
    durationS: (end - start + 1) / buffer.sampleRate,
  };
}

/**
 * Fetches and decodes the native reference clips (idempotent). Call once the
 * audio context exists; playToneCue uses whichever clips are ready and falls
 * back to the synthetic sweep for the rest. Failures are silent by design —
 * a missing clip must never block a run.
 */
export function loadReferenceClips(audio: AudioContext): Promise<void> {
  loading ??= Promise.allSettled(
    ([1, 2, 3, 4] as Tone[]).map(async (tone) => {
      const url = `${import.meta.env.BASE_URL}ref/ma${tone}.mp3`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      const buffer = await audio.decodeAudioData(await res.arrayBuffer());
      clips.set(tone, { buffer, ...trimBounds(buffer) });
    }),
  ).then(() => undefined);
  return loading;
}

/**
 * Audible cue length per tone, in ms — the real clip's trimmed duration where
 * loaded, else the synthetic sweep's 500ms. Drives the demo-dot sweep and the
 * pause window, so eye and ear stay in sync (a native Tone 3 is genuinely
 * longer than a Tone 4).
 */
export function cueDurationMsFor(tone: Tone): number {
  const clip = clips.get(tone);
  return clip ? clip.durationS * 1000 : CUE_MS;
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
): void {
  const clip = clips.get(tone);
  if (clip) {
    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.connect(ctx.destination);
    src.start(ctx.currentTime, clip.offsetS, clip.durationS);
    cueAudibleUntilMs = performance.now() + clip.durationS * 1000 + CUE_TAIL_MS;
    return;
  }
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
  cueAudibleUntilMs = performance.now() + CUE_MS + CUE_TAIL_MS;
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
