/**
 * Brief 43 dev switch: fly the one-ruler target shapes from
 * `src/dev/local/shapes-v2.json` instead of the catalog's.
 *
 * On only when `localStorage["ft.shapesV2"] === "1"`, and only in a dev
 * build: `src/data/words.ts` calls this behind `import.meta.env.DEV` at the
 * call site, so neither this module nor the JSON reaches `dist/` (hard rule 7).
 *
 * Replaces the shape fields only — `polyline`, `durationS`, `onsetS` — for the
 * textbook take (top level) and the natural take (`natural`). The audio, its
 * length (`clipS`) and everything else stay as the catalog has them; the
 * re-measured onset and duration sit inside the same file.
 *
 * Never throws (hard rule 10): any failure returns the words unchanged.
 */
import file from "./local/shapes-v2.json";
import type { ClipMeasurements, Word } from "../game/words.ts";
import { setTuning, type Polyline } from "../game/tuning.ts";

export const SHAPES_V2_KEY = "ft.shapesV2";

interface Shape {
  polyline: Polyline;
  onset_s: number;
  duration_s: number;
}

const shapes = file as unknown as { textbook: Record<string, Shape>; natural: Record<string, Shape> };

function on(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SHAPES_V2_KEY) === "1";
  } catch {
    return false;
  }
}

function fits(s: Shape | undefined, clipS: number): s is Shape {
  return (
    !!s &&
    Array.isArray(s.polyline) &&
    s.polyline.length >= 2 &&
    s.duration_s > 0 &&
    s.onset_s >= 0 &&
    s.onset_s + s.duration_s <= clipS + 0.05
  );
}

function swap<T extends { polyline: Polyline; durationS: number; onsetS: number; clipS: number }>(
  take: T,
  s: Shape | undefined,
): T {
  return fits(s, take.clipS) ? { ...take, polyline: s.polyline, durationS: s.duration_s, onsetS: s.onset_s } : take;
}

export function applyShapesV2(words: Word[]): Word[];
export function applyShapesV2(words: Word[] | null): Word[] | null;
export function applyShapesV2(words: Word[] | null): Word[] | null {
  if (!words || !on()) return words;
  try {
    return words.map((w) => {
      // A word re-pointed at its natural take carries natural at the top level.
      const top = w.clipStyle === "natural" ? shapes.natural[w.id] : shapes.textbook[w.id];
      const out = swap(w, top);
      return w.natural ? { ...out, natural: swap<ClipMeasurements>(w.natural, shapes.natural[w.id]) } : out;
    });
  } catch {
    return words;
  }
}

/**
 * Brief 44: the same switch turns on the player's one ruler
 * (`tuning().playerRulerV2`): the middle step in calibration and the grid
 * that learns in play. Dev builds only — GameApp calls this behind
 * `import.meta.env.DEV`. Production keeps the flag off until brief 48.
 */
export function applyPlayerRulerSwitch(): void {
  if (on()) setTuning({ playerRulerV2: true });
}
