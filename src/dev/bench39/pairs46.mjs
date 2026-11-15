// Brief 46: the pair read with the shared syllable finder (src/game/syllables.ts),
// measured through the production path (readContourSyllables with the word's count).
// Used by scorecard.mjs section 8. Dev-only, offline, numbers only.
//
// Reference cut: the clip pipeline's own syllable runs (multiSyllableSpan, centre =
// shapes-v2 ruler.measuredAtHz, per-clip gate). Trusted on textbook only (Pierre,
// 15 Nov 2026): on natural pairs 39% of those cuts are artefacts (split46.mjs).
import { readFileSync } from "node:fs";
import { multiSyllableSpan } from "../clipCutMulti.ts";
import { clipNoiseFloor } from "../clipCut.ts";
import { findSyllables } from "../../game/syllables.ts";
import { readContourSyllables } from "../../game/freeAttempts.ts";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { setTuning, tuning } from "../../game/tuning.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { clipList, cachedTrack, F0C } from "./tracks.mjs";
import { loadWav } from "./lib.mjs";

const RULER = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8")).ruler;
export const GRIDS46 = {
  old: { mid: 0, up: 7, down: 5.75, flag: false }, // scorecard section 4 board, flag off
  ruler: { mid: 12 * Math.log2(RULER.middleHz / F0C), up: RULER.upSemitones, down: RULER.downSemitones, flag: true },
};

/** The pipeline's cut times (ms, clip time), one per syllable join. */
function referenceCuts(c) {
  const F = RULER.measuredAtHz;
  const { samples, sampleRate } = loadWav(c.file);
  const span = multiSyllableSpan(samples, sampleRate, F, c.tones.length, { noiseFloor: clipNoiseFloor(samples, sampleRate, F) });
  if (!span || span.runs.length !== c.tones.length) return null;
  const ms = (s) => (s / sampleRate) * 1000;
  return span.runs.slice(0, -1).map((r, k) => (ms(r.end) + ms(span.runs[k + 1].start)) / 2);
}
function liveFrames(c) {
  const o = cachedTrack(c, "live"), out = [];
  for (let i = 0; i < o.t.length; i++) if (o.v[i]) out.push({ tMs: o.t[i] * 1000, st: o.st[i], rms: o.rms[i] });
  return out;
}
const contourOf = (frames, g) => {
  const t0 = frames[0].tMs;
  const points = frames.map((f) => ({ tMs: f.tMs - t0, chao: semitonesToChao(f.st - g.mid, g.up, g.down), rms: f.rms }));
  return { points, startedAtMs: 0, endedAtMs: points.at(-1).tMs };
};
const isQ = (t) => t === null || t === "none";

let refCache = null;
/** Per style: { n, found %, countRight % (textbook), and per grid: both right %, oracle both right %, ? %, wrong reads with a cut > 80 ms off }. */
export function measurePairs46() {
  const clips = clipList().filter((c) => c.tones.length === 2 && c.tones.every((t) => t >= 1));
  refCache ??= new Map(clips.map((c) => [c.set + c.id, referenceCuts(c)]));
  const out = {};
  for (const style of ["textbook", "natural"]) {
    const ks = clips.filter((c) => c.set === style).map((c) => ({ c, fr: liveFrames(c), ref: refCache.get(c.set + c.id) })).filter((x) => x.fr.length >= 3);
    let found = 0, countRight = 0;
    for (const { c, fr, ref } of ks) {
      const p = findSyllables(fr, c.tones.length);
      if (!p) continue;
      found++;
      if (ref && p.slice(0, -1).every((q, k) => Math.abs((q.at(-1).tMs + p[k + 1][0].tMs) / 2 - ref[k]) <= 50)) countRight++;
    }
    const res = { n: ks.length, found: (100 * found) / ks.length, countRight: (100 * countRight) / ks.length };
    for (const [g, grid] of Object.entries(GRIDS46)) {
      setTuning({ playerRulerV2: grid.flag });
      let both = 0, oracle = 0, q = 0, syl = 0, wrongBadCut = 0;
      for (const { c, fr, ref } of ks) {
        const read = readContourSyllables(contourOf(fr, grid), c.tones.length) ?? c.tones.map(() => null);
        syl += c.tones.length; q += read.filter(isQ).length;
        const tones = read.map((r) => r?.tone ?? null);
        if (tones.every((t, i) => t === c.tones[i])) both++;
        const p = findSyllables(fr, c.tones.length);
        if (p && ref && p.slice(0, -1).some((s, k) => Math.abs((s.at(-1).tMs + p[k + 1][0].tMs) / 2 - ref[k]) > 80) && tones.some((t, i) => !isQ(t) && t !== c.tones[i])) wrongBadCut++;
        if (ref) {
          const pieces = [fr.filter((f) => f.tMs < ref[0]), fr.filter((f) => f.tMs >= ref[0])];
          const ok = pieces.every((piece, i) => piece.length >= 2 && piece.at(-1).tMs - piece[0].tMs >= tuning().minUtteranceMs && classifyToneV2(contourOf(piece, grid))?.tone === c.tones[i]);
          if (ok) oracle++;
        }
      }
      res[g] = { both: (100 * both) / ks.length, oracle: (100 * oracle) / ks.length, question: (100 * q) / syl, wrongBadCut };
    }
    setTuning({ playerRulerV2: false });
    out[style] = res;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(measurePairs46(), null, 1));
