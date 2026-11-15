// Brief 45: fit the reader's ruler settings (`toneReaderRuler`) on the FIT half
// of Jane's single-tone clips only. The held-out half is never read here.
//   node src/dev/bench39/fit45.mjs [--start current|legacy] [--fixed key=value ...]
// Coordinate descent over a small grid per setting; prints the best set as JSON.
// Objective (fit half): the brief's acceptance checks as margins (capped at +5),
// plus a small weight on every other case, minus 10 per textbook wall hit (a
// wrong, decisive, confident read: `isDrasticToneMismatch`), 2 per natural one.
// key=value freezes a setting; ~key=value only starts there.
import { setTuning, tuning } from "../../game/tuning.ts";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { isDrasticToneMismatch } from "../../game/scoring.ts";
import { TRUE_GRID, CASES, singleClips, framesOf, contourOn } from "./reader45.mjs";

setTuning({ playerRulerV2: true });
const HALF = process.argv.includes("--held") ? "held" : "fit";

// Contours are fixed per (style, case): build once.
const DATA = {};
for (const style of ["textbook", "natural"]) for (const [name, mk] of Object.entries(CASES)) {
  const { grid, shift } = mk(TRUE_GRID);
  DATA[`${style}.${name}`] = singleClips(style, HALF).map((c) => ({ tone: c.tones[0], k: contourOn(framesOf(c), grid, shift) })).filter((x) => x.k);
}

export function evaluate(settings) {
  setTuning({ toneReaderRuler: settings });
  const out = {};
  for (const [key, rows] of Object.entries(DATA)) {
    const per = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] };
    let ok = 0, walls = 0;
    for (const { tone, k } of rows) {
      const r = classifyToneV2(k);
      per[tone][0]++;
      if (r && r.tone === tone) { ok++; per[tone][1]++; }
      if (isDrasticToneMismatch(tone, r)) walls++;
    }
    out[key] = { all: (100 * ok) / rows.length, T2: per[2][0] ? (100 * per[2][1]) / per[2][0] : NaN, walls };
  }
  return out;
}
const CHECKS = [
  ["textbook.calibrated", "all", 97], ["natural.calibrated", "all", 89],
  ["natural.lower2", "all", 80], ["textbook.narrow70", "T2", 70], ["natural.narrow70", "T2", 70],
];
export function objective(r) {
  let s = 0, walls = 0;
  for (const [k, f, target] of CHECKS) s += Math.min(5, r[k][f] - target);
  // Only a textbook gate can lose a heart to a read (run.ts mismatchApplies);
  // a natural wrong-and-decisive read costs nothing in the game but is still a
  // confident wrong answer, so it counts a little.
  for (const k of Object.keys(r)) { s += 0.1 * r[k].all; walls += (k.startsWith("textbook") ? 10 : 2) * r[k].walls; }
  return s - walls;
}

const legacy = structuredClone(tuning().toneReaderRuler);
const range = (a, b, step) => { const o = []; for (let v = a; v <= b + 1e-9; v += step) o.push(+v.toFixed(3)); return o; };
const SPACE = {
  t1MinChao: range(1.8, 3.4, 0.1),
  t1MinMs: range(250, 450, 25),
  flatnessScaleChao: range(0.9, 2.2, 0.1),
  t1StillChao: range(0.6, 2, 0.1),
  // Both T4 tests stay on (no null): Jane's clips hold no falling-only T3
  // between the two families, so the fit alone would drop the split, and a
  // learner's short falling T3 would then read as a confident T4.
  t4MinPeakChao: range(1.8, 4.2, 0.1),
  t4MinFallChao: range(0.8, 3, 0.1),
  dipRiseMinChao: range(0.1, 1, 0.05),
  floorRule: [true, false],
  votes: [
    ["turnTime", "riseShare", "riseRate", "drop", "dropShare", "low"],
    ["turnTime", "riseShare", "riseRate", "drop", "dropShare"],
    ["turnTime", "riseShare", "dropShare", "low"],
    ["turnTime", "riseShare", "dropShare"],
    ["turnTime", "riseShare", "riseRate", "dropShare"],
    ["turnTime", "riseShare", "drop", "dropShare"],
  ],
};
const ANCHOR_SPACE = {
  turnTime: range(0.2, 0.7, 0.02), riseShare: range(0.3, 0.7, 0.02), riseRate: range(2, 10, 0.4),
  drop: range(0.2, 2.4, 0.1), dropShare: range(0.05, 0.6, 0.02), low: range(1, 2.8, 0.1),
};
function setIn(s, key, v) {
  const o = structuredClone(s);
  if (key.startsWith("a.")) { const [, name, side] = key.split("."); o.anchors[name][+side] = v; }
  else o[key] = v;
  return o;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let best = legacy;
  const given = process.argv.filter((a) => a.includes("=")).map((a) => a.split("="));
  const fixed = given.filter(([k]) => !k.startsWith("~"));
  for (const [k0, v] of given) { const k = k0.replace(/^~/, ""); best = setIn(best, k, k === "votes" ? v.split(",") : v === "null" ? null : v === "true" ? true : v === "false" ? false : +v); }
  const fixedKeys = new Set(fixed.map(([k]) => k));
  let bestScore = objective(evaluate(best));
  console.log(`start (${HALF} half): ${bestScore.toFixed(2)}`);
  const keys = [...Object.keys(SPACE), ...Object.keys(ANCHOR_SPACE).flatMap((n) => [`a.${n}.0`, `a.${n}.1`])].filter((k) => !fixedKeys.has(k));
  for (let pass = 1; pass <= 6; pass++) {
    let moved = false;
    for (const key of keys) {
      const opts = key.startsWith("a.") ? ANCHOR_SPACE[key.split(".")[1]] : SPACE[key];
      for (const v of opts) {
        const cand = setIn(best, key, v);
        // T2 anchor and T3 anchor must stay apart (half > 0 in t2t3Votes).
        const an = key.startsWith("a.") ? cand.anchors[key.split(".")[1]] : null;
        if (an && Math.abs(an[1] - an[0]) < 1e-6) continue;
        const sc = objective(evaluate(cand));
        if (sc > bestScore + 1e-6) { best = cand; bestScore = sc; moved = true; }
      }
    }
    console.log(`pass ${pass}: ${bestScore.toFixed(2)}`);
    if (!moved) break;
  }
  // Centring: where the score is flat around a setting, move it to the middle
  // of that flat stretch (the largest margin to both sides).
  for (const key of keys.filter((k) => k !== "votes" && k !== "floorRule")) {
    const opts = key.startsWith("a.") ? ANCHOR_SPACE[key.split(".")[1]] : SPACE[key];
    const cur = key.startsWith("a.") ? best.anchors[key.split(".")[1]][+key.split(".")[2]] : best[key];
    const i0 = opts.findIndex((v) => Math.abs(v - cur) < 1e-9);
    if (i0 < 0) continue;
    const okAt = (i) => { const c = setIn(best, key, opts[i]); const an = key.startsWith("a.") ? c.anchors[key.split(".")[1]] : null; return !(an && Math.abs(an[1] - an[0]) < 1e-6) && objective(evaluate(c)) >= bestScore - 1e-6; };
    let lo = i0, hi = i0;
    while (lo > 0 && okAt(lo - 1)) lo--;
    while (hi < opts.length - 1 && okAt(hi + 1)) hi++;
    const mid = opts[Math.round((lo + hi) / 2)];
    if (mid !== cur) { best = setIn(best, key, mid); console.log(`centred ${key}: ${cur} -> ${mid} (flat ${opts[lo]}..${opts[hi]})`); }
  }
  bestScore = objective(evaluate(best));
  console.log(`after centring: ${bestScore.toFixed(2)}`);
  const r = evaluate(best);
  for (const [k, v] of Object.entries(r)) console.log(`${k}: all ${v.all.toFixed(1)} T2 ${v.T2.toFixed(1)} walls ${v.walls}`);
  console.log(JSON.stringify(best));
}
