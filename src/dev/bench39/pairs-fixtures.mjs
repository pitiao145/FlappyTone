// Brief 43: the four tone-pair fixtures (fixtures/tonepairs/wav, Jane) measured
// like the shapes file — per-clip gate, Jane's one ruler, multi-syllable fit —
// and the worst gap between the corridor and the contour it was fitted to, in
// chao on that ruler (clipCutMulti.test.ts asks < 0.45 on its ±15 st board; the
// tightest corridor the game draws is about 0.47).
//   node src/dev/bench39/pairs-fixtures.mjs
import { readFileSync } from "node:fs";
import { cutClip, clipNoiseFloor, MEASURE_RANGE_SEMITONES as R } from "../clipCut.ts";
import { multiSyllablePolyline, refinedMultiSyllablePolyline } from "../clipCutMulti.ts";
import { corridorChaoAt, shapeForWord } from "../../game/gates.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { loadWav, fmt } from "./lib.mjs";

const { ruler } = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8"));
const F = ruler.middleHz;
for (const [id, f] of [["haowan", "hao_wan"], ["meiguo", "mei_guo"], ["xiaoshi", "xiao_shi"], ["yiqian", "yi_qian"]]) {
  const { samples, sampleRate } = loadWav(`fixtures/tonepairs/wav/${f}.wav`);
  const c = cutClip(samples, sampleRate, F, R, 3, 2, { noiseFloor: clipNoiseFloor(samples, sampleRate, F) });
  const contour = c.contour.map(([t, x]) => [t, semitonesToChao((x - 3) * (R / 2), ruler.upSemitones, ruler.downSemitones)]);
  const worstOf = (polyline) => { const shape = shapeForWord({ tone: 3, polyline, durationS: 1 }); let w = 0; for (const [t, x] of contour) w = Math.max(w, Math.abs(corridorChaoAt(shape, t) - x)); return w; };
  const before = worstOf(multiSyllablePolyline(contour, c.syllableSpans));
  const ref = refinedMultiSyllablePolyline(contour, c.syllableSpans);
  const worst = worstOf(ref.polyline);
  console.log(`${id}: worst corridor error ${fmt(before, 3)} → ${fmt(worst, 3)} chao, nodes added ${ref.added} (limit 0.47) ${worst < 0.47 ? "pass" : "MISS"}`);
}
