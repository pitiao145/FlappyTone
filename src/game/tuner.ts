/**
 * Brief 50: the voice tuner's logic (Settings → Calibrate). Pure: frames in,
 * step state and line measurements out. The screen is `src/ui/VoiceTuner.tsx`.
 *
 * Four parts: room (2 s of quiet), middle (媽, 馬 in a normal voice), top
 * (媽 as a first tone), bottom (a low third tone, 馬). Each voice step locks
 * when the player STOPS speaking after enough voice, so a long 媽 never runs
 * into the next word (test 9 bug). Lines are measured with the learned
 * scale's own rule (`gridTopPct`, `gridBottomPct`, `gridCreakSt`, the
 * `gridHalfMin..gridHalfMax` limits), so calibration and learning agree.
 *
 * Numbers only, kept on this device (hard rule 12). Nothing throws (hard rule 10).
 */
import { computeF0Center, computeMiddleHz } from "../pitch/calibration.ts";
import type { CalibrationSettings } from "./settings.ts";
import { speakerFMin, tuning } from "./tuning.ts";
import type { PitchTrackerConfig } from "../pitch/types.ts";

export type TunerPart = "room" | "middle" | "top" | "bottom";
export const TUNER_PARTS: TunerPart[] = ["room", "middle", "top", "bottom"];

/** One analysis frame as the tuner sees it. */
export interface TunerFrame {
  tMs: number;
  voiced: boolean;
  /** Pitch in Hz when voiced (the tracker's f0), else null. */
  f0: number | null;
}

export type CapturePhase =
  /** Nothing heard yet. */
  | "listening"
  /** Voice coming in. */
  | "hearing"
  /** Enough voice, then silence: the take is done. Later frames are ignored. */
  | "locked"
  /** The voice stopped before there was enough of it: "Couldn't hear that, try again". */
  | "tooShort";

/** Gap between two voiced frames that still counts as one sound (same as calibration). */
const VOICED_GAP_MS = 60;

export interface CaptureOptions {
  needMs: number;
  lockSilenceMs: number;
  maxMs: number;
  stallMs: number;
  /**
   * Lock the moment `needMs` of voice is heard (the ring is full), instead of
   * waiting for the silence after it (Pierre, 22 Nov: the step must end when
   * the ring is full). The rest of that word never reaches the next take: a
   * take listens only after a short quiet. Optional: absent = lock on silence.
   */
  lockOnFull?: boolean;
  /** Talking: pauses between words are normal, so a pause never makes the take "too short". */
  allowPauses?: boolean;
}

export function captureOptions(): CaptureOptions {
  const t = tuning();
  return { needMs: t.tunerNeedVoicedMs, lockSilenceMs: t.tunerLockSilenceMs, maxMs: t.tunerMaxVoicedMs, stallMs: t.tunerStallMs, lockOnFull: true };
}

/**
 * One take of one step. Feed it every frame; read `phase`, `progress` and,
 * once locked, `f0s`. The take locks on the first silence of
 * `lockSilenceMs` after `needMs` of voice (or after `maxMs` of voice).
 * A pause before `needMs` that lasts 3 x `lockSilenceMs` makes it "tooShort".
 */
export class StepCapture {
  phase: CapturePhase = "listening";
  heardMs = 0;
  readonly f0s: number[] = [];
  private lastVoicedAt: number | null = null;
  private startedAt: number | null;
  /**
   * A take only listens after `lockSilenceMs` of quiet. A word still sounding
   * when the step opens (the end of a long 媽 from the step before, or the
   * example still in the room) is never counted for this step.
   */
  private armed = false;
  private quietSince: number | null = null;

  private readonly o: CaptureOptions;

  constructor(o: CaptureOptions, startedAtMs: number | null = null) {
    this.o = o;
    this.startedAt = startedAtMs;
  }

  /** 0..1: how much of the needed voice has been heard. */
  get progress(): number {
    return Math.min(1, this.heardMs / this.o.needMs);
  }

  /** True once the take is listening (it waits for a short quiet first). */
  get listening(): boolean {
    return this.armed;
  }

  /** True when nothing has been heard for `stallMs` since the take began (or since the last voice). */
  stalled(nowMs: number): boolean {
    if (this.phase === "locked") return false;
    const since = this.lastVoicedAt ?? this.startedAt;
    return since !== null && nowMs - since >= this.o.stallMs;
  }

  push(f: TunerFrame): CapturePhase {
    if (this.phase === "locked" || this.phase === "tooShort") return this.phase;
    this.startedAt ??= f.tMs;
    const voiced = f.voiced && f.f0 !== null && Number.isFinite(f.f0);
    if (!this.armed) {
      if (voiced) {
        this.quietSince = null;
      } else {
        this.quietSince ??= f.tMs;
        if (f.tMs - this.quietSince >= this.o.lockSilenceMs) this.armed = true;
      }
      return this.phase;
    }
    if (voiced) {
      if (this.lastVoicedAt !== null) this.heardMs += Math.min(f.tMs - this.lastVoicedAt, VOICED_GAP_MS);
      this.lastVoicedAt = f.tMs;
      this.f0s.push(f.f0 as number);
      this.phase = "hearing";
      if (this.heardMs >= this.o.maxMs || (this.o.lockOnFull && this.heardMs >= this.o.needMs)) this.phase = "locked";
      return this.phase;
    }
    if (this.lastVoicedAt === null) return this.phase;
    const quiet = f.tMs - this.lastVoicedAt;
    if (this.heardMs >= this.o.needMs) {
      if (quiet >= this.o.lockSilenceMs) this.phase = "locked";
    } else if (!this.o.allowPauses && quiet >= 3 * this.o.lockSilenceMs) {
      this.phase = "tooShort";
    }
    return this.phase;
  }
}

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

const clampHalf = (x: number): number => {
  const t = tuning();
  return Math.min(t.gridHalfMax, Math.max(t.gridHalfMin, x));
};

/** Semitones from `midHz`, creak (more than `gridCreakSt` under the middle) left out. */
function stFrom(f0s: number[], midHz: number): number[] {
  const creak = tuning().gridCreakSt;
  return f0s
    .filter((f) => Number.isFinite(f) && f > 0)
    .map((f) => 12 * Math.log2(f / midHz))
    .filter((s) => s >= -creak);
}

/** Middle (Hz) of one set of frames: brief 44's rule (median, creak left out). */
export function measureMiddle(f0s: number[]): number | null {
  return computeMiddleHz(f0s, tuning().gridCreakSt);
}

/**
 * Middle (Hz) of the middle step: each take's own middle, then their average
 * in semitones, so every word counts once. Pooled frames let a long-held 媽
 * outweigh 馬 (Pierre, 19 Nov: his middle landed on his 媽 height). Measured
 * (`middle-words.mjs`, last table): one 媽 + one 馬 lands -0.28 / +0.14 st
 * from Pierre's full middle and stays there with a 3x longer 媽 (pooled: up
 * to +2.5 st). Takes that measure nothing are skipped; null if none measure.
 */
export function measureMiddleTakes(takes: number[][]): number | null {
  const mids = takes.map(measureMiddle).filter((m): m is number => m !== null);
  if (mids.length === 0) return null;
  return 2 ** (mids.reduce((a, m) => a + Math.log2(m), 0) / mids.length);
}

/** Up half (st): the first tone's `gridTopPct` percentile above the middle. Null with under 10 frames. */
export function measureTop(f0s: number[], midHz: number): number | null {
  const st = stFrom(f0s, midHz);
  return st.length >= 10 ? clampHalf(pct(st, tuning().gridTopPct)) : null;
}

/** Down half (st): the third tone's `gridBottomPct` percentile below the middle. Null with under 10 frames. */
export function measureBottom(f0s: number[], midHz: number): number | null {
  const st = stFrom(f0s, midHz);
  return st.length >= 10 ? clampHalf(-pct(st, tuning().gridBottomPct)) : null;
}

/** A measured part, applied to the settings. Every other field is kept (redo one part = change one part). */
export type TunerResult =
  | { part: "room"; noiseFloor: number }
  | { part: "middle"; f0Center: number }
  | { part: "top"; up: number }
  | { part: "bottom"; down: number };

export function applyTunerResult(base: CalibrationSettings, r: TunerResult): CalibrationSettings {
  const out: CalibrationSettings = { ...base };
  delete out.quickStart; // a tuner result is a calibration, not a preset
  if (r.part === "room") out.noiseFloor = r.noiseFloor;
  else if (r.part === "middle") out.f0Center = r.f0Center;
  else if (r.part === "top") out.rangeSemitones = r.up;
  else out.rangeDownSemitones = r.down;
  return out;
}

// ------------------------------------------------------------------ room

export type RoomVerdict = "quiet" | "noisy" | "tooNoisy";

export function roomVerdict(noiseFloor: number): RoomVerdict {
  const t = tuning();
  return noiseFloor < t.roomQuietRms ? "quiet" : noiseFloor <= t.roomNoisyRms ? "noisy" : "tooNoisy";
}

/**
 * Where the marker sits on the Quiet / A bit noisy / Too noisy scale (0..1).
 * The three zones fill 0-0.4, 0.4-0.72 and 0.72-1 (the design's scale), log
 * inside each zone.
 */
export function roomMarker(noiseFloor: number): number {
  const t = tuning();
  const lo = 1e-4, hi = t.roomNoisyRms * 6;
  const f = Math.min(hi, Math.max(lo, noiseFloor));
  const zone = (x: number, a: number, b: number, from: number, to: number) =>
    from + ((to - from) * Math.log(x / a)) / Math.log(b / a);
  if (f < t.roomQuietRms) return zone(f, lo, t.roomQuietRms, 0, 0.4);
  if (f <= t.roomNoisyRms) return zone(f, t.roomQuietRms, t.roomNoisyRms, 0.4, 0.72);
  return zone(f, t.roomNoisyRms, hi, 0.72, 1);
}

/** Room noise as signal bars, 0..7. */
export function roomBars(noiseFloor: number): number {
  return Math.max(1, Math.min(7, Math.round(roomMarker(noiseFloor) * 7)));
}

/** Voice level as signal bars, 0..5: about one bar per 6 dB over the room. */
export function voiceBars(rms: number, noiseFloor: number): number {
  if (!(rms > 0) || !(noiseFloor > 0)) return 0;
  const db = 20 * Math.log10(rms / noiseFloor);
  return Math.max(0, Math.min(5, Math.floor(db / 6)));
}

const ROOM_KEY = "toneflap.room.v1";

export interface RoomRecord {
  verdict: RoomVerdict;
  atMs: number;
}

export function loadRoom(): RoomRecord | null {
  try {
    const r = JSON.parse(localStorage.getItem(ROOM_KEY) ?? "null") as RoomRecord | null;
    return r && (r.verdict === "quiet" || r.verdict === "noisy" || r.verdict === "tooNoisy") && typeof r.atMs === "number" ? r : null;
  } catch {
    return null;
  }
}

export function saveRoom(r: RoomRecord): void {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify(r));
  } catch {
    // not kept: Settings shows no room status
  }
}

// ------------------------------------------------------------------ copy

/** "2½", "4", "½": semitones to the nearest half, for the screen. */
export function halfSteps(st: number): string {
  const h = Math.round(Math.abs(st) * 2) / 2;
  const whole = Math.floor(h);
  const half = h - whole >= 0.5;
  if (whole === 0) return half ? "½" : "0";
  return `${whole}${half ? "½" : ""}`;
}

/** "Top: 2½ semitones up" etc. */
export function semitoneWord(st: number): string {
  const n = halfSteps(st);
  return `${n} semitone${n === "1" || n === "½" ? "" : "s"}`;
}

/**
 * The tuner's pitch tracker settings for one step. The middle step keeps the
 * tracker's default floor; top and bottom use the floor for this middle.
 * Never sets a key to undefined: a spread `fMin: undefined` overrides the
 * tracker's default and it then hears no pitch (19 Nov 2026 bug).
 */
export function tunerTrackerConfig(
  part: Exclude<TunerPart, "room">,
  s: Pick<CalibrationSettings, "f0Center" | "noiseFloor">,
  sampleRate: number,
): Partial<PitchTrackerConfig> & { sampleRate: number } {
  const cfg = { sampleRate, noiseFloor: s.noiseFloor, minVoicedRunMs: tuning().minVoicedRunMs };
  return part === "middle" ? cfg : { ...cfg, fMin: speakerFMin(s.f0Center) };
}

/** One locked take of a voice step: f0s from the normal tracker and from the low-floor tracker. */
export interface TunerTake {
  normal: number[];
  low: number[];
}

/**
 * Brief 50, 22 Nov (Pierre's choice): Room → Talk → 媽 → 馬. The middle is the
 * speaking voice (read numbers aloud, any language): the median pitch, as the
 * old calibration did, moved by `tunerTalkOffsetSt` (default 0: as before).
 * The top line is p90 of the 媽 take above that middle, the bottom line p10 of
 * the 馬 take below it (the learned scale's own percentiles), halves 3-10 st.
 * A part left out keeps its value, so a redo of one part changes only that part.
 * Null when a given part measures nothing (the caller says "try again").
 */
export function settingsFromParts(
  base: CalibrationSettings,
  p: { talk?: TunerTake; t1?: TunerTake; t3?: TunerTake },
): CalibrationSettings | null {
  const t = tuning();
  let out: CalibrationSettings = applyTunerResult(base, { part: "middle", f0Center: base.f0Center });
  if (p.talk) {
    const first = computeF0Center(p.talk.normal);
    // A deep voice: its floor sits under the normal one, so the low tracker's frames are fair.
    const deep = first !== null && speakerFMin(first) < t.pitchFloorHighHz;
    const mid = deep ? (computeF0Center(p.talk.low) ?? first) : first;
    if (mid === null) return null;
    out = applyTunerResult(out, { part: "middle", f0Center: mid * 2 ** (t.tunerTalkOffsetSt / 12) });
  }
  if (p.t1) {
    const up = measureTop(p.t1.normal, out.f0Center);
    if (up === null) return null;
    out = applyTunerResult(out, { part: "top", up });
  }
  if (p.t3) {
    const down = measureBottom(p.t3.normal, out.f0Center);
    if (down === null) return null;
    out = applyTunerResult(out, { part: "bottom", down });
  }
  return out;
}
