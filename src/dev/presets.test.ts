import { beforeEach, expect, test, vi } from "vitest";
import {
  DEFAULT_TUNING,
  resetTuning,
  setTuning,
  tuning,
} from "../game/tuning.ts";
import type { Tone } from "../game/gates.ts";
import {
  deletePreset,
  formatTuningDiff,
  loadPresets,
  savePreset,
  tuningDiff,
} from "./presets.ts";

// The suite runs in node, so localStorage is stubbed the same way
// settings.test.ts does it.
beforeEach(() => {
  resetTuning();
  const map: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map[k] ?? null,
    setItem: (k: string, v: string) => {
      map[k] = v;
    },
    removeItem: (k: string) => {
      delete map[k];
    },
  } as Storage);
});

test("no diff when nothing has been changed", () => {
  expect(tuningDiff(tuning())).toEqual({});
});

test("diff reports only the fields that moved", () => {
  setTuning({ baseRestMs: 1300, collisionSustainMs: 160 });
  expect(tuningDiff(tuning())).toEqual({
    baseRestMs: 1300,
    collisionSustainMs: 160,
  });
});

test("gate durations diff per tone", () => {
  setTuning({
    gateDurationS: { ...DEFAULT_TUNING.gateDurationS, 1: 0.7 } as Record<
      Tone,
      number
    >,
  });
  expect(tuningDiff(tuning())).toEqual({ gateDurationS: { 1: 0.7 } });
});

test("the formatted diff is pasteable TypeScript", () => {
  setTuning({ baseRestMs: 1300 });
  expect(formatTuningDiff(tuningDiff(tuning()))).toBe("  baseRestMs: 1300,");
});

test("an empty diff formats as a note, not as empty output", () => {
  expect(formatTuningDiff({})).toContain("nothing changed");
});

test("presets round-trip, replace by name, and delete", () => {
  savePreset({ name: "calm", tuning: { baseRestMs: 1500 } });
  savePreset({ name: "calm", tuning: { baseRestMs: 1600 } });
  expect(loadPresets()).toEqual([{ name: "calm", tuning: { baseRestMs: 1600 } }]);
  savePreset({ name: "brisk", tuning: { baseRestMs: 700 } });
  expect(loadPresets()).toHaveLength(2);
  deletePreset("calm");
  expect(loadPresets().map((p) => p.name)).toEqual(["brisk"]);
});

test("corrupt storage yields no presets rather than throwing", () => {
  localStorage.setItem("toneflap.dev.presets.v1", "{not json");
  expect(loadPresets()).toEqual([]);
});
