// Brief 49 — shared data for the pair-cut bench: Jane's pair clips (spoken
// tones), live tracker frames, and the reference cut per clip.
// Dev-only, offline, numbers only. Not imported by the app.
//
// Reference cut (step 1 of the brief):
//   "silence": the clip pipeline's own syllable runs (multiSyllableSpan, as in
//              brief 46) when the voice really stops between the syllables.
//   "praat":   otherwise, Praat's view of the clip where it is clear:
//              (p) exactly one unvoiced stretch of >= 30 ms in Praat's pitch
//                  track, 15-85% into the voiced word → its middle; else
//              (i) one clear loudness dip in Praat's intensity, 20-80% into
//                  the word, >= 4 dB under the quieter side's peak, and no
//                  second dip >= 3 dB more than 60 ms away → its bottom.
//   null:      no clear reference; left out of the cut-error numbers.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { multiSyllableSpan } from "../clipCutMulti.ts";
import { clipNoiseFloor } from "../clipCut.ts";
import { spokenTones } from "../../game/sandhi.ts";
import { wordsFromCatalog } from "../../game/words.ts";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
import { clipList, cachedTrack, cachedRun, CACHE, F0C } from "./tracks.mjs";
import { loadWav, listWavs } from "./lib.mjs";
import { basename } from "node:path";

export const RULER = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8")).ruler;
export const JANE_GRIDS = {
  old: { mid: 0, up: 7, down: 5.75, flag: false },
  ruler: { mid: 12 * Math.log2(RULER.middleHz / F0C), up: RULER.upSemitones, down: RULER.downSemitones, flag: true },
};

const SPOKEN = new Map(
  wordsFromCatalog(JSON.parse(readFileSync("src/data/wordsFallback.json", "utf8")).rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID }))).map((w) => [w.id, spokenTones(w)]),
);
/** Spoken tones (sandhi applied) when the catalog knows the word, else the file name's tones. */
export function truthOf(id, fileTones) {
  const s = SPOKEN.get(id);
  if (s && s.length === fileTones.length) return s;
  return fileTones[0] === 3 && fileTones[1] === 3 ? [2, 3] : fileTones;
}

export function liveFrames(c) {
  const o = cachedTrack(c, "live"), out = [];
  for (let i = 0; i < o.t.length; i++) if (o.v[i]) out.push({ tMs: o.t[i] * 1000, st: o.st[i], rms: o.rms[i] });
  return out;
}

const praatPitch = (set, id) => JSON.parse(readFileSync(`${CACHE}/ref-praat/${set}/${id}.json`, "utf8"));
const praatInt = (set, id) => JSON.parse(readFileSync(`${CACHE}/ref-praat-int/${set}/${id}.json`, "utf8"));

function pipelineRef(c) {
  const F = RULER.measuredAtHz;
  const { samples, sampleRate } = loadWav(c.file);
  const span = multiSyllableSpan(samples, sampleRate, F, 2, { noiseFloor: clipNoiseFloor(samples, sampleRate, F) });
  if (!span || span.runs.length !== 2) return null;
  const ms = (s) => (s / sampleRate) * 1000;
  return { cut: (ms(span.runs[0].end) + ms(span.runs[1].start)) / 2, silence: !span.underSegmented };
}

/** Praat-based reference cut (ms) and how it was found, or null. */
export function praatRef(set, id) {
  const p = praatPitch(set, id);
  const v = p.f0.map((f) => f > 0);
  const first = v.indexOf(true), last = v.lastIndexOf(true);
  if (first < 0 || last - first < 10) return null;
  const T = (i) => p.t[i] * 1000, L = T(last) - T(first);
  // (p) unvoiced stretches inside the word
  const gaps = [];
  for (let i = first + 1; i < last; ) {
    if (v[i]) { i++; continue; }
    let j = i; while (j < last && !v[j]) j++;
    const a = T(i - 1), z = T(j), mid = (a + z) / 2;
    if (j - i >= 3 && mid > T(first) + 0.15 * L && mid < T(first) + 0.85 * L) gaps.push({ mid, len: j - i });
    i = j;
  }
  if (gaps.length === 1) return { cut: gaps[0].mid, how: "praat-unvoiced" };
  if (gaps.length > 1) return null;
  // (i) one clear loudness dip
  const it = praatInt(set, id);
  const pts = it.t.map((t, k) => ({ tMs: t * 1000, db: it.db[k] })).filter((q) => q.tMs >= T(first) && q.tMs <= T(last));
  if (pts.length < 10) return null;
  const lo = T(first) + 0.2 * L, hi = T(first) + 0.8 * L;
  const depthAt = (k) => {
    const l = Math.max(...pts.slice(0, k).map((q) => q.db)), r = Math.max(...pts.slice(k + 1).map((q) => q.db));
    return Math.min(l, r) - pts[k].db;
  };
  const mins = [];
  for (let k = 1; k < pts.length - 1; k++) {
    if (pts[k].tMs < lo || pts[k].tMs > hi) continue;
    if (pts[k].db <= pts[k - 1].db && pts[k].db <= pts[k + 1].db) mins.push({ k, tMs: pts[k].tMs, depth: depthAt(k) });
  }
  if (!mins.length) return null;
  mins.sort((a, b) => b.depth - a.depth);
  const best = mins[0];
  if (best.depth < 4) return null;
  if (mins.some((m) => m !== best && m.depth >= 3 && Math.abs(m.tMs - best.tMs) > 60)) return null;
  return { cut: best.tMs, how: "praat-dip" };
}

/** Jane's two-syllable clips (no neutral tone), with frames, truth and reference. Cached refs. */
export function janePairs() {
  const f = `${CACHE}/cut49-refs.json`;
  const cache = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  let dirty = false;
  const out = [];
  for (const c of clipList()) {
    if (c.tones.length !== 2 || c.tones.includes(0)) continue;
    const key = c.set + "/" + c.id;
    if (!(key in cache)) {
      const pr = pipelineRef(c);
      const pz = praatRef(c.set, c.id);
      cache[key] = { pipe: pr, praat: pz };
      dirty = true;
    }
    const { pipe, praat } = cache[key];
    const ref = pipe?.silence ? { cut: pipe.cut, how: "silence" } : praat;
    const fr = liveFrames(c);
    if (fr.length < 3) continue;
    out.push({ ...c, truth: truthOf(c.id, c.tones), fr, ref, pipe, praat });
  }
  if (dirty) { mkdirSync(CACHE, { recursive: true }); writeFileSync(f, JSON.stringify(cache)); }
  return out;
}

// ---- Pierre ---------------------------------------------------------------------
const PDIR = "fixtures/captures/pierre";
export const pierreReady = () => existsSync(`${PDIR}/calibration.json`);
/** pierre_<pinyin><tones>[_<textbook|natural>]_<take> */
export function pierrePairs() {
  const cal = JSON.parse(readFileSync(`${PDIR}/calibration.json`, "utf8"));
  const LIVE = { minVoicedRunMs: 64, noiseFloor: 1e-4, f0Center: cal.f0Center };
  const out = [];
  for (const file of listWavs(PDIR)) {
    const id = basename(file, ".wav");
    const m = id.match(/^pierre_([a-z]+?)(\d\d)(?:_(textbook|natural))?_(\d+)$/);
    if (!m || m[2].includes("0")) continue;
    const tones = m[2].split("").map(Number);
    const c = { set: "pierre", id, file, tones };
    const o = cachedRun(c, "live-pierre", LIVE), fr = [];
    for (let i = 0; i < o.t.length; i++) if (o.v[i]) fr.push({ tMs: o.t[i] * 1000, st: o.st[i], rms: o.rms[i] });
    const hasInt = existsSync(`${CACHE}/ref-praat-int/pierre/${id}.json`) && existsSync(`${CACHE}/ref-praat/pierre/${id}.json`);
    out.push({ ...c, word: m[1] + m[2], style: m[3] ?? "natural", take: +m[4], truth: truthOf(m[1] + m[2], tones), fr, ref: hasInt ? praatRef("pierre", id) : null });
  }
  return { cal, clips: out };
}
