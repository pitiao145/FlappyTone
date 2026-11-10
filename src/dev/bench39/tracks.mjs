// Cached runs of the REAL PitchTracker over the local clips (numbers only).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { PitchTracker } from "../../pitch/PitchTracker.ts";
import { listWavs, loadWav, WIN, HOP } from "./lib.mjs";

export const CACHE = "node_modules/.cache/bench39";
export const F0C = 181.3; // Jane's catalog reference centre (wordsFallback meta)
export const T3_RESCUE = { rescueClarity: 0.3, rescueRmsMult: 4, rescueMaxFrames: 8 }; // = clipCut.ts TONE_3_RESCUE
export const SETS = { textbook: "fixtures/clips/jane", natural: "fixtures/clips/jane/natural" };

export function tonesOf(id) {
  const m = id.match(/(\d+)[a-z]?$/);
  return m ? m[1].split("").map(Number) : [];
}
export const groupOf = (tones) => (tones.length === 1 ? `T${tones[0]}` : tones.length === 2 ? "pairs" : "3+syll");
export function clipList() {
  const out = [];
  for (const [set, dir] of Object.entries(SETS)) for (const file of listWavs(dir)) {
    const id = basename(file, ".wav");
    out.push({ set, id, file, tones: tonesOf(id) });
  }
  return out;
}
export function loadRef(set, id) {
  return JSON.parse(readFileSync(`${CACHE}/ref/${set}/${id}.json`, "utf8"));
}
export function refAt(r, t) {
  const i = Math.min(r.t.length - 1, Math.max(0, Math.round((t - r.t[0]) / 0.01)));
  const near = (k) => r.f0[Math.min(r.t.length - 1, Math.max(0, i + k))] > 0;
  return { i, f0: r.f0[i], trusted: !!r.trusted[i], voiced: r.f0[i] > 0, clearlyUnvoiced: !near(-2) && !near(-1) && !near(0) && !near(1) && !near(2) };
}
/** Runs the production tracker on samples. Returns per-frame arrays. */
export function track(samples, sr, cfg) {
  const tr = new PitchTracker({ sampleRate: sr, f0Center: F0C, rangeSemitones: 15, ...cfg });
  const o = { t: [], v: [], f0: [], st: [], cl: [], rms: [] };
  for (let s = 0; s + WIN <= samples.length; s += HOP) {
    const p = tr.push(samples.subarray(s, s + WIN));
    o.t.push(+((s + WIN / 2) / sr).toFixed(4)); o.v.push(p.voiced ? 1 : 0); o.f0.push(p.f0 ? +p.f0.toFixed(2) : 0);
    o.st.push(p.semitones === null ? null : +p.semitones.toFixed(3)); o.cl.push(+p.clarity.toFixed(3)); o.rms.push(+p.rms.toFixed(6));
  }
  return o;
}
/** name: "pipe" (clip pipeline) or "live" (floor 1e-4, minVoicedRun 3). Cached. */
export function cachedTrack(clip, name) {
  const dir = `${CACHE}/trk/${name}/${clip.set}`;
  const f = `${dir}/${clip.id}.json`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const w = loadWav(clip.file);
  const cfg = name === "pipe"
    ? { minVoicedRun: 1, ...(clip.tones.length === 1 && clip.tones[0] === 3 ? T3_RESCUE : {}) }
    : { minVoicedRun: 3, noiseFloor: 1e-4 };
  const o = track(w.samples, w.sampleRate, cfg);
  mkdirSync(dir, { recursive: true });
  writeFileSync(f, JSON.stringify(o));
  return o;
}
