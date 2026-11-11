// Brief 44 pre-check: the reader (classifier v2) on the board a perfect learner
// would reach (Jane's one ruler, brief 43) vs the scorecard's "as calibrated" board.
// Same clips, same live tracker cache and same contour rule as scorecard.mjs section 4.
//   node src/dev/bench39/reader-on-ruler.mjs
import { readFileSync } from "node:fs";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { F0C, clipList, cachedTrack } from "./tracks.mjs";

const ruler = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8")).ruler;
const clips = clipList();
function singlesRight(style, midSt, up, down, shift = 0) {
  let n = 0, ok = 0;
  for (const c of clips.filter((c) => c.set === style && c.tones.length === 1 && c.tones[0] >= 1)) {
    const o = cachedTrack(c, "live"), pts = [];
    for (let i = 0; i < o.t.length; i++) if (o.v[i]) pts.push({ tMs: o.t[i] * 1000, chao: semitonesToChao(o.st[i] + shift - midSt, up, down) });
    if (pts.length < 3) continue;
    const t0 = pts[0].tMs; n++;
    const r = classifyToneV2({ points: pts.map((p) => ({ tMs: p.tMs - t0, chao: p.chao })), startedAtMs: 0, endedAtMs: pts.at(-1).tMs - t0 });
    if (r && r.tone === c.tones[0]) ok++;
  }
  return +((100 * ok) / n).toFixed(1);
}
const mid = 12 * Math.log2(ruler.middleHz / F0C);
console.log(`scorecard centre ${F0C} Hz, board up 7 / down 5.75 | ruler middle ${ruler.middleHz} Hz (+${mid.toFixed(2)} st), up ${ruler.upSemitones} / down ${ruler.downSemitones}`);
for (const s of ["textbook", "natural"]) {
  console.log(`${s}: as calibrated ${singlesRight(s, 0, 7, 5.75)} | ruler halves, scorecard centre ${singlesRight(s, 0, ruler.upSemitones, ruler.downSemitones)} | old halves, ruler middle ${singlesRight(s, mid, 7, 5.75)} | full ruler (perfect learner) ${singlesRight(s, mid, ruler.upSemitones, ruler.downSemitones)}`);
}
