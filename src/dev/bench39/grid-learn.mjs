// Brief 44 step 7: offline proof that the player's grid learns.
// Jane's clips (and Pierre's, if present) as a run of gates through
// learnGridFromGate, from three bad starts. Pass: after 20 gates the grid is
// within 1 st of the true ruler (middle, top, bottom) and stays within 1 st for
// the next 100 gates. Same order twice gives the same grid.
//   node src/dev/bench39/grid-learn.mjs [--curve]
import { existsSync } from "node:fs";
import { speakerGates, trueRuler, simulate, worst, GATES_PER_RUN } from "./gridsim.mjs";
import { tuning } from "../../game/tuning.ts";

const CURVE = process.argv.includes("--curve");
const t = tuning();
console.log(`params: rate ${t.gridLearnRate}, max step per run ${t.gridLearnMaxStepPerRun} st, halves ${t.gridHalfMin}-${t.gridHalfMax}, min frames ${t.gridLearnMinFrames}, memory ${t.gridLearnMemoryGates} gates, top p${t.gridTopPct} T1 / bottom p${t.gridBottomPct} T3 | run = ${GATES_PER_RUN} gates (ASSUMED)`);
const speakers = [["jane textbook", speakerGates("jane", "textbook")], ["jane natural", speakerGates("jane", "natural")]];
if (existsSync("fixtures/captures/pierre/calibration.json")) speakers.push(["pierre", speakerGates("pierre")]);
let fail = 0;
for (const [name, gates] of speakers) {
  const tr = trueRuler(gates);
  const up = tr.top - tr.mid, down = tr.mid - tr.bottom;
  console.log(`\n${name}: ${gates.length} clips (${gates.filter((g) => !g.heard).length} unheard) | true middle ${(181.3 * 2 ** (tr.mid / 12)).toFixed(1)} Hz, up ${up.toFixed(2)}, down ${down.toFixed(2)} st`);
  const starts = {
    "middle 2 st too low": { mid: tr.mid - 2, up, down },
    "middle 2 st too high": { mid: tr.mid + 2, up, down },
    "halves 30% too small": { mid: tr.mid, up: 0.7 * up, down: 0.7 * down },
    "standard halves": { mid: tr.mid, up: t.gridUpSemitones, down: t.gridDownSemitones },
  };
  for (const [label, start] of Object.entries(starts)) {
    const a = simulate(gates, start), b = simulate(gates, start);
    const same = JSON.stringify(a.grid) === JSON.stringify(b.grid) && JSON.stringify(a.curve) === JSON.stringify(b.curve);
    const at20 = a.curve[19], later = a.curve.slice(19);
    const worstLater = Math.max(...later.map(worst));
    const firstIn = a.curve.findIndex((c, i) => a.curve.slice(i).every((x) => worst(x) <= 1));
    const ok = worst(at20) <= 1 && worstLater <= 1 && same;
    if (!ok && label !== "standard halves") fail++;
    console.log(`  ${label.padEnd(22)} gate 20: mid ${at20.mid.toFixed(2)} top ${at20.top.toFixed(2)} bottom ${at20.bottom.toFixed(2)} | worst gates 20-120 ${worstLater.toFixed(2)} | within 1 st for good from gate ${firstIn + 1} | deterministic ${same ? "yes" : "NO"} | ${ok ? "PASS" : label === "standard halves" ? "info" : "FAIL"}`);
    if (CURVE) console.log("    curve (gate: mid/top/bottom): " + a.curve.filter((c) => c.gate <= 30 || c.gate % 10 === 0).map((c) => `${c.gate}:${c.mid.toFixed(1)}/${c.top.toFixed(1)}/${c.bottom.toFixed(1)}`).join(" "));
  }
}
console.log(`\n${fail} FAIL`);
process.exit(fail ? 1 : 0);
