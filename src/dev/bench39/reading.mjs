// The reading side: tone classifier v2 and the pair read, fed with
//  (a) the reference contour (what Jane really said) and
//  (b) the live tracker's contour of the same audio,
// both drawn on the "Jane as a player" board (see heights.mjs).
//   node src/dev/bench39/reading.mjs
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { readContourSyllables } from "../../game/freeAttempts.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { clipList, loadRef, cachedTrack, F0C } from "./tracks.mjs";
import { fmt } from "./lib.mjs";

const UP = 7, DOWN = 5.75, CREAK = F0C * 2 ** (-10 / 12);
const clips = clipList();
function contourFrom(points) { // points: [{tMs, st}]
  return (shift, scale) => {
    const pts = points.map((p) => ({ tMs: p.tMs, chao: semitonesToChao(p.st + shift, UP * scale, DOWN * scale) }));
    return { points: pts.map((p) => ({ tMs: p.tMs - pts[0].tMs, chao: p.chao })), startedAtMs: 0, endedAtMs: pts.at(-1).tMs - pts[0].tMs };
  };
}
function refPoints(c) {
  const r = loadRef(c.set, c.id), out = [];
  for (let i = 0; i < r.t.length; i++) if (r.f0[i] >= Math.max(70, CREAK * 0.7)) out.push({ tMs: r.t[i] * 1000, st: 12 * Math.log2(r.f0[i] / F0C) });
  return out;
}
function livePoints(c) {
  const o = cachedTrack(c, "live"), out = [];
  for (let i = 0; i < o.t.length; i++) if (o.v[i]) out.push({ tMs: o.t[i] * 1000, st: o.st[i] });
  return out;
}
const cases = [["as calibrated", 0, 1], ["voice 2 st lower than calibrated", -2, 1], ["voice 2 st higher", 2, 1], ["board 40% wider than the voice", 0, 1.4], ["board 30% narrower", 0, 0.7]];
for (const [srcName, src] of [["reference contour (truth)", refPoints], ["live tracker contour", livePoints]]) {
  console.log(`\n### Single tones read by classifier v2 — ${srcName}`);
  console.log("case | set | T1 right % | T2 right % | T3 right % | T4 right % | all singles % | read as another tone % | 'none' %");
  for (const [label, shift, scale] of cases) for (const set of ["textbook", "natural"]) {
    const per = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] }; let wrong = 0, none = 0, n = 0;
    for (const c of clips.filter((c) => c.set === set && c.tones.length === 1 && c.tones[0] >= 1)) {
      const pts = src(c); if (pts.length < 3) continue;
      const res = classifyToneV2(contourFrom(pts)(shift, scale));
      n++; per[c.tones[0]][0]++;
      if (res && res.tone === c.tones[0]) per[c.tones[0]][1]++; else if (!res || res.tone === "none") none++; else wrong++;
    }
    const all = Object.values(per).reduce((a, p) => a + p[1], 0);
    console.log([label, set, ...[1, 2, 3, 4].map((t) => fmt((100 * per[t][1]) / per[t][0], 0)), fmt((100 * all) / n, 0), fmt((100 * wrong) / n, 0), fmt((100 * none) / n, 0)].join(" | "));
  }
  console.log(`\n### Pair read (split at silences > 150 ms, then classify each piece) — ${srcName}`);
  console.log("case | set | pairs | split into 2 % | 1 piece % | 3+ pieces % | both tones right % (of all) | both right % (of those split in 2)");
  for (const [label, shift, scale] of cases.slice(0, 3)) for (const set of ["textbook", "natural"]) {
    let n = 0, two = 0, one = 0, more = 0, both = 0;
    for (const c of clips.filter((c) => c.set === set && c.tones.length === 2 && c.tones.every((t) => t >= 1))) {
      const pts = src(c); if (pts.length < 3) continue;
      const syl = readContourSyllables(contourFrom(pts)(shift, scale));
      n++;
      if (!syl || syl.length === 1) one++; else if (syl.length === 2) { two++; if (syl.every((s, i) => s && s.tone === c.tones[i])) both++; } else more++;
    }
    console.log([label, set, n, fmt((100 * two) / n, 0), fmt((100 * one) / n, 0), fmt((100 * more) / n, 0), fmt((100 * both) / n, 0), fmt((100 * both) / Math.max(1, two), 0)].join(" | "));
  }
}
