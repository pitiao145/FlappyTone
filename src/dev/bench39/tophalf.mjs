// Brief 50 step 6: why the top half kept widening in test 8 (2.3 -> 4.3 -> 4.9
// st while the bottom sat at its 3.0 limit).
//
// The middle learns from "votes": each frame's pitch minus where the word's
// target puts that moment (target chao c -> (c-3)/2 x the half). On a first
// tone the target sits near line 5, so the vote subtracts almost the whole up
// half: vote = pitch - k x up, k ~ 0.9. The top line is the first tones' p90.
// So on first-tone play: up = top - middle = (p90 - pitch) + k x up, a loop
// whose resting point is (p90 - pitch) / (1 - k): ten times the small spread
// of a held first tone. Middle down, top half up, bottom half squeezed to its
// limit (the bottom line rides with the middle until third tones correct it).
//
// Replays Pierre's real first tones (2 st lower, as in test 8) as a long
// first-tone drill from his test calibration (129 Hz, +2.3 / -3.8), with
// today's rule and with the brief 50 rule (drill gates do not vote on the
// middle, `middleVote: false`). Also a synthetic held first tone (pitch spread
// 1 st, lifted target at chao 4.5) to show the loop itself.
//   node src/dev/bench39/tophalf.mjs
import { speakerGates, gateOrder } from "./gridsim.mjs";
// (synthetic frames are given in st from F0C, like the recorded ones)
import { learnGridFromGate, newGridLearnState, startGridRun } from "../../pitch/calibration.ts";
import { gridLearnParams } from "../../game/tuning.ts";
import { F0C } from "./tracks.mjs";

const st = (hz) => 12 * Math.log2(hz / F0C);
const p = speakerGates("pierre");
const SHIFT = -2, ref = st(129);
const t1 = p.filter((g) => g.tone === 1);
// Synthetic held first tone: 30 frames spread evenly over 1 st, 1.5 st under the calibrated middle + 2.3.
const synth = Array.from({ length: 30 }, (_, i) => ({ id: `syn${i}`, tone: 1, tones: [1], heard: true, st: Array.from({ length: 30 }, (_, j) => st(129) + 0.8 + j / 29 - 2), times: [], targetChao: new Array(30).fill(4.5) }));
for (const [label, drillVotes, src] of [["today, Pierre's first tones", true, t1], ["brief 50, Pierre's first tones", false, t1], ["today, synthetic held first tone", true, synth], ["brief 50, synthetic held first tone", false, synth]]) {
  for (const [drillN, classicN] of [[120, 0], [20, 65]]) {
    const params = gridLearnParams();
    let s = newGridLearnState({ midSt: 0, up: 2.3, down: 3.8 });
    const rows = [];
    const feed = (g, vote = true) => { s = learnGridFromGate(s, { semitones: g.st.map((x) => x + SHIFT - ref), targetChao: g.targetChao, tone: g.tone, heard: g.heard, middleVote: vote }, params); };
    gateOrder(src, drillN, 50, "all").forEach((g, i) => { if (i % 3 === 0) s = startGridRun(s); feed(g, drillVotes); if ((i + 1) % 20 === 0) rows.push(`drill ${i + 1}: mid ${s.grid.midSt.toFixed(1)} up ${s.grid.up.toFixed(1)} down ${s.grid.down.toFixed(1)}`); });
    s = startGridRun(s);
    gateOrder(p, classicN, 51, "game").forEach((g, i) => { feed(g); if ((i + 1) % 20 === 0 || i + 1 === classicN) rows.push(`classic ${i + 1}: mid ${s.grid.midSt.toFixed(1)} up ${s.grid.up.toFixed(1)} down ${s.grid.down.toFixed(1)}`); });
    console.log(`${label}, ${drillN} first-tone drill gates + ${classicN} classic | ${rows.join(" | ")}`);
  }
}
