// Brief 43: every target shape measured again on ONE ruler for all of Jane's
// tones, written to src/dev/local/shapes-v2.json. Dev-only, offline.
// No Supabase client, no R2, no network. Reads only local audio:
//   textbook  fixtures/clips/jane/<id>.wav (357 newer clips), else the raw take in
//             fixtures/recordings/2026-08-07-xujzgs/<id>.wav (the 120 older words)
//   natural   fixtures/clips/jane/natural/<id>.wav
// The word list is src/data/wordsFallback.json (the published textbook catalog).
//
// The ruler (Pierre's decision, 11 Nov 2026): the player's own rule, applied to
// Jane's 357 newer textbook clips. chao 3 = median pitch, chao 5 = p90 of her
// single first-tone words, chao 1 = p10 of her single third-tone words
// (computeRangeHalvesFromExtremes, as run.ts does for a player). Creak left out.
//
//   node src/dev/bench39/make-shapes.mjs            # measure, check, print, write the file
//   node src/dev/bench39/make-shapes.mjs --no-write # measure, check and print only
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cutClip, clipNoiseFloor, templateContourKnee, CLIP_GATE_VOICE_SHARE, KNEE_CHAO, MEASURE_RANGE_SEMITONES } from "../clipCut.ts";
import { multiSyllablePolyline } from "../clipCutMulti.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { computeRangeHalvesFromExtremes } from "../../pitch/calibration.ts";
import { loadWav, pct, med, fmt } from "./lib.mjs";

// --out <path>: write elsewhere (diagnostics). --gate fixed: shapes from the fixed 0.0033 gate (diagnostic only).
const argOf = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = argOf("--out") ?? "src/dev/local/shapes-v2.json";
const SHAPE_GATE = argOf("--gate") ?? "clip";
const OLD_SESSION = "fixtures/recordings/2026-08-07-xujzgs";
const SEED = 181.3; // catalog centre (wordsFallback meta), pass 1 only
const CREAK_ST = -10; // frames more than 10 st under the middle are creak (heights.mjs rule)
const R = MEASURE_RANGE_SEMITONES; // contour measured on a wide ±15 st board: chao = 3 + 2·st/15
const stop = (code, msg) => { console.log(`\nSTOP (brief 43): ${msg}`); process.exit(code); };

const rows = JSON.parse(readFileSync("src/data/wordsFallback.json", "utf8")).rows;

function sourceOf(style, id) {
  if (style === "natural") { const f = `fixtures/clips/jane/natural/${id}.wav`; return existsSync(f) ? { file: f, kind: "clip" } : null; }
  const f = `fixtures/clips/jane/${id}.wav`;
  if (existsSync(f)) return { file: f, kind: "clip" };
  const raw = `${OLD_SESSION}/${id}.wav`;
  return existsSync(raw) ? { file: raw, kind: "older" } : null;
}

const audio = new Map();
const wav = (file) => { if (!audio.has(file)) audio.set(file, loadWav(file)); return audio.get(file); };

/** One cut. `gate`: "clip" (floor from the clip) or "fixed" (tracker default 0.0033). */
function cut(row, style, f0Center, gate) {
  const src = sourceOf(style, row.id);
  if (!src) return null;
  const { samples, sampleRate } = wav(src.file);
  const floor = clipNoiseFloor(samples, sampleRate, f0Center);
  const c = cutClip(samples, sampleRate, f0Center, R, row.tone, row.syllables, gate === "clip" ? { noiseFloor: floor } : {});
  // Wide-board chao back to semitones from f0Center (linear inside ±15 st).
  const st = c.contour.map(([t, chao]) => [t, (chao - 3) * (R / 2)]);
  return { src, floor, c, st };
}

// ---- Step 1: Jane's ruler, from her 357 newer textbook clips ---------------
const newerRows = rows.filter((r) => sourceOf("textbook", r.id)?.kind === "clip");
const isSingle = (tone) => (r) => r.syllables === 1 && r.tone === tone;
function rulerFrom(list, f0Center) { // list: [{row, cut}]
  const all = list.flatMap((x) => x.cut.st.map(([, s]) => s));
  const m0 = med(all);
  const notCreak = (s) => s - m0 >= CREAK_ST;
  const kept = all.filter(notCreak);
  const mid = med(kept); // semitones from f0Center
  const pool = (tone) => list.filter((x) => isSingle(tone)(x.row)).flatMap((x) => x.cut.st.map(([, s]) => s).filter(notCreak).map((s) => s - mid));
  const t1 = pool(1), t3 = pool(3);
  const halves = computeRangeHalvesFromExtremes(t1, t3);
  return {
    middleHz: +(f0Center * 2 ** (mid / 12)).toFixed(1),
    upSemitones: halves.up, downSemitones: halves.down,
    upRaw: +pct(t1, 90).toFixed(3), downRaw: +(-pct(t3, 10)).toFixed(3),
    frames: kept.length, creakFramesLeftOut: all.length - kept.length, t1Frames: t1.length, t3Frames: t3.length,
  };
}
const p1 = newerRows.map((row) => ({ row, cut: cut(row, "textbook", SEED, "clip") }));
const r1 = rulerFrom(p1, SEED);
console.log(`pass 1 (measured at ${SEED} Hz): middle ${r1.middleHz} Hz, up ${r1.upSemitones} st, down ${r1.downSemitones} st`);
const F = r1.middleHz; // pass 2 measures every clip with the middle as centre

const cuts = { textbook: new Map(), natural: new Map() };
const fixed = { textbook: new Map(), natural: new Map() };
const failed = [];
for (const style of ["textbook", "natural"]) for (const r of rows) {
  try {
    const a = cut(r, style, F, "clip"); if (!a) continue;
    cuts[style].set(r.id, a);
    fixed[style].set(r.id, cut(r, style, F, "fixed"));
  } catch (e) { failed.push(`${style}/${r.id}: ${e.message}`); }
}
const ruler = {
  ...rulerFrom(newerRows.filter((r) => cuts.textbook.has(r.id)).map((row) => ({ row, cut: cuts.textbook.get(row.id) })), F),
  rule: "chao 3 = median of all frames; chao 5 = p90 of single first-tone frames; chao 1 = p10 of single third-tone frames (computeRangeHalvesFromExtremes, quarter-semitone rounding); semitonesToChao clamps at 1 and 5",
  source: "357 newer textbook clips, final listener (brief 42), per-clip gate, tone window frames, creak (> 10 st under the middle) left out",
  measuredAtHz: F,
  templates: `templateContourKnee: T2 start-low-KNEE-end, T3 start-low-midrise-KNEE-end, T4 start-peak-KNEE-end, T1 flat; KNEE_CHAO ${KNEE_CHAO}`,
  gate: `per clip: noiseFloor = max(p10 frame RMS, 1e-4, ${CLIP_GATE_VOICE_SHARE} x median voiced RMS / rmsMult)`,
};
const midShift = 12 * Math.log2(ruler.middleHz / F);
console.log("\n### Jane's ruler (pass 2)");
console.log(`middle (chao 3) ${ruler.middleHz} Hz | up (chao 5) ${ruler.upSemitones} st (p90 of T1 ${ruler.upRaw}) | down (chao 1) ${ruler.downSemitones} st (p10 of T3 ${ruler.downRaw}) | ${ruler.frames} frames, ${ruler.creakFramesLeftOut} creak left out | T1 frames ${ruler.t1Frames}, T3 frames ${ruler.t3Frames}`);

const toChao = (s) => semitonesToChao(s - midShift, ruler.upSemitones, ruler.downSemitones);
const onRuler = (x) => x.st.map(([t, s]) => [+t.toFixed(4), +toChao(s).toFixed(3)]);
function shapeOf(row, x) {
  const contour = onRuler(x);
  const k = row.syllables > 1 ? { polyline: multiSyllablePolyline(contour, x.c.syllableSpans ?? [[0, 1]]), knee: null } : templateContourKnee(row.tone, contour);
  return { polyline: k.polyline, ...(k.knee === false ? { knee: "dropped" } : {}), contour, onset_s: +(x.c.toneStartMs / 1000).toFixed(3), duration_s: +(x.c.durationMs / 1000).toFixed(4) };
}
const nodes = (p) => ({ start: p[0][1], low: Math.min(...p.map((q) => q[1])), high: Math.max(...p.map((q) => q[1])), end: p.at(-1)[1] });

// ---- Shapes --------------------------------------------------------------
const out = { textbook: {}, natural: {} };
const shapeCuts = SHAPE_GATE === "fixed" ? fixed : cuts;
for (const style of ["textbook", "natural"]) for (const r of rows) { const x = shapeCuts[style].get(r.id); if (x) out[style][r.id] = shapeOf(r, x); }
const kindOf = (r) => cuts.textbook.get(r.id)?.src.kind;

// Knee nodes (brief 43 decision): how many single-syllable words lost theirs.
console.log(`\n### Knee nodes (KNEE_CHAO ${KNEE_CHAO}): words that lost their knee / words`);
for (const style of ["textbook", "natural"]) console.log(`${style}: ` + [2, 3, 4].map((tone) => { const ws = rows.filter((r) => r.syllables === 1 && r.tone === tone && out[style][r.id]); return `T${tone} ${ws.filter((r) => out[style][r.id].knee === "dropped").length} / ${ws.length}`; }).join(" | "));

// ---- Step 2: ruler check on the newer clips ---------------------------------
const singlesOf = (tone, kind) => rows.filter((r) => isSingle(tone)(r) && out.textbook[r.id] && (!kind || kindOf(r) === kind));
const t1Level = med(singlesOf(1, "clip").map((r) => out.textbook[r.id].polyline[0][1]));
const t3Low = med(singlesOf(3, "clip").map((r) => nodes(out.textbook[r.id].polyline).low));
console.log(`\ncheck (newer clips): first-tone level ${fmt(t1Level)} (4.4–5.0) | third-tone low ${fmt(t3Low)} (1.0–1.6)`);
if (!(t1Level >= 4.4 && t1Level <= 5.0 && t3Low >= 1.0 && t3Low <= 1.6)) stop(2, "ruler check failed (step 2).");

// ---- Step 3: how much is clamped ------------------------------------------
console.log("\n### Frames on the top line (chao 5) and the bottom line (chao 1), share of voiced frames");
console.log("set | T1 top/bottom | T2 | T3 | T4 | pairs | 3+ syll");
const grp = (r) => (r.syllables === 1 ? `T${r.tone}` : r.syllables === 2 ? "pairs" : "3+");
for (const [label, style, kind] of [["textbook newer", "textbook", "clip"], ["textbook older", "textbook", "older"], ["natural", "natural", null]]) {
  const cells = ["T1", "T2", "T3", "T4", "pairs", "3+"].map((g) => {
    const pts = rows.filter((r) => grp(r) === g && out[style][r.id] && (!kind || kindOf(r) === kind)).flatMap((r) => out[style][r.id].contour.map((p) => p[1]));
    if (!pts.length) return "—";
    return `${fmt((100 * pts.filter((c) => c >= 4.995).length) / pts.length, 1)}% / ${fmt((100 * pts.filter((c) => c <= 1.005).length) / pts.length, 1)}%`;
  });
  console.log([label, ...cells].join(" | "));
}

// ---- Step 4: older session vs newer clips, per tone --------------------------
console.log("\n### Older session (2026-08-07) vs newer clips, single tones, polyline nodes on this ruler (medians, chao)");
console.log("tone | n older / newer | start | low | high | end | largest gap");
let step4Fail = [];
for (const tone of [1, 2, 3, 4]) {
  const o = singlesOf(tone, "older").map((r) => nodes(out.textbook[r.id].polyline));
  const n = singlesOf(tone, "clip").map((r) => nodes(out.textbook[r.id].polyline));
  const keys = ["start", "low", "high", "end"];
  const gaps = keys.map((k) => med(o.map((x) => x[k])) - med(n.map((x) => x[k])));
  const worst = Math.max(...gaps.map(Math.abs));
  if (tone !== 1 && worst > 0.3) step4Fail.push(`T${tone} ${fmt(worst)}`);
  console.log(`T${tone} | ${o.length} / ${n.length} | ` + keys.map((k) => `${fmt(med(o.map((x) => x[k])))} vs ${fmt(med(n.map((x) => x[k])))}`).join(" | ") + ` | ${fmt(worst)}`);
}
// Pierre accepted the T2 / T3 session differences on 11 Nov 2026 (second run:
// T3 end 0.56, T2 low 0.30). Any OTHER tone over 0.3 still stops.
const ACCEPTED_STEP4 = new Set(["T2", "T3"]);
const unaccepted = step4Fail.filter((f) => !ACCEPTED_STEP4.has(f.split(" ")[0]));
if (step4Fail.length) console.log(`older vs newer over 0.3 chao: ${step4Fail.join(", ")}${unaccepted.length ? "" : " (accepted by Pierre, 11 Nov 2026)"}`);
if (unaccepted.length && SHAPE_GATE !== "fixed") stop(4, `older vs newer differ by more than 0.3 chao outside T1: ${unaccepted.join(", ")}.`);

// ---- Step 5 (decision): older first-tone words lifted by one shared offset ----
const olderT1 = singlesOf(1, "older");
const t1OffsetChao = +(t1Level - med(olderT1.map((r) => out.textbook[r.id].polyline[0][1]))).toFixed(3);
const lift = (p) => [p[0], +Math.min(5, Math.max(1, p[1] + t1OffsetChao)).toFixed(3)];
for (const r of olderT1) {
  const s = out.textbook[r.id];
  out.textbook[r.id] = { ...s, polyline: s.polyline.map(lift), contour: s.contour.map(lift), adjusted: "t1-session-offset" };
}
console.log(`\nolder first-tone words lifted by ${t1OffsetChao} chao (${olderT1.length} words) -> median level ${fmt(med(olderT1.map((r) => out.textbook[r.id].polyline[0][1])))}`);
console.log(`to re-record before go-live: ${olderT1.map((r) => r.id).join(", ")}`);

// ---- Per-clip gate vs fixed 0.0033 ----------------------------------------
const corridorGap = (a, b) => { // compare as straight-line corridors at 51 points (node counts can differ)
  const at = (p, t) => { for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const [t0, c0] = p[i - 1], [t1, c1] = p[i]; return t1 > t0 ? c0 + ((t - t0) / (t1 - t0)) * (c1 - c0) : c1; } return p.at(-1)[1]; };
  let m = 0; for (let i = 0; i <= 50; i++) m = Math.max(m, Math.abs(at(a, i / 50) - at(b, i / 50))); return m;
};
console.log("\n### Per-clip gate vs fixed 0.0033 (same ruler, before the T1 offset)");
for (const style of ["textbook", "natural"]) {
  let any = 0, over01 = 0, over025 = 0, dur25 = 0, n = 0; const floors = [];
  for (const r of rows) {
    const a = cuts[style].get(r.id), b = fixed[style].get(r.id); if (!a || !b) continue; n++; floors.push(a.floor);
    const sa = shapeOf(r, a), sb = shapeOf(r, b);
    const g = corridorGap(sa.polyline, sb.polyline);
    if (g > 0.005 || Math.abs(sa.duration_s - sb.duration_s) > 0.0005) any++;
    if (g > 0.1) over01++; if (g > 0.25) over025++;
    if (Math.abs(sa.duration_s - sb.duration_s) > 0.025 || Math.abs(sa.onset_s - sb.onset_s) > 0.025) dur25++;
  }
  console.log(`${style}: ${n} shapes | changed at all ${any} | corridor moved > 0.1 chao ${over01} | > 0.25 chao ${over025} | onset or duration moved > 25 ms ${dur25} | clip floor median ${fmt(med(floors), 5)} (p10 ${fmt(pct(floors, 10), 5)}, p90 ${fmt(pct(floors, 90), 5)}; fixed 0.0033)`);
}

// ---- Older words cut from raw takes vs published timing ------------------------
console.log("\n### Older words cut from the raw takes vs published onset_s / duration_s (fixed gate = the published cut code)");
const olds = rows.filter((r) => kindOf(r) === "older");
const diffs = olds.map((r) => { const b = fixed.textbook.get(r.id); return { id: r.id, dOn: b.c.toneStartMs - 1000 * r.onset_s, dDur: b.c.durationMs - 1000 * r.duration_s }; });
for (const d of diffs.slice(0, 5)) console.log(`${d.id}: onset ${fmt(d.dOn, 1)} ms, duration ${fmt(d.dDur, 1)} ms`);
const within = (d) => Math.abs(d.dOn) <= 25 && Math.abs(d.dDur) <= 25;
console.log(`all ${diffs.length}: within 25 ms ${diffs.filter(within).length}, worst ${fmt(Math.max(...diffs.map((d) => Math.max(Math.abs(d.dOn), Math.abs(d.dDur)))), 1)} ms`);
const newer = newerRows.filter((r) => fixed.textbook.has(r.id)).map((r) => { const b = fixed.textbook.get(r.id); return Math.max(Math.abs(b.c.toneStartMs - 1000 * r.onset_s), Math.abs(b.c.durationMs - 1000 * r.duration_s)); });
console.log(`newer textbook clips (same check, info): within 25 ms ${newer.filter((x) => x <= 25).length} / ${newer.length}, worst ${fmt(Math.max(...newer), 1)} ms`);
if (!diffs.slice(0, 5).every(within)) stop(5, "older takes do not reproduce the published timing within 25 ms (step 5 of the brief).");

// ---- Coverage ----------------------------------------------------------------
console.log("\n### Coverage against the bundled catalog (textbook rows)");
console.log(`textbook ${Object.keys(out.textbook).length} / ${rows.length}; missing: ${rows.filter((r) => !out.textbook[r.id]).map((r) => r.id).join(", ") || "none"}`);
console.log(`natural ${Object.keys(out.natural).length}; catalog words with no local natural clip: ${rows.filter((r) => !out.natural[r.id]).map((r) => r.id).join(", ") || "none"}`);
for (const f of failed) console.log(`failed: ${f}`);

// ---- Old vs new targets ------------------------------------------------------
console.log("\n### Old target vs new target, textbook single tones (medians of polyline nodes, chao; older T1 after the offset)");
console.log("tone | words | start old → new | low old → new | high old → new | end old → new");
for (const tone of [1, 2, 3, 4]) {
  const ws = singlesOf(tone);
  const o = ws.map((r) => nodes(r.polyline)), n = ws.map((r) => nodes(out.textbook[r.id].polyline));
  const m = (a, k) => fmt(med(a.map((x) => x[k])));
  console.log(`T${tone} | ${ws.length} | ${m(o, "start")} → ${m(n, "start")} | ${m(o, "low")} → ${m(n, "low")} | ${m(o, "high")} → ${m(n, "high")} | ${m(o, "end")} → ${m(n, "end")}`);
}
console.log("\n### Natural single tones on the same ruler (new, medians, chao)");
for (const tone of [1, 2, 3, 4]) {
  const ws = rows.filter((r) => isSingle(tone)(r) && out.natural[r.id]);
  const n = ws.map((r) => nodes(out.natural[r.id].polyline));
  console.log(`T${tone} | ${n.length} | start ${fmt(med(n.map((x) => x.start)))} | low ${fmt(med(n.map((x) => x.low)))} | high ${fmt(med(n.map((x) => x.high)))} | end ${fmt(med(n.map((x) => x.end)))}`);
}
const moved = rows.filter((r) => out.textbook[r.id]).map((r) => ({ id: r.id, d: corridorGap(r.polyline, out.textbook[r.id].polyline) })).sort((a, b) => b.d - a.d);
console.log("\n### 20 textbook words whose corridor moved most (largest gap old vs new, chao)");
console.log(moved.slice(0, 20).map((m) => `${m.id} ${fmt(m.d)}`).join(" | "));
console.log(`median move over all textbook words: ${fmt(med(moved.map((m) => m.d)))} chao`);

if (!process.argv.includes("--no-write")) {
  mkdirSync("src/dev/local", { recursive: true });
  // One word per line: diffs stay readable.
  const enc = (o) => "{\n" + Object.entries(o).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n  }";
  const head = { version: 2, brief: 43, ruler, adjustments: { "t1-session-offset": { chao: t1OffsetChao, why: "older 2026-08-07 first tones were said at spoken height; one shared lift to the newer first-tone median; re-record before go-live", ids: olderT1.map((r) => r.id) } } };
  writeFileSync(OUT, "{\n" + Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + `,\n  "textbook": ${enc(out.textbook)},\n  "natural": ${enc(out.natural)}\n}\n`);
  console.log(`\nwrote ${OUT}`);
}
