// Brief 44 step 1: Pierre's halves by the same rule as Jane's ruler (brief 43):
// chao 3 = median of all tone-syllable frames (creak > 10 st under left out),
// up = p90 of single first-tone frames, down = -p10 of single third-tone frames
// (computeRangeHalvesFromExtremes). Dev-only, offline, reads fixtures/captures/pierre/.
//   node src/dev/bench39/player-halves.mjs            # all clips
//   node src/dev/bench39/player-halves.mjs --clean    # without ma3_1 and shu3_2 (Praat shape not T3, brief 41)
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { computeRangeHalvesFromExtremes } from "../../pitch/calibration.ts";
import { CACHE, cachedRun } from "./tracks.mjs";
import { listWavs, pct, med } from "./lib.mjs";

const DIR = "fixtures/captures/pierre";
const OFF_SHAPE = process.argv.includes("--clean") ? ["pierre_ma3_1", "pierre_shu3_2"] : [];
const cal = JSON.parse(readFileSync(`${DIR}/calibration.json`, "utf8"));
const parse = (id) => { const m = id.match(/^pierre_([a-z]+?)(\d+)_(\d+)$/); if (!m) return { id, kind: "other" }; const tones = m[2].split("").map(Number); return { id, tones, kind: tones.length === 1 ? "single" : "pair" }; };
const clips = listWavs(DIR).map((file) => ({ set: "pierre", file, ...parse(basename(file, ".wav")) }))
  .filter((c) => c.kind !== "other" && !OFF_SHAPE.includes(c.id));
const R = (c) => JSON.parse(readFileSync(`${CACHE}/ref-praat/pierre/${c.id}.json`, "utf8"));
const LIVE = { minVoicedRunMs: 64, noiseFloor: 1e-4, f0Center: cal.f0Center };
for (const src of ["praat", "live"]) {
  const f0s = (c) => { if (src === "praat") { const r = R(c); return r.f0.filter((f, i) => r.trusted[i] && f > 0); } const o = cachedRun(c, "live-pierre", LIVE); return o.f0.filter((f, i) => o.v[i] && f > 0); };
  const all = clips.flatMap(f0s);
  const creak = med(all) * 2 ** (-10 / 12);
  const mid = med(all.filter((f) => f >= creak));
  const st = (f) => 12 * Math.log2(f / mid);
  const pool = (t) => clips.filter((c) => c.kind === "single" && c.tones[0] === t).flatMap(f0s).filter((f) => f >= creak).map(st);
  const t1 = pool(1), t3 = pool(3);
  const h = computeRangeHalvesFromExtremes(t1, t3);
  console.log(`${src}: middle ${mid.toFixed(1)} Hz | T1 p90 ${pct(t1, 90).toFixed(2)} (n ${t1.length}) | T3 p10 ${pct(t3, 10).toFixed(2)} (n ${t3.length}) | halves up ${h.up} down ${h.down}`);
}
