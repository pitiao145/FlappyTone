/**
 * Tuning presets and diffs for the dev Lab.
 *
 * A tuning session is only useful if what it found can leave the browser. The
 * diff against DEFAULT_TUNING is the deliverable: it names exactly the numbers
 * that moved, in a form that can be pasted into src/game/tuning.ts. Presets are
 * the cheap in-session version — flip between two candidate feels without
 * losing either.
 *
 * Dev only. Nothing here is imported by the player-facing app.
 */

import {
  DEFAULT_POLYLINES,
  DEFAULT_TUNING,
  setTuning,
  type Polyline,
  type Tuning,
} from "../game/tuning.ts";
import type { Tone } from "../game/gates.ts";

export interface Preset {
  name: string;
  tuning: Partial<Tuning>;
}

const KEY = "toneflap.dev.presets.v1";

/** Control points carry pointer noise; two decimals is beyond what anyone can hear. */
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
const TONES: Tone[] = [1, 2, 3, 4];

/** Structural equality — polylines are rebuilt on every reset, so `!==` lies. */
function samePolyline(a: Polyline, b: Polyline): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1])
  );
}

/** The fields of `t` that differ from the shipped defaults. */
export function tuningDiff(t: Readonly<Tuning>): Partial<Tuning> {
  const diff: Partial<Tuning> = {};
  for (const key of Object.keys(DEFAULT_TUNING) as Array<keyof Tuning>) {
    if (key === "gateDurationS" || key === "polylines") continue;
    if (t[key] !== DEFAULT_TUNING[key]) {
      // Every non-gateDurationS field is a number; the cast is the price of
      // iterating the keys generically.
      (diff[key] as number) = t[key] as number;
    }
  }
  const durations: Partial<Record<Tone, number>> = {};
  for (const tone of TONES) {
    if (t.gateDurationS[tone] !== DEFAULT_TUNING.gateDurationS[tone]) {
      durations[tone] = t.gateDurationS[tone];
    }
  }
  if (Object.keys(durations).length > 0) {
    diff.gateDurationS = durations as Record<Tone, number>;
  }

  const shapes: Partial<Record<Tone, Polyline>> = {};
  for (const tone of TONES) {
    if (!samePolyline(t.polylines[tone], DEFAULT_POLYLINES[tone])) {
      shapes[tone] = t.polylines[tone];
    }
  }
  if (Object.keys(shapes).length > 0) {
    diff.polylines = shapes as Record<Tone, Polyline>;
  }
  return diff;
}

/** The diff as TypeScript source, ready to paste over DEFAULT_TUNING's fields. */
export function formatTuningDiff(diff: Partial<Tuning>): string {
  const entries = Object.entries(diff).map(([k, v]) => {
    if (k === "gateDurationS") {
      return `  gateDurationS: { ${Object.entries(v as Record<string, number>)
        .map(([tone, secs]) => `${tone}: ${secs}`)
        .join(", ")} },`;
    }
    if (k === "polylines") {
      // Emitted in the shape DEFAULT_POLYLINES itself uses, so an edited
      // corridor can be pasted straight over the entry it replaces.
      const tones = Object.entries(v as Record<string, Polyline>).map(
        ([tone, pts]) =>
          `  ${tone}: [\n${pts
            .map(([t, chao]) => `    [${round(t)}, ${round(chao)}],`)
            .join("\n")}\n  ],`,
      );
      return tones.join("\n");
    }
    return `  ${k}: ${v as number},`;
  });
  return entries.length === 0
    ? "// nothing changed from DEFAULT_TUNING"
    : entries.join("\n");
}

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Preset[];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p?.name === "string") : [];
  } catch {
    return [];
  }
}

/** Saves under `p.name`, replacing any preset already using it. */
export function savePreset(p: Preset): void {
  const next = [...loadPresets().filter((e) => e.name !== p.name), p];
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function deletePreset(name: string): void {
  localStorage.setItem(
    KEY,
    JSON.stringify(loadPresets().filter((e) => e.name !== name)),
  );
}

/** Applies a preset on top of whatever is in force. */
export function applyPreset(p: Preset): void {
  setTuning(p.tuning);
}
