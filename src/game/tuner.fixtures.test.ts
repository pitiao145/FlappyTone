import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { decodeWav } from "../dev/wav.ts";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import {
  StepCapture,
  applyTunerResult,
  halfSteps,
  measureBottom,
  measureMiddle,
  measureTop,
  roomMarker,
  roomVerdict,
  voiceBars,
  type CaptureOptions,
  type TunerFrame,
} from "./tuner.ts";
import { resetTuning, setTuning, tuning } from "./tuning.ts";
import type { CalibrationSettings } from "./settings.ts";

const FRAME = 2048, HOP = 1024;
/** A recorded word as tuner frames, starting at `t0Ms`. */
function frames(file: string, t0Ms: number): TunerFrame[] {
  const { samples, sampleRate } = decodeWav(readFileSync(`fixtures/captures/${file}`));
  const tr = new PitchTracker({ sampleRate, f0Center: 168 });
  const out: TunerFrame[] = [];
  for (let s = 0; s + FRAME <= samples.length; s += HOP) {
    const p = tr.push(samples.subarray(s, s + FRAME));
    out.push({ tMs: t0Ms + (s / sampleRate) * 1000, voiced: p.voiced, f0: p.f0 });
  }
  return out;
}
const silence = (from: number, ms: number): TunerFrame[] =>
  Array.from({ length: Math.ceil(ms / 21) }, (_, i) => ({ tMs: from + i * 21, voiced: false, f0: null }));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const OPTS: CaptureOptions = { needMs: 450, lockSilenceMs: 300, maxMs: 2500, stallMs: 4000 };

afterEach(() => resetTuning());

describe("StepCapture: a step locks when the player stops", () => {
  it("locks on the silence after a recorded 媽, not while it sounds", () => {
    const ma = frames("jane_ma1.wav", 0);
    const end = ma.at(-1)!.tMs;
    const cap = new StepCapture(OPTS);
    const lastVoiced = Math.max(...ma.filter((f) => f.voiced).map((f) => f.tMs));
    let lockedAt: number | null = null;
    for (const f of [...ma, ...silence(end + 21, 800)]) {
      if (cap.push(f) === "locked" && lockedAt === null) lockedAt = f.tMs;
    }
    expect(cap.phase).toBe("locked");
    expect(lockedAt!).toBeGreaterThanOrEqual(lastVoiced + OPTS.lockSilenceMs);
    expect(cap.f0s.length).toBe(ma.filter((f) => f.voiced && f.f0 !== null).length);
  });

  it("a long 媽 never counts for the next step (recorded frames)", () => {
    // 媽 held so long that its step locks at maxMs while it still sounds.
    const ma = frames("jane_ma1.wav", 0);
    const voicedMs = ma.filter((f) => f.voiced).length * 21;
    const opts = { ...OPTS, maxMs: Math.max(OPTS.needMs, voicedMs / 2) };
    const first = new StepCapture(opts);
    let i = 0;
    for (; i < ma.length && first.push(ma[i]) !== "locked"; i++);
    expect(first.phase).toBe("locked");
    // The rest of the same 媽, a pause, then 馬, all go to the next step.
    const rest = ma.slice(i + 1);
    const endMa = ma.at(-1)!.tMs;
    const ma3 = frames("jane_ma3.wav", endMa + 600);
    const next = new StepCapture(OPTS);
    for (const f of [...rest, ...silence(endMa + 21, 560), ...ma3, ...silence(ma3.at(-1)!.tMs + 21, 800)]) next.push(f);
    expect(next.phase).toBe("locked");
    const ma3F0 = ma3.filter((f) => f.voiced && f.f0 !== null).map((f) => f.f0!);
    const ma1Rest = rest.filter((f) => f.voiced && f.f0 !== null).map((f) => f.f0!);
    expect(ma1Rest.length).toBeGreaterThan(0);
    // Only 馬's frames: none of the 媽 tail.
    expect(next.f0s.length).toBe(ma3F0.length);
    expect(median(next.f0s)).toBeCloseTo(median(ma3F0), 6);
  });

  it("a voice that stops too soon is 'too short' (try again), never a measurement", () => {
    const cap = new StepCapture(OPTS);
    const pts: TunerFrame[] = [...silence(0, 400)];
    for (let t = 420; t < 600; t += 21) pts.push({ tMs: t, voiced: true, f0: 150 });
    pts.push(...silence(620, 1200));
    for (const f of pts) cap.push(f);
    expect(cap.phase).toBe("tooShort");
  });

  it("stalls after the stall time with no voice", () => {
    const cap = new StepCapture(OPTS, 0);
    for (const f of silence(0, 1000)) cap.push(f);
    expect(cap.stalled(1000)).toBe(false);
    expect(cap.stalled(4100)).toBe(true);
  });
});

describe("tuner measurements use the learned scale's rule", () => {
  it("top and bottom are the learner's percentiles of the take, in semitones from the middle", () => {
    const mid = 130;
    const t1 = Array.from({ length: 50 }, (_, i) => mid * 2 ** ((2 + (i / 49) * 1) / 12)); // 2..3 st up
    const t3 = Array.from({ length: 50 }, (_, i) => mid * 2 ** ((-5 + (i / 49) * 3) / 12)); // -5..-2 st
    expect(measureTop(t1, mid)).toBeCloseTo(Math.max(tuning().gridHalfMin, 2.9), 1);
    setTuning({ gridHalfMin: 1 });
    expect(measureTop(t1, mid)).toBeCloseTo(2.9, 1);
    expect(measureBottom(t3, mid)).toBeCloseTo(4.7, 1);
  });

  it("creak far under the middle is left out of the bottom", () => {
    const mid = 130;
    const t3 = [...Array.from({ length: 40 }, () => mid * 2 ** (-4 / 12)), ...Array.from({ length: 20 }, () => mid * 2 ** (-14 / 12))];
    expect(measureBottom(t3, mid)).toBeCloseTo(4, 5);
  });

  it("too few frames measure nothing", () => {
    expect(measureTop([200, 201], 150)).toBeNull();
    expect(measureMiddle([150])).toBeNull();
  });
});

describe("redo of one part changes only that part", () => {
  const base: CalibrationSettings = { f0Center: 130, noiseFloor: 0.0004, rangeSemitones: 2.5, rangeDownSemitones: 4, voice: { gender: "male" }, voiceRms: 0.01 };
  it.each([
    [{ part: "room", noiseFloor: 0.001 } as const, "noiseFloor", 0.001],
    [{ part: "middle", f0Center: 140 } as const, "f0Center", 140],
    [{ part: "top", up: 3.5 } as const, "rangeSemitones", 3.5],
    [{ part: "bottom", down: 5 } as const, "rangeDownSemitones", 5],
  ])("%o", (r, key, value) => {
    const out = applyTunerResult(base, r);
    expect(out).toEqual({ ...base, [key]: value });
  });
  it("turns a quick-start preset into a calibration", () => {
    expect(applyTunerResult({ ...base, quickStart: true }, { part: "top", up: 3 }).quickStart).toBeUndefined();
  });
});

describe("room and meters", () => {
  it("verdicts and marker zones line up", () => {
    const t = tuning();
    expect(roomVerdict(t.roomQuietRms / 2)).toBe("quiet");
    expect(roomVerdict((t.roomQuietRms + t.roomNoisyRms) / 2)).toBe("noisy");
    expect(roomVerdict(t.roomNoisyRms * 2)).toBe("tooNoisy");
    expect(roomMarker(t.roomQuietRms / 2)).toBeLessThan(0.4);
    expect(roomMarker((t.roomQuietRms + t.roomNoisyRms) / 2)).toBeGreaterThan(0.4);
    expect(roomMarker(t.roomNoisyRms * 2)).toBeGreaterThan(0.72);
  });
  it("voice bars rise with level over the room", () => {
    expect(voiceBars(0.0002, 0.0002)).toBe(0);
    expect(voiceBars(0.02, 0.0002)).toBe(5);
  });
  it("half steps read as learners say them", () => {
    expect(halfSteps(2.4)).toBe("2½");
    expect(halfSteps(4.1)).toBe("4");
    expect(halfSteps(0.4)).toBe("½");
  });
});

describe("the tuner's own tracker hears a recorded voice on every step (19 Nov bug)", () => {
  it.each(["middle", "top", "bottom"] as const)("%s", async (part) => {
    const { tunerTrackerConfig } = await import("./tuner.ts");
    const { samples, sampleRate } = decodeWav(readFileSync("fixtures/captures/jane_ma1.wav"));
    const cfg = tunerTrackerConfig(part, { f0Center: 180, noiseFloor: 0.0005 }, sampleRate);
    expect(Object.values(cfg).every((v) => v !== undefined)).toBe(true);
    const tr = new PitchTracker(cfg);
    const cap = new StepCapture(OPTS);
    let t = 0;
    for (let s = 0; s + FRAME <= samples.length; s += HOP, t += (HOP / sampleRate) * 1000) {
      const p = tr.push(samples.subarray(s, s + FRAME));
      cap.push({ tMs: t, voiced: p.voiced, f0: p.f0 });
    }
    for (const f of silence(t, 800)) cap.push(f);
    expect(cap.phase).toBe("locked");
    expect(cap.f0s.length).toBeGreaterThan(20);
  });
});

describe("middle: each word counts once (19 Nov fix)", () => {
  it("a 媽 held three times longer does not move the middle (recorded frames)", async () => {
    const { measureMiddleTakes, measureMiddle } = await import("./tuner.ts");
    const f0 = (file: string) => frames(file, 0).filter((f) => f.voiced && f.f0 !== null).map((f) => f.f0!);
    const ma1 = f0("jane_ma1.wav"), ma3 = f0("jane_ma3.wav");
    const once = measureMiddleTakes([ma1, ma3])!;
    const long = measureMiddleTakes([[...ma1, ...ma1, ...ma1], ma3])!;
    expect(12 * Math.log2(long / once)).toBeCloseTo(0, 6);
    // It sits between the two words, not on 媽.
    const st1 = 12 * Math.log2(measureMiddle(ma1)! / once), st3 = 12 * Math.log2(measureMiddle(ma3)! / once);
    expect(st1).toBeGreaterThan(1);
    expect(st3).toBeLessThan(-1);
  });
});
