// Brief 49, the shipped pair cut, measured through the production path
// (readContourSyllables with the word's spoken tones and style). Dev-only,
// offline, numbers only. Also writes the spot table the app ships.
//
//   node src/dev/bench39/cut49ship.mjs            # Jane: today vs shipped, 2-fold (spots learned on the other half)
//   node src/dev/bench39/cut49ship.mjs --pairs    # same, per tone pair
//   node src/dev/bench39/cut49ship.mjs --swap     # label-swap test (step 3)
//   node src/dev/bench39/cut49ship.mjs --pierre   # Pierre's takes (step 4), spots learned on all of Jane
//   node src/dev/bench39/cut49ship.mjs --emit     # write src/game/pairCutSpotsData.ts from all of Jane's clips
import { writeFileSync } from "node:fs";
import { janePairs, pierrePairs, pierreReady, JANE_GRIDS, RULER } from "./cut49data.mjs";
import { dropEdgeJunk, findPairCut, pairEventTime } from "../../game/syllables.ts";
import { setPairCutSpots } from "../../game/pairCutSpots.ts";
import { readContourSyllables } from "../../game/freeAttempts.ts";
import { setTuning, tuning } from "../../game/tuning.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { med, pct } from "./lib.mjs";

const ARG = (k) => process.argv.includes(k);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const dur = (p) => (p.length ? p.at(-1).tMs - p[0].tMs : 0);
const keyOf = (t) => t.join("");
const foldOf = (id) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 2;
const KEYS = ["11", "12", "13", "14", "21", "22", "23", "24", "31", "32", "33", "34", "41", "42", "43", "44"];
const EVENTS = ["min", "max", "fall", "rise"];
const isQ = (t) => t === null || t === "none";

/** Frames on a grid: {tMs, rms, chao}. */
const onGrid = (fr, g) => fr.map((f) => ({ tMs: f.tMs, rms: f.rms, chao: semitonesToChao(f.st - g.mid, g.up, g.down) }));

/** The spot table, learned like the bench prototype but with the production functions (ruler chao, cleaned frames). */
export function learnTable(clips) {
  const out = { textbook: {}, natural: {} };
  for (const style of ["textbook", "natural"]) for (const key of KEYS) {
    const ks = clips.filter((c) => c.set === style && keyOf(c.truth) === key && c.ref).map((c) => ({ c, fr: dropEdgeJunk(onGrid(c.fr, JANE_GRIDS.ruler)) })).filter((x) => x.fr.length >= 4);
    if (ks.length < 2) continue;
    const shares = ks.map(({ c, fr }) => (c.ref.cut - fr[0].tMs) / dur(fr));
    const share = med(shares);
    const halfWidth = Math.min(0.2, Math.max(0.08, (pct(shares, 90) - pct(shares, 10)) / 2 + 0.04));
    let event = null, offsetMs = 0, bestErr = 50;
    for (const e of EVENTS) {
      const d = [];
      for (const { c, fr } of ks) {
        const L = dur(fr), t0 = fr[0].tMs;
        const a = fr.findIndex((f) => f.tMs >= t0 + (share - halfWidth) * L), b = fr.findLastIndex((f) => f.tMs <= t0 + (share + halfWidth) * L);
        const t = a >= 0 && b > a ? pairEventTime(fr, a, b, e, tuning().pairEventMinChao) : null;
        if (t !== null) d.push(t - c.ref.cut);
      }
      if (d.length < Math.max(2, 0.7 * ks.length)) continue;
      const o = med(d), err = med(d.map((x) => Math.abs(x - o)));
      if (err < bestErr) { bestErr = err; event = e; offsetMs = o; }
    }
    out[style][key] = { share: +share.toFixed(3), halfWidth: +halfWidth.toFixed(3), event, offsetMs: Math.round(offsetMs) };
  }
  return out;
}

/** One read through the production path, plus the cut it used (null when "?"). */
function readOne(c, fr, grid, tones, style) {
  const pts = onGrid(fr, grid);
  const read = (readContourSyllables({ points: pts, startedAtMs: 0, endedAtMs: pts.at(-1).tMs }, 2, { tones, style }) ?? [null, null]).map((r) => r?.tone ?? null);
  let cut = null;
  if (tuning().pairCutOn) {
    const p = findPairCut(dropEdgeJunk(pts), (globalThis.__spots ?? {})[style]?.[keyOf(tones)] ?? { share: 0.5, halfWidth: 0, event: null, offsetMs: 0 });
    if (p) cut = (p[0].at(-1).tMs + p[1][0].tMs) / 2;
  }
  return { read, cut };
}

export function evaluate(clips, grid, tablesByFold, on) {
  setTuning({ playerRulerV2: grid.flag, pairCutOn: on });
  const rows = clips.map((c) => {
    const table = tablesByFold(c);
    setPairCutSpots(table); globalThis.__spots = table;
    const style = c.set === "pierre" ? c.style : c.set;
    const { read, cut } = readOne(c, c.fr, grid, c.truth, style);
    const err = on && c.ref && cut !== null ? Math.abs(cut - c.ref.cut) : null;
    const wrong = read.some((t, i) => !isQ(t) && t !== c.truth[i]);
    return { c, read, cut, err, both: read.every((t, i) => t === c.truth[i]), wrong, q: read.filter(isQ).length, badCutWrong: err !== null && err > 80 && wrong };
  });
  setPairCutSpots(null);
  setTuning({ playerRulerV2: false, pairCutOn: true });
  const n = rows.length, errs = rows.map((x) => x.err).filter((x) => x !== null);
  return { rows, n, nRef: errs.length, errMed: med(errs), errP90: pct(errs, 90), both: (100 * rows.filter((x) => x.both).length) / n, wrong: (100 * rows.filter((x) => x.wrong).length) / n, q: (100 * rows.reduce((a, x) => a + x.q, 0)) / (2 * n), badCutWrong: rows.filter((x) => x.badCutWrong).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jane = janePairs();
  if (ARG("--emit")) {
    const t = learnTable(jane);
    const body = JSON.stringify(t, null, 2).replace(/"(\w+)":/g, "$1:");
    writeFileSync("src/game/pairCutSpotsData.ts", `// GENERATED by \`node src/dev/bench39/cut49ship.mjs --emit\` — do not edit.\n// From Jane's ${jane.length} two-syllable clips (brief 49): share of the voiced word where the\n// join sits, search half-width, the pitch event typical at the join and its offset (ms).\nimport type { PairCutSpot } from "./syllables.ts";\nimport type { SpeechStyle } from "./words.ts";\n\nexport const PAIR_CUT_SPOTS: Record<SpeechStyle, Record<string, PairCutSpot>> = ${body};\n`);
    console.log("wrote src/game/pairCutSpotsData.ts:", Object.keys(t.textbook).length, "textbook,", Object.keys(t.natural).length, "natural pairs");
  }
  const folds = [learnTable(jane.filter((c) => foldOf(c.id) === 0)), learnTable(jane.filter((c) => foldOf(c.id) === 1))];
  const other = (c) => folds[foldOf(c.id) ^ 1];

  if (!ARG("--swap") && !ARG("--pierre") && !ARG("--emit") && !ARG("--praat") && !ARG("--pipe")) {
    console.log("grid | way | style | pair | n | n ref | cut err med ms | p90 | both right % | wrong tone named % | '?' syllables % | wrong with cut > 80 ms off");
    for (const [g, grid] of Object.entries(JANE_GRIDS)) for (const [way, on] of [["today (46 finder)", false], ["shipped (49)", true]]) for (const style of ["textbook", "natural"]) {
      for (const key of ARG("--pairs") ? [...KEYS, "all"] : ["all"]) {
        const ks = jane.filter((c) => c.set === style && (key === "all" || keyOf(c.truth) === key));
        if (!ks.length) continue;
        const s = evaluate(ks, grid, other, on);
        console.log([g, way, style, key, s.n, s.nRef, f0(s.errMed), f0(s.errP90), f1(s.both), f1(s.wrong), f1(s.q), s.badCutWrong].join(" | "));
        if (ARG("--badcuts") && on) for (const x of s.rows.filter((r) => r.badCutWrong)) console.log(`   ${x.c.id} want ${x.c.truth.join("+")} read ${x.read.map((t) => t ?? "?").join("+")} cut ${f0(x.cut)} ref ${f0(x.c.ref.cut)} (${x.c.ref.how})`);
      }
    }
  }

  if (ARG("--swap")) {
    console.log("grid | reads (clip x wrong label) | a name moved toward the wrong label % | any name changed %");
    for (const [g, grid] of Object.entries(JANE_GRIDS)) {
      setTuning({ playerRulerV2: grid.flag });
      let n = 0, moved = 0, changed = 0;
      for (const c of jane) {
        const table = other(c); setPairCutSpots(table); globalThis.__spots = table;
        const own = readOne(c, c.fr, grid, c.truth, c.set).read;
        for (const L of KEYS) {
          if (L === keyOf(c.truth) || !table[c.set][L]) continue;
          const r = readOne(c, c.fr, grid, L.split("").map(Number), c.set).read;
          n++;
          if (r.some((t, i) => t !== own[i])) changed++;
          if (r.some((t, i) => t !== own[i] && String(t) === L[i] && Number(L[i]) !== c.truth[i])) moved++;
        }
      }
      setPairCutSpots(null);
      console.log([g, n, f1((100 * moved) / n), f1((100 * changed) / n)].join(" | "));
    }
    setTuning({ playerRulerV2: false });
  }

  if (ARG("--pierre") && pierreReady()) {
    const all = learnTable(jane);
    const { cal, clips } = pierrePairs();
    const grids = {
      old: { mid: 0, up: cal.rangeSemitones, down: cal.rangeDownSemitones, flag: false },
      ruler: { mid: 0, up: RULER.upSemitones, down: RULER.downSemitones, flag: true },
    };
    console.log(`Pierre: ${clips.length} pair takes, reference cut for ${clips.filter((c) => c.ref).length}`);
    console.log("grid | way | style | n | n ref | cut err med | p90 | both right % | wrong named % | '?' % | 1+2: syllable 1 read T4");
    for (const [g, grid] of Object.entries(grids)) for (const [way, on] of [["today (46 finder)", false], ["shipped (49)", true]]) for (const style of ["textbook", "natural"]) {
      const ks = clips.filter((c) => c.style === style);
      const s = evaluate(ks, grid, () => all, on);
      const t4 = s.rows.filter((x) => keyOf(x.c.truth) === "12" && x.read[0] === 4).length;
      console.log([g, way, style, s.n, s.nRef, f0(s.errMed), f0(s.errP90), f1(s.both), f1(s.wrong), f1(s.q), t4].join(" | "));
      if (ARG("--detail") && on && g === "ruler") for (const x of s.rows) console.log(`   ${x.c.id} want ${x.c.truth.join("+")} read ${x.read.map((t) => t ?? "?").join("+")}`);
    }
  }
}

// Step 4: Pierre's syllables whose shape in Praat is not the intended tone (he is a
// learner). Praat's pitch split at the reference cut, else at the shipped cut;
// same rough shape rules as pierre.mjs. `--praat`.
if (import.meta.url === `file://${process.argv[1]}` && ARG("--praat") && pierreReady()) {
  const { readFileSync } = await import("node:fs");
  const jane = janePairs();
  setPairCutSpots(learnTable(jane));
  const { cal, clips } = pierrePairs();
  const talk = cal.f0Center;
  const shapeOf = (f) => {
    if (f.length < 5) return "?";
    const s = f.map((x) => 12 * Math.log2(x / talk)), n = s.length, a = med(s.slice(0, Math.max(1, Math.floor(n / 4)))), z = med(s.slice(Math.floor((3 * n) / 4)));
    const lo = Math.min(...s), iLo = s.indexOf(lo), spread = pct(s, 90) - pct(s, 10);
    if (spread < 2) return 1;
    if (a - z > 3 && s.indexOf(Math.max(...s)) < n / 2) return 4;
    if (z - a > 2 && a - lo < 2) return 2;
    if (iLo > n * 0.2 && iLo < n * 0.85 && a - lo >= 2) return 3;
    return z > a ? 2 : 4;
  };
  const grid = { mid: 0, up: RULER.upSemitones, down: RULER.downSemitones, flag: true };
  setTuning({ playerRulerV2: true });
  const off = [], offSyl = new Set();
  for (const c of clips) {
    const r = JSON.parse(readFileSync(`node_modules/.cache/bench39/ref-praat/pierre/${c.id}.json`, "utf8"));
    let cut = c.ref?.cut ?? null;
    if (cut === null) { const p = findPairCut(dropEdgeJunk(onGrid(c.fr, grid)), (await import("../../game/pairCutSpots.ts")).pairCutSpot(c.style, c.truth) ?? { share: 0.5, halfWidth: 0.1, event: null, offsetMs: 0 }); if (p) cut = (p[0].at(-1).tMs + p[1][0].tMs) / 2; }
    if (cut === null) continue;
    const creak = talk * 2 ** (-10 / 12);
    const half = (k) => r.f0.filter((f, i) => f >= creak && (k === 0 ? r.t[i] * 1000 < cut : r.t[i] * 1000 >= cut));
    [0, 1].forEach((k) => { const s = shapeOf(half(k)); if (s !== c.truth[k]) { off.push(`${c.id} syllable ${k + 1}: want T${c.truth[k]}, Praat looks like ${s === "?" ? "too short" : "T" + s}`); offSyl.add(`${c.id}#${k}`); } });
  }
  console.log(off.join("\n"));
  // reads again, counting only syllables whose Praat shape matches the intended tone
  const all = learnTable(jane);
  for (const style of ["textbook", "natural"]) {
    const s = evaluate(clips.filter((c) => c.style === style), grid, () => all, true);
    let n = 0, right = 0, wrong = 0;
    for (const x of s.rows) x.read.forEach((t, k) => { if (offSyl.has(`${x.c.id}#${k}`)) return; n++; if (t === x.c.truth[k]) right++; else if (!isQ(t)) wrong++; });
    console.log(`Pierre ${style}, ruler, syllables Praat calls the intended tone: ${n}; read right ${f1((100 * right) / n)}%, wrong tone named ${f1((100 * wrong) / n)}%, '?' ${f1((100 * (n - right - wrong)) / n)}%`);
  }
  setTuning({ playerRulerV2: false });
}

// Step 7 (information only): the clip pipeline cuts natural pairs without a
// silence at the loudest-dip fallback; 39% of those were artefacts (brief 46).
// Against Praat's reference, how far off is the pipeline's cut, and how far
// the shipped cut (on the live frames)? `--pipe`.
if (import.meta.url === `file://${process.argv[1]}` && ARG("--pipe")) {
  const jane = janePairs();
  const folds = [learnTable(jane.filter((c) => foldOf(c.id) === 0)), learnTable(jane.filter((c) => foldOf(c.id) === 1))];
  const grid = JANE_GRIDS.ruler;
  for (const style of ["natural", "textbook"]) {
    const ks = jane.filter((c) => c.set === style && c.pipe && !c.pipe.silence && c.praat);
    let pipeOff = 0, oursOff = 0, oursQ = 0;
    const pe = [], oe = [];
    for (const c of ks) {
      const e = Math.abs(c.pipe.cut - c.praat.cut); pe.push(e); if (e > 80) pipeOff++;
      const p = findPairCut(dropEdgeJunk(onGrid(c.fr, grid)), folds[foldOf(c.id) ^ 1][style][keyOf(c.truth)] ?? { share: 0.5, halfWidth: 0.1, event: null, offsetMs: 0 });
      if (!p) { oursQ++; continue; }
      const o = Math.abs((p[0].at(-1).tMs + p[1][0].tMs) / 2 - c.praat.cut); oe.push(o); if (o > 80) oursOff++;
    }
    console.log(`${style}: pairs cut by the pipeline's dip fallback with a Praat reference: ${ks.length}. Pipeline cut > 80 ms off: ${pipeOff} (${f1((100 * pipeOff) / ks.length)}%), median ${f0(med(pe))} ms. Shipped cut: "?" ${oursQ}, > 80 ms off ${oursOff} (${f1((100 * oursOff) / ks.length)}%), median ${f0(med(oe))} ms.`);
  }
}
