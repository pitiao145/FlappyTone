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
import { CLIPS_BASE_URL, getPlayTicket, invalidatePlayTicket } from "./clipToken.ts";
import { isChromeIOS } from "./platform.ts";
import { getMicSession } from "./session.ts";

/**
 * The dedicated, output-only playback context for reference cues.
 *
 * Cues must NOT play through the mic's AudioContext: on iOS, releasing the mic
 * to move output to the loud speaker (the game's cue "dance") can auto-suspend
 * that context, silently dropping the clip. A separate context that never holds
 * a mic source is never suspended by a mic release, so playback stays reliable
 * and loud. It is output-only — it never calls getUserMedia — so resuming it
 * needs a user gesture but pops no permission prompt. See
 * docs/flappytone-SPEC-ios-audio-routing.md.
 */
let ctx: AudioContext | null = null;

/**
 * The context cues play on.
 *
 * Safari/PWA/desktop: a dedicated output-only context (created lazily), so a
 * mic release for the loud-speaker route can't suspend it.
 *
 * Chrome/Firefox iOS (the legacy path): the mic's OWN context. Those browsers
 * can't do the loud-speaker dance anyway (the per-cue re-acquire toasts), and a
 * second AudioContext contends with the mic's and cuts capture mid-utterance on
 * them. So they play cues exactly like production always has — one context, no
 * dance — accepting the quieter earpiece route. See
 * docs/flappytone-SPEC-ios-audio-routing.md. Falls back to the dedicated
 * context only if the mic isn't open yet (cues never actually play then).
 */
export function getPlaybackCtx(): AudioContext {
  if (isChromeIOS()) {
    const mic = getMicSession()?.ctx;
    if (mic) return mic;
  }
  ctx ??= new AudioContext();
  return ctx;
}

/**
 * Creates (if needed) and resumes the playback context. **Must be called from a
 * user gesture on iOS** — call it alongside `ensureMic()` in each gesture
 * handler. Idempotent (resuming a running context is a no-op) and never throws.
 */
export async function ensurePlaybackCtx(): Promise<void> {
  // On the Chrome/Firefox-iOS legacy path there is no dedicated context — cues
  // play on the mic's own. Never create one here (getPlaybackCtx would fall
  // through to `new AudioContext()` before the mic is open), which would
  // reintroduce the second context the legacy path exists to avoid. Resume the
  // mic context if it's already open; otherwise the mic's own gesture covers it.
  if (isChromeIOS()) {
    const mic = getMicSession()?.ctx;
    if (mic && mic.state !== "running") {
      try {
        await mic.resume();
      } catch {
        // ignore — a later gesture retries.
      }
    }
    return;
  }
  const c = getPlaybackCtx();
  if (c.state !== "running") {
    try {
      await c.resume();
    } catch {
      // resume() can reject outside a gesture; the next gesture retries.
    }
  }
}

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

/**
 * Keyed by `speaker:id` — the inventory is 120 clips per voice now, not four
 * per tone. The speaker is part of the key, not decoration: the same word id
 * exists for every voice on the roster, so a key of `id` alone would serve one
 * speaker's audio under another's name with no error and nothing to notice.
 */
const clipKeyFor = (word: Word): string => `${word.speakerId}:${word.id}`;

const clips = new Map<string, RefClip>();
/** In-flight or finished loads, so a word is fetched at most once. */
const loads = new Map<string, Promise<void>>();

/** A 401 from the Worker: the ticket is stale, the clip itself may be fine. */
class TicketError extends Error {
  constructor() {
    super("ticket");
  }
}

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
export function loadClip(word: Word): Promise<void> {
  const key = clipKeyFor(word);
  const existing = loads.get(key);
  if (existing) return existing;
  const load = (async () => {
    // The clips live in R2 behind the Worker, which serves nothing without a
    // short-lived play ticket. No base URL or no ticket is not an error worth
    // reporting to the player — it degrades to the synthetic sweep below.
    const ticket = await getPlayTicket();
    if (!CLIPS_BASE_URL || !ticket) throw new Error("no clips source");
    const url = `${CLIPS_BASE_URL}/clip/${word.speakerId}/${word.id}?v=${encodeURIComponent(word.updatedAt)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${ticket}` } });
    if (res.status === 401) {
      // The ticket expired, or the player's IP moved. Drop it so the next
      // gate mints a fresh one — and drop this load from `loads` below, or
      // this word would be stuck on the cached failure for the whole session.
      invalidatePlayTicket();
      throw new TicketError();
    }
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    // Decode on the playback context (AudioBuffers are context-independent and
    // playable on any context, but decoding on the one we play on keeps the
    // sample rate matched). On the Chrome-iOS legacy path this is the mic
    // context, which a later stopMic closes; the cached buffer stays valid and
    // replays fine on the next session's context.
    //
    // Resolved here, after the fetch, rather than at call time: a prefetch or a
    // build with no clips source must not be what brings an AudioContext into
    // existence (hard rule 4). By the time a clip has actually arrived, the
    // gesture that started the run has long since happened.
    const audio = getPlaybackCtx();
    const buffer = await audio.decodeAudioData(await res.arrayBuffer());
    clips.set(key, {
      buffer,
      onsetS: word.onsetS,
      durationS: word.durationS,
      clipS: word.clipS,
    });
  })().catch((err: unknown) => {
    // A cached failure is right for every other cause (a 404 for a clip that
    // isn't in R2 stays a 404 all session) but wrong for a stale ticket, which
    // the very next request can fix.
    if (err instanceof TicketError && loads.get(key) === load) loads.delete(key);
    return undefined;
  });
  loads.set(key, load);
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
  const clip = word ? clips.get(clipKeyFor(word)) : undefined;
  if (clip) return clip.clipS * 1000;
  return word ? word.clipS * 1000 : synthCueMsFor(tone);
}

/**
 * Inverse of pitch/math's semitonesToChao: chao -> semitones -> Hz, with the
 * same knee at chao 3. It has to invert the *asymmetric* board, or the synth
 * cue asks for a pitch below anything the player demonstrated they can reach.
 */
function chaoToHz(
  chao: number,
  f0Center: number,
  rangeSemitones: number,
  rangeDownSemitones: number,
): number {
  const half = chao >= 3 ? rangeSemitones : rangeDownSemitones;
  const semitones = ((chao - 3) / 2) * half;
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

/**
 * Returns true when the native clip played, false when it fell back to the
 * synthetic sweep — so a caller can report the fallback without duplicating
 * the `clips` lookup.
 */
export function playToneCue(
  tone: Tone,
  f0Center: number,
  rangeSemitones: number = RANGE_SEMITONES,
  word: Word | null = null,
  rangeDownSemitones: number = rangeSemitones,
  /**
   * Learn mode: always take the oscillator branch below, even when the
   * word's clip is loaded — the player is meant to hum the shape, not hear
   * the recorded speech.
   */
  forceSynth: boolean = false,
): boolean {
  // Play on the dedicated output-only context (never the mic's), so a mic
  // release for the loud-speaker route can't have suspended it. Best-effort
  // resume in case a backgrounding suspended it; a gesture retries otherwise.
  const ctx = getPlaybackCtx();
  if (ctx.state !== "running") void ctx.resume();
  const clip = forceSynth ? undefined : word ? clips.get(clipKeyFor(word)) : undefined;
  if (clip) {
    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.connect(ctx.destination);
    // From 0: the consonant is the front of the syllable, not silence to skip.
    src.start(ctx.currentTime);
    const audibleMs = clip.clipS * 1000;
    cueAudibleUntilMs = performance.now() + audibleMs + CUE_TAIL_MS;
    return true;
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
    curve[i] = chaoToHz(chao, f0Center, rangeSemitones, rangeDownSemitones);
  }
  osc.frequency.setValueCurveAtTime(curve, now, durationS);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fadeS);
  gain.gain.setValueAtTime(1, Math.max(now + fadeS, now + durationS - fadeS));
  gain.gain.linearRampToValueAtTime(0, now + durationS);

  osc.start(now);
  osc.stop(now + durationS);
  cueAudibleUntilMs = performance.now() + durationS * 1000 + CUE_TAIL_MS;
  return false;
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
  rangeDownSemitones: number = rangeSemitones,
): Promise<void> {
  await ensurePlaybackCtx();
  playToneCue(tone, f0Center, rangeSemitones, null, rangeDownSemitones);
}
