// Brief 44 step 2: which 2-3 short words give a middle (median pitch) closest to
// the speaker's full middle (median of all tone-syllable frames, creak > 10 st under left out)?
// Live tracker frames throughout.
//   Jane, tone mix: all her newer single-word textbook clips of those tones (94 words).
//   Jane, ma words: her older raw takes ma1b/ma2/ma3b/ma4b (fixtures/recordings/2026-08-07-xujzgs).
//   Pierre, ma words and tone mix: fixtures/captures/pierre.
//   node src/dev/bench39/middle-words.mjs
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { clipList, cachedTrack, cachedRun } from "./tracks.mjs";
import { listWavs, med } from "./lib.mjs";

const MIXES = [[2, 4], [1, 3], [2, 3], [3, 4], [1, 4], [2, 3, 4], [1, 2, 3], [1, 3, 4], [1, 2, 4], [1, 2, 3, 4]];
const st = (f, c) => 12 * Math.log2(f / c);
const middleOf = (frames) => { const c = med(frames) * 2 ** (-10 / 12); return med(frames.filter((f) => f >= c)); };
const voiced = (o) => o.f0.filter((f, i) => o.v[i] && f > 0);

const jane = clipList().filter((c) => c.set === "textbook");
const jf = (c) => voiced(cachedTrack(c, "live"));
const janeAll = middleOf(jane.flatMap(jf));
const janeSingle = (t) => jane.filter((c) => c.tones.length === 1 && c.tones[0] === t);
const OLD = "fixtures/recordings/2026-08-07-xujzgs";
const janeMa = { 1: "ma1b", 2: "ma2", 3: "ma3b", 4: "ma4b" };
const jmf = (t) => voiced(cachedRun({ set: "jane-older", id: janeMa[t], file: `${OLD}/${janeMa[t]}.wav` }, "live-older", { minVoicedRunMs: 64, noiseFloor: 1e-4 }));

const DIR = "fixtures/captures/pierre";
const cal = JSON.parse(readFileSync(`${DIR}/calibration.json`, "utf8"));
const pClips = listWavs(DIR).map((file) => ({ set: "pierre", file, id: basename(file, ".wav") })).filter((c) => /^pierre_[a-z]+\d+_\d$/.test(c.id));
const pf = (c) => voiced(cachedRun(c, "live-pierre", { minVoicedRunMs: 64, noiseFloor: 1e-4, f0Center: cal.f0Center }));
const pAll = middleOf(pClips.flatMap(pf));
const pSingle = (t, word) => pClips.filter((c) => { const m = c.id.match(/^pierre_([a-z]+)(\d)_\d$/); return m && +m[2] === t && (!word || m[1] === word); });

console.log(`full middle: Jane ${janeAll.toFixed(1)} Hz (${jane.length} textbook clips) | Pierre ${pAll.toFixed(1)} Hz (${pClips.length} clips)`);
console.log("tones         | Jane tone mix | Jane ma words | Pierre tone mix | Pierre ma words   (st from full middle)");
for (const m of MIXES) {
  const a = st(middleOf(m.flatMap((t) => janeSingle(t).flatMap(jf))), janeAll);
  const b = st(middleOf(m.flatMap(jmf)), janeAll);
  const c = st(middleOf(m.flatMap((t) => pSingle(t).flatMap(pf))), pAll);
  const d = st(middleOf(m.flatMap((t) => pSingle(t, "ma").flatMap(pf))), pAll);
  console.log(`${m.map((t) => "T" + t).join("+").padEnd(13)} | ${a.toFixed(2).padStart(6)} | ${b.toFixed(2).padStart(6)} | ${c.toFixed(2).padStart(6)} | ${d.toFixed(2).padStart(6)}`);
}
