import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveRuler, seedRuler, withHalves } from "../../game/playerRuler.ts";
import type { CalibrationSettings } from "../../game/settings.ts";

const CAL: CalibrationSettings = { f0Center: 130, noiseFloor: 3e-4, rangeSemitones: 3, rangeDownSemitones: 4 };

describe("public tone checker reads the learned scale (brief 50)", () => {
  let writes: string[];
  beforeEach(() => {
    const store = new Map<string, string>();
    writes = [];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { writes.push(k); store.set(k, v); },
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    localStorage.setItem("toneflap.settings.v3", JSON.stringify(CAL));
  });

  it("uses the calibration when nothing is learned, the learned scale when it is, and never writes", async () => {
    const { savedBoard } = await import("./engine.ts");
    writes = [];
    expect(savedBoard()?.cal).toMatchObject({ f0Center: 130, rangeSemitones: 3, rangeDownSemitones: 4 });
    saveRuler(withHalves(seedRuler(CAL), 5.5, 6));
    writes = [];
    expect(savedBoard()).toMatchObject({ fromApp: true, cal: { rangeSemitones: 5.5, rangeDownSemitones: 6 } });
    expect(writes).toEqual([]);
  });
});
