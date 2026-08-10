import { beforeEach, expect, test, vi } from "vitest";
import {
  DEFAULT_TUNING,
  resetTuning,
  setTuning,
  tuning,
  type Polyline,
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
  setTuning({ baseRestMs: 1300, collisionSustainMs: 180 });
  expect(tuningDiff(tuning())).toEqual({
    baseRestMs: 1300,
    collisionSustainMs: 180,
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

test("an edited corridor shape shows up in the diff, per tone", () => {
  setTuning({
    polylines: { 1: [[0, 3], [1, 3]] } as Record<Tone, Polyline>,
  });
  expect(tuningDiff(tuning()).polylines).toEqual({ 1: [[0, 3], [1, 3]] });
});

test("an untouched shape is not reported just because it was cloned", () => {
  resetTuning();
  expect(tuningDiff(tuning()).polylines).toBeUndefined();
});

test("a shape formats as a pasteable DEFAULT_POLYLINES entry", () => {
  setTuning({
    polylines: { 4: [[0, 5], [0.618, 5], [1, 1.25]] } as Record<Tone, Polyline>,
  });
  expect(formatTuningDiff(tuningDiff(tuning()))).toBe(
    "  4: [\n    [0, 5],\n    [0.62, 5],\n    [1, 1.25],\n  ],",
  );
});
