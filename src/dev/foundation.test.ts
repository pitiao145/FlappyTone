/**
 * Brief 48: the Lab's "old / new foundation" toggle flips the target shapes
 * (43), the player's grid (44) and the reader (45) together.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetTuning, tuning } from "../game/tuning.ts";
import { readerSettings } from "../game/toneClassifierV2.ts";
import { catalogFromFallback } from "../data/words.ts";
import { applyShapesV2, foundationOn, setFoundation, SHAPES_V2_KEY } from "./shapesV2.ts";

let map: Record<string, string>;
beforeEach(() => {
  resetTuning();
  map = {};
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
afterEach(() => {
  resetTuning();
  vi.unstubAllGlobals();
});

const ma1b = (words: ReturnType<typeof catalogFromFallback>) => words.find((w) => w.id === "ma1b")!;

test("off by default: old shapes, old grid, old reader", () => {
  expect(foundationOn()).toBe(false);
  expect(tuning().playerRulerV2).toBe(false);
  expect(readerSettings()).not.toBe(tuning().toneReaderRuler);
  const words = catalogFromFallback();
  expect(applyShapesV2(words)).toBe(words);
});

test("new foundation: all three on together", () => {
  const before = ma1b(catalogFromFallback()).polyline;
  setFoundation(true);
  expect(map[SHAPES_V2_KEY]).toBe("1");
  expect(foundationOn()).toBe(true);
  expect(tuning().playerRulerV2).toBe(true);
  expect(readerSettings()).toBe(tuning().toneReaderRuler);
  const after = ma1b(applyShapesV2(catalogFromFallback())).polyline;
  expect(after).not.toEqual(before);
});

test("back to old foundation: all three off together", () => {
  setFoundation(true);
  setFoundation(false);
  expect(SHAPES_V2_KEY in map).toBe(false);
  expect(tuning().playerRulerV2).toBe(false);
  expect(readerSettings()).not.toBe(tuning().toneReaderRuler);
  const words = catalogFromFallback();
  expect(applyShapesV2(words)).toBe(words);
});
