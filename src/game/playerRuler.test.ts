import { beforeEach, describe, expect, it, vi } from "vitest";
import { RULER_KEY, learnRuler, loadRuler, rulerGrid, saveRuler, seedRuler, withHalves } from "./playerRuler.ts";
import type { CalibrationSettings } from "./settings.ts";

const CAL: CalibrationSettings = { f0Center: 130, noiseFloor: 3e-4, rangeSemitones: 4.5, rangeDownSemitones: 4 };

describe("player ruler record (brief 44)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  it("an old calibration seeds the ruler: middle and halves carried over, not yet learned", () => {
    const r = loadRuler(CAL);
    expect(r.learned).toBe(false);
    expect(rulerGrid(r)).toEqual({ f0Center: 130, up: 4.5, down: 4 });
  });

  it("does not touch the calibration record", () => {
    localStorage.setItem("toneflap.settings.v3", JSON.stringify(CAL));
    saveRuler(seedRuler(CAL));
    expect(JSON.parse(localStorage.getItem("toneflap.settings.v3")!)).toEqual(CAL);
  });

  it("round-trips through storage", () => {
    let r = seedRuler(CAL);
    r = learnRuler(r, { semitones: Array(30).fill(0.5), targetChao: Array(30).fill(3.25), tone: 2, heard: true });
    saveRuler(r);
    const back = loadRuler(CAL);
    expect(back.state.grid).toEqual(r.state.grid);
    expect(back.state.gates).toBe(1);
  });

  it("a new calibration reseeds; an unreadable record reseeds", () => {
    saveRuler(withHalves(seedRuler(CAL), 6, 7));
    expect(rulerGrid(loadRuler({ ...CAL, f0Center: 140 })).f0Center).toBe(140);
    localStorage.setItem(RULER_KEY, "{not json");
    expect(rulerGrid(loadRuler(CAL))).toEqual({ f0Center: 130, up: 4.5, down: 4 });
    localStorage.setItem(RULER_KEY, JSON.stringify({ version: 1, refHz: 130 }));
    expect(loadRuler(CAL).learned).toBe(false);
  });

  it("an unheard gate changes nothing", () => {
    const r = seedRuler(CAL);
    expect(learnRuler(r, { semitones: Array(30).fill(0.5), tone: 1, heard: false })).toBe(r);
  });
});

describe("brief 50: the learned scale everywhere, quick start", () => {
  let store: Map<string, string>;
  let writes = 0;
  beforeEach(() => {
    store = new Map<string, string>();
    writes = 0;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { writes++; store.set(k, v); },
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  it("withLearnedScale: the learned grid when this calibration has one, and it never writes", async () => {
    const { withLearnedScale } = await import("./playerRuler.ts");
    expect(withLearnedScale(CAL)).toEqual(CAL); // nothing learned yet: the calibration
    expect(writes).toBe(0);
    saveRuler(withHalves(seedRuler(CAL), 5, 6));
    writes = 0;
    const out = withLearnedScale(CAL);
    expect(out).toMatchObject({ f0Center: 130, rangeSemitones: 5, rangeDownSemitones: 6, noiseFloor: CAL.noiseFloor });
    expect(writes).toBe(0);
    // Another calibration's record is not this one's scale.
    expect(withLearnedScale({ ...CAL, f0Center: 150 })).toEqual({ ...CAL, f0Center: 150 });
  });

  it("a quick-start record learns with the faster start; a calibrated one does not", () => {
    const qs: CalibrationSettings = { ...CAL, quickStart: true };
    const far = (s: CalibrationSettings) => learnRuler(seedRuler(s), { semitones: Array(30).fill(-5), targetChao: Array(30).fill(3.25), tone: 2, heard: true });
    const fast = far(qs), slow = far(CAL);
    expect(fast.quickStart).toBe(true);
    expect(Math.abs(fast.state.grid.midSt)).toBeGreaterThan(3); // ~70% of the gap
    expect(Math.abs(slow.state.grid.midSt)).toBeLessThan(1); // 10%
  });

  it("a preset record is not reused for a calibration with the same middle", () => {
    const qs: CalibrationSettings = { ...CAL, quickStart: true };
    saveRuler(withHalves(seedRuler(qs), 7, 7));
    expect(rulerGrid(loadRuler(CAL)).up).toBe(CAL.rangeSemitones);
  });
});
