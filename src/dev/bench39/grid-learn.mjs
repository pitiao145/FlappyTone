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
// Truth. Jane: her one ruler (brief 43 rule) from her textbook clips; natural
// speech is measured against the same ruler (info only). Pierre: his own frames.
const janeTb = speakerGates("jane", "textbook"), janeNat = speakerGates("jane", "natural");
const janeRuler = trueRuler(janeTb);
const cases = [
  { name: "jane textbook, game mix (single words)", gates: janeTb, truth: janeRuler, mix: "game", gated: true },
  { name: "jane textbook, all words incl. pairs", gates: janeTb, truth: janeRuler, mix: "all", gated: false },
  { name: "jane natural, game mix, vs her one ruler", gates: janeNat, truth: janeRuler, mix: "game", gated: false },
];
if (existsSync("fixtures/captures/pierre/calibration.json")) {
  const p = speakerGates("pierre");
  cases.push({ name: "pierre, game mix (his single words)", gates: p, truth: trueRuler(p), mix: "game", gated: true });
}
// Named allowances (brief 44, Pierre's rule: small misses are recorded, not blocked).
// Limit in st for the worst error at gate 20 and after, this fixed gate order only.
const ALLOWANCES = {
  "pierre, game mix (his single words)|middle 2 st too low": 1.10, // after the 44 review fixes (was 0.53)
  "pierre, game mix (his single words)|middle 2 st too high": 1.18,
  "pierre, game mix (his single words)|halves 30% too small": 1.14,
};
let fail = 0;
for (const { name, gates, truth: tr, mix, gated } of cases) {
  const up = tr.top - tr.mid, down = tr.mid - tr.bottom;
  console.log(`\n${name}: ${gates.length} clips (${gates.filter((g) => !g.heard).length} unheard) | true middle ${(181.3 * 2 ** (tr.mid / 12)).toFixed(1)} Hz, up ${up.toFixed(2)}, down ${down.toFixed(2)} st${gated ? "" : " | info only"}`);
  const starts = {
    "middle 2 st too low": { mid: tr.mid - 2, up, down },
    "middle 2 st too high": { mid: tr.mid + 2, up, down },
    "halves 30% too small": { mid: tr.mid, up: 0.7 * up, down: 0.7 * down },
    "standard halves": { mid: tr.mid, up: t.gridUpSemitones, down: t.gridDownSemitones },
  };
  for (const [label, start] of Object.entries(starts)) {
    const opts = { mix, truth: tr };
    const a = simulate(gates, start, opts), b = simulate(gates, start, opts);
    const same = JSON.stringify(a.grid) === JSON.stringify(b.grid) && JSON.stringify(a.curve) === JSON.stringify(b.curve);
    const at20 = a.curve[19], later = a.curve.slice(19);
    const worstLater = Math.max(...later.map(worst));
    const firstIn = a.curve.findIndex((c, i) => a.curve.slice(i).every((x) => worst(x) <= 1));
    const limit = ALLOWANCES[`${name}|${label}`] ?? 1;
    const ok = worst(at20) <= limit && worstLater <= limit && same;
    const counts = gated && label !== "standard halves";
    if (!ok && counts) fail++;
    const tag = ok ? (Math.max(worst(at20), worstLater) > 1 ? `PASS (allowance ${limit} st)` : "PASS") : counts ? "FAIL" : "info";
    console.log(`  ${label.padEnd(22)} gate 20: mid ${at20.mid.toFixed(2)} top ${at20.top.toFixed(2)} bottom ${at20.bottom.toFixed(2)} | worst gates 20-120 ${worstLater.toFixed(2)} | within 1 st for good from gate ${firstIn < 0 ? "never" : firstIn + 1} | deterministic ${same ? "yes" : "NO"} | ${tag}`);
    if (CURVE) console.log("    curve (gate: mid/top/bottom): " + a.curve.filter((c) => c.gate <= 30 || c.gate % 10 === 0).map((c) => `${c.gate}:${c.mid.toFixed(1)}/${c.top.toFixed(1)}/${c.bottom.toFixed(1)}`).join(" "));
  }
}
// 44 review checks (400 gates, start = the true ruler, worst over the last 100 gates).
{
  const { longRun } = await import("./gridsim.mjs");
  console.log("\n44 review checks (400 gates, worst over gates 301-400):");
  for (const [label, opts] of [["jane pairs only, voice 2 st lower", { mix: "pairs", voiceShift: -2 }], ["jane pairs only, voice 2 st higher", { mix: "pairs", voiceShift: 2 }]]) {
    const r = longRun(janeTb, janeRuler, opts);
    const ok = r.lines <= 1 && r.halves <= 1;
    if (!ok) fail++;
    console.log(`  ${label.padEnd(36)} lines ${r.lines.toFixed(2)} | halves vs start ${r.halves.toFixed(2)} | up ${r.grid.up.toFixed(2)} down ${r.grid.down.toFixed(2)} | ${ok ? "PASS" : "FAIL"}`);
  }
  const nat = longRun(janeNat, janeRuler, { mix: "game" });
  const okN = nat.halves <= 1;
  if (!okN) fail++;
  console.log(`  ${"jane natural, game mix".padEnd(36)} halves vs her ruler ${nat.halves.toFixed(2)} | up ${nat.grid.up.toFixed(2)} down ${nat.grid.down.toFixed(2)} (ruler ${nat.start.up.toFixed(2)} / ${nat.start.down.toFixed(2)}) | ${okN ? "PASS" : "FAIL"}`);
}
console.log(`\n${fail} FAIL`);
process.exit(fail ? 1 : 0);
