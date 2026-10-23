/**
 * The tone visualizer's board and scorer, with no microphone: the in-app
 * visualiser's own renderer (`drawVisualiser`: chao grid, corridor, bird) and
 * its own scoring (`toneAccuracyDetail`, `classifyToneV2`). The page imports
 * this lazily on mount to draw the idle board; `engine.ts` (the mic chunk)
 * imports it too. No `src/audio/`, no `src/pitch/` runtime.
 */

import type { Contour } from "../../game/contours.ts";
import type { Tone } from "../../game/gates.ts";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { readContourSyllables } from "../../game/freeAttempts.ts";
import { toneAccuracyDetail } from "../../game/toneAccuracy.ts";
import { corridorChaoAt, shapeForWord } from "../../game/gates.ts";
import type { Word } from "../../game/words.ts";
import { scaleForDpr } from "../../render/canvas.ts";
import { drawVisualiser } from "../../render/visualiser.ts";
import { polylineOf, type RefMode, type ToneRef } from "./toneRefs.ts";

/** The same span the in-app visualiser draws (`Visualiser.tsx`'s SPAN_MS). */
export const SPAN_MS = 1600;

/** A `Word` for the shared renderer, from a reference shape. */
export function targetWord(ref: ToneRef, mode: RefMode): Word {
  return {
    id: `ref-${ref.id}-${mode}`,
    hanzi: "",
    pinyin: "",
    speakerId: "jane",
    english: "",
    tone: ref.tones[0],
    tones: ref.tones,
    syllables: ref.tones.length,
    clipKey: "",
    durationS: ref.durationS,
    onsetS: 0,
    clipS: ref.durationS,
    polyline: polylineOf(ref, mode),
    minTier: "free",
    updatedAt: "",
    listIds: [],
  };
}

/** The target on the 61-point grid tone accuracy compares on. */
export function referencePoints(word: Word): number[] {
  const shape = shapeForWord(word);
  return Array.from({ length: 61 }, (_, i) => corridorChaoAt(shape, i / 60));
}

export interface AttemptResult {
  /** 0..1 against the chosen line; null = couldn't hear that. */
  accuracy: number | null;
  /** v2's read, single syllables only. */
  read: { tone: Tone | "none"; confidence: number } | null;
  /**
   * Pairs only: one read per syllable, split at the gap between them (the
   * app's Tone pairs mode does the same). null entries were too short to
   * judge; null overall for a single syllable.
   */
  syllables: (Tone | "none" | null)[] | null;
}

/** What a finished utterance scored against the chosen line. */
export function scoreAttempt(contour: Contour, word: Word, mode: RefMode): AttemptResult {
  const accuracy =
    toneAccuracyDetail(
      contour.points,
      word.tones,
      referencePoints(word),
      mode === "real" ? "natural" : "textbook",
      // The T2/T3 cue judges likeness to real speech, not to the textbook line.
      mode === "real",
    )?.accuracy ?? null;
  // The classifier misreads a two-syllable contour (same rule as the app).
  const r = word.syllables === 1 && accuracy !== null ? classifyToneV2(contour) : null;
  const syllables =
    word.syllables > 1 && accuracy !== null
      ? (readContourSyllables(contour)?.map((s) => s?.tone ?? null) ?? [])
      : null;
  return { accuracy, read: r ? { tone: r.tone, confidence: r.confidence } : null, syllables };
}

/** The idle board: the target and the bird at rest, nothing heard yet. */
export function drawIdle(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  ref: ToneRef,
  mode: RefMode,
): void {
  const ctx = scaleForDpr(canvas, width, height);
  if (!ctx) return;
  const word = targetWord(ref, mode);
  drawVisualiser(ctx, width, height, {
    tone: word.tone,
    word,
    live: null,
    finished: [],
    spanMs: SPAN_MS,
    chao: 3,
    voiced: false,
  });
}
