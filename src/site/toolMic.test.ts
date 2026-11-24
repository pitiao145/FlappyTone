/**
 * Brief 53: the tool page's board comes from the game's own settings (with the
 * learned scale), else the saved voice choice; it never writes either.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveRuler, seedRuler, withHalves } from "../game/playerRuler.ts";
import type { CalibrationSettings } from "../game/settings.ts";
import { quickStartSettings } from "../game/voiceStart.ts";

const CAL: CalibrationSettings = { f0Center: 130, noiseFloor: 3e-4, rangeSemitones: 3, rangeDownSemitones: 4 };

describe("toolSettings", () => {
  let writes: string[];
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map<string, string>();
    writes = [];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writes.push(k);
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  it("no settings and no voice choice: null (the page asks for a voice)", async () => {
    const { toolSettings } = await import("./toolMic.ts");
    expect(toolSettings()).toBeNull();
  });

  it("a saved voice choice: its quick start, written nowhere", async () => {
    const { toolSettings } = await import("./toolMic.ts");
    const { saveVoiceStart } = await import("../game/voiceStart.ts");
    saveVoiceStart("higher");
    writes = [];
    expect(toolSettings()).toEqual(quickStartSettings("higher"));
    expect(writes).toEqual([]);
  });

  it("the game's calibration wins, with the learned scale once there is one", async () => {
    store.set("toneflap.settings.v3", JSON.stringify(CAL));
    const { toolSettings } = await import("./toolMic.ts");
    expect(toolSettings()).toMatchObject({ f0Center: 130, rangeSemitones: 3, rangeDownSemitones: 4 });
    saveRuler(withHalves(seedRuler(CAL), 5.5, 6));
    writes = [];
    expect(toolSettings()).toMatchObject({ rangeSemitones: 5.5, rangeDownSemitones: 6 });
    expect(writes).toEqual([]);
  });
});
