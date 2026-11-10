// Brief 43: every target shape measured again on ONE ruler for all of Jane's
// tones, written to src/dev/local/shapes-v2.json. Dev-only, offline.
// No Supabase client, no R2, no network. Reads only local audio:
//   textbook  fixtures/clips/jane/<id>.wav, else the raw take in
//             fixtures/recordings/2026-08-07-xujzgs/<id>.wav (the 120 older words)
//   natural   fixtures/clips/jane/natural/<id>.wav
// The word list is src/data/wordsFallback.json (the published textbook catalog).
//
//   node src/dev/bench39/make-shapes.mjs            # measure, print, write the file
//   node src/dev/bench39/make-shapes.mjs --no-write # measure and print only
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cutClip, clipNoiseFloor, templateContour, MEASURE_RANGE_SEMITONES } from "../clipCut.ts";
import { multiSyllablePolyline } from "../clipCutMulti.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { loadWav, pct, med, fmt } from "./lib.mjs";

const OUT = "src/dev/local/shapes-v2.json";
const OLD_SESSION = "fixtures/recordings/2026-08-07-xujzgs";
const SEED = 181.3; // catalog centre (wordsFallback meta), pass 1 only
const TOP_PCT = 98, BOTTOM_PCT = 2; // brief 43 step 1, fixed before looking
const CREAK_ST = -10; // frames more than 10 st under the middle are creak (heights.mjs rule)
const R = MEASURE_RANGE_SEMITONES; // contour measured on a wide ±15 st board: chao = 3 + 2·st/15

const rows = JSON.parse(readFileSync("src/data/wordsFallback.json", "utf8")).rows;
const tonesOf = (r) => (r.syllables > 1 ? r.tones : [r.tone]);

function sourceOf(style, id) {
  if (style === "natural") { const f = `fixtures/clips/jane/natural/${id}.wav`; return existsSync(f) ? { file: f, kind: "clip" } : null; }
  const f = `fixtures/clips/jane/${id}.wav`;
  if (existsSync(f)) return { file: f, kind: "clip" };
  const raw = `${OLD_SESSION}/${id}.wav`;
  return existsSync(raw) ? { file: raw, kind: "raw-2026-08-07" } : null;
}

const audio = new Map();
const wav = (file) => { if (!audio.has(file)) audio.set(file, loadWav(file)); return audio.get(file); };

/** One cut. `gate`: "clip" (floor from the clip) or "fixed" (tracker default 0.0033). */
function cut(row, style, f0Center, gate) {
  const src = sourceOf(style, row.id);
  if (!src) return null;
  const { samples, sampleRate } = wav(src.file);
  const floor = clipNoiseFloor(samples);
  const c = cutClip(samples, sampleRate, f0Center, R, row.tone, row.syllables, gate === "clip" ? { noiseFloor: floor } : {});
  // Wide-board chao back to semitones from f0Center (linear inside ±15 st).
  const st = c.contour.map(([t, chao]) => [t, (chao - 3) * (R / 2)]);
  return { src, floor, c, st };
}

// ---- Step 1: Jane's ruler, from all her textbook clips --------------------
function rulerFrom(cuts, f0Center) {
  const all = cuts.flatMap((x) => x.st.map(([, s]) => s));
  const m0 = med(all);
  const kept = all.filter((s) => s - m0 >= CREAK_ST);
  const mid = med(kept); // semitones from f0Center
  const rel = kept.map((s) => s - mid);
  return {
    middleHz: +(f0Center * 2 ** (mid / 12)).toFixed(1),
    upSemitones: +pct(rel, TOP_PCT).toFixed(2),
    downSemitones: +(-pct(rel, BOTTOM_PCT)).toFixed(2),
    frames: kept.length, creakFramesLeftOut: all.length - kept.length,
  };
}
const textbookRows = rows.filter((r) => sourceOf("textbook", r.id));
const pass1 = textbookRows.map((r) => cut(r, "textbook", SEED, "clip")).filter(Boolean);
const r1 = rulerFrom(pass1, SEED);
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
const ruler0 = rulerFrom([...cuts.textbook.values()], F);
// The ruler is relative to F; its middle is F shifted by the pass-2 median.
const ruler = { ...ruler0, percentiles: [BOTTOM_PCT, TOP_PCT], creakBelowSemitones: CREAK_ST, measuredAtHz: F,
  source: "textbook clips, final listener (brief 42), per-clip gate, tone window frames, creak left out" };
const midShift = 12 * Math.log2(ruler.middleHz / F);
console.log("\n### Jane's ruler (pass 2)");
console.log(`middle ${ruler.middleHz} Hz | up ${ruler.upSemitones} st | down ${ruler.downSemitones} st | ${ruler.frames} frames, ${ruler.creakFramesLeftOut} creak frames left out`);

const toChao = (s) => semitonesToChao(s - midShift, ruler.upSemitones, ruler.downSemitones);
const onRuler = (x) => x.st.map(([t, s]) => [+t.toFixed(4), +toChao(s).toFixed(3)]);
function shapeOf(row, x) {
  const contour = onRuler(x);
  const polyline = row.syllables > 1 ? multiSyllablePolyline(contour, x.c.syllableSpans ?? [[0, 1]]) : templateContour(row.tone, contour);
  return { polyline, contour, onset_s: +(x.c.toneStartMs / 1000).toFixed(3), duration_s: +(x.c.durationMs / 1000).toFixed(4) };
}

// Ruler check (brief 43 step 1): first-tone level 3.8–4.4, fourth-tone start 4.6–5.0.
const singles = (tone) => rows.filter((r) => r.syllables === 1 && r.tone === tone && cuts.textbook.has(r.id));
const t1Level = med(singles(1).map((r) => shapeOf(r, cuts.textbook.get(r.id)).polyline[0][1]));
const t4Start = med(singles(4).map((r) => { const c = onRuler(cuts.textbook.get(r.id)); const k = Math.max(2, Math.round(c.length * 0.15)); return med(c.slice(0, k).map((p) => p[1])); }));
console.log(`check: first tone ${fmt(t1Level)} (3.8–4.4) | fourth-tone start ${fmt(t4Start)} (4.6–5.0)`);
const rulerOk = t1Level >= 3.8 && t1Level <= 4.4 && t4Start >= 4.6 && t4Start <= 5.0;
if (!rulerOk) { console.log("RULER CHECK FAILED — stop (brief 43 step 1)."); process.exit(2); }

// ---- Shapes --------------------------------------------------------------
const out = { version: 2, brief: 43, ruler, textbook: {}, natural: {} };
for (const style of ["textbook", "natural"]) for (const r of rows) { const x = cuts[style].get(r.id); if (x) out[style][r.id] = shapeOf(r, x); }

// ---- Step 3: how many shapes the per-clip gate changes ----------------------
const maxNodeGap = (a, b, dur) => { // compare as corridors at 50 points (node counts can differ)
  const at = (p, t) => { for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const [t0, c0] = p[i - 1], [t1, c1] = p[i]; return t1 > t0 ? c0 + ((t - t0) / (t1 - t0)) * (c1 - c0) : c1; } return p.at(-1)[1]; };
  let m = 0; for (let i = 0; i <= 50; i++) m = Math.max(m, Math.abs(at(a, i / 50) - at(b, i / 50))); return m;
};
console.log("\n### Step 3: per-clip gate vs fixed 0.0033 (same ruler)");
for (const style of ["textbook", "natural"]) {
  let any = 0, over01 = 0, over025 = 0, dur25 = 0, n = 0; const floors = [];
  for (const r of rows) {
    const a = cuts[style].get(r.id), b = fixed[style].get(r.id); if (!a || !b) continue; n++; floors.push(a.floor);
    const sa = shapeOf(r, a), sb = shapeOf(r, b);
    const g = maxNodeGap(sa.polyline, sb.polyline);
    if (g > 0.005 || Math.abs(sa.duration_s - sb.duration_s) > 0.0005) any++;
    if (g > 0.1) over01++; if (g > 0.25) over025++;
    if (Math.abs(sa.duration_s - sb.duration_s) > 0.025 || Math.abs(sa.onset_s - sb.onset_s) > 0.025) dur25++;
  }
  console.log(`${style}: ${n} shapes | changed at all ${any} | corridor moved > 0.1 chao ${over01} | > 0.25 chao ${over025} | onset or duration moved > 25 ms ${dur25} | clip floor median ${fmt(med(floors), 5)} (p10 ${fmt(pct(floors, 10), 5)}, p90 ${fmt(pct(floors, 90), 5)}; fixed 0.0033)`);
}

// ---- Step 5: the 120 older words, cut from raw takes, vs published timing ----
console.log("\n### Step 5: older words cut from the raw takes vs published onset_s / duration_s (fixed gate = the published cut code)");
const olds = rows.filter((r) => cuts.textbook.get(r.id)?.src.kind === "raw-2026-08-07");
const diffs = olds.map((r) => { const b = fixed.textbook.get(r.id); return { id: r.id, dOn: 1000 * (b.c.toneStartMs / 1000 - r.onset_s), dDur: 1000 * (b.c.durationMs / 1000 - r.duration_s) }; });
for (const d of diffs.slice(0, 5)) console.log(`${d.id}: onset ${fmt(d.dOn, 1)} ms, duration ${fmt(d.dDur, 1)} ms`);
const worst = Math.max(...diffs.map((d) => Math.max(Math.abs(d.dOn), Math.abs(d.dDur))));
console.log(`all ${diffs.length}: within 25 ms ${diffs.filter((d) => Math.abs(d.dOn) <= 25 && Math.abs(d.dDur) <= 25).length}, worst ${fmt(worst, 1)} ms`);
const firstFiveOk = diffs.slice(0, 5).every((d) => Math.abs(d.dOn) <= 25 && Math.abs(d.dDur) <= 25);
const newer = rows.filter((r) => cuts.textbook.get(r.id)?.src.kind === "clip").map((r) => { const b = fixed.textbook.get(r.id); return Math.max(Math.abs(1000 * (b.c.toneStartMs / 1000 - r.onset_s)), Math.abs(1000 * (b.c.durationMs / 1000 - r.duration_s))); });
console.log(`newer textbook clips (same check, info): within 25 ms ${newer.filter((x) => x <= 25).length} / ${newer.length}, worst ${fmt(Math.max(...newer), 1)} ms`);
if (!firstFiveOk) { console.log("STEP 5 CHECK FAILED — stop."); process.exit(3); }

// ---- Coverage ----------------------------------------------------------------
console.log("\n### Coverage against the bundled catalog (textbook rows)");
console.log(`textbook ${Object.keys(out.textbook).length} / ${rows.length}; missing: ${rows.filter((r) => !out.textbook[r.id]).map((r) => r.id).join(", ") || "none"}`);
console.log(`natural ${Object.keys(out.natural).length}; catalog words with no local natural clip: ${rows.filter((r) => !out.natural[r.id]).map((r) => r.id).join(", ") || "none"}`);
for (const f of failed) console.log(`failed: ${f}`);

// ---- Old vs new targets ------------------------------------------------------
const nodes = (p, tone) => ({ start: p[0][1], low: Math.min(...p.map((q) => q[1])), high: Math.max(...p.map((q) => q[1])), end: p.at(-1)[1] });
console.log("\n### Old target vs new target, textbook single tones (medians, chao)");
console.log("tone | words | start old → new | low old → new | high old → new | end old → new");
for (const tone of [1, 2, 3, 4]) {
  const ws = rows.filter((r) => r.syllables === 1 && r.tone === tone && out.textbook[r.id]);
  const o = ws.map((r) => nodes(r.polyline)), n = ws.map((r) => nodes(out.textbook[r.id].polyline));
  const m = (a, k) => fmt(med(a.map((x) => x[k])));
  console.log(`T${tone} | ${ws.length} | ${m(o, "start")} → ${m(n, "start")} | ${m(o, "low")} → ${m(n, "low")} | ${m(o, "high")} → ${m(n, "high")} | ${m(o, "end")} → ${m(n, "end")}`);
}
console.log("\n### Natural single tones on the same ruler (new only, medians, chao)");
for (const tone of [1, 2, 3, 4]) {
  const n = rows.filter((r) => r.syllables === 1 && r.tone === tone && out.natural[r.id]).map((r) => nodes(out.natural[r.id].polyline));
  console.log(`T${tone} | ${n.length} | start ${fmt(med(n.map((x) => x.start)))} | low ${fmt(med(n.map((x) => x.low)))} | high ${fmt(med(n.map((x) => x.high)))} | end ${fmt(med(n.map((x) => x.end)))}`);
}
const moved = rows.filter((r) => out.textbook[r.id]).map((r) => ({ id: r.id, d: maxNodeGap(r.polyline, out.textbook[r.id].polyline) })).sort((a, b) => b.d - a.d);
console.log("\n### 20 textbook words whose corridor moved most (largest gap old vs new, chao)");
console.log(moved.slice(0, 20).map((m) => `${m.id} ${fmt(m.d)}`).join(" | "));
console.log(`median move over all textbook words: ${fmt(med(moved.map((m) => m.d)))} chao`);

if (!process.argv.includes("--no-write")) {
  mkdirSync("src/dev/local", { recursive: true });
  // One word per line: diffs stay readable.
  const enc = (o) => "{\n" + Object.entries(o).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n  }";
  writeFileSync(OUT, `{\n  "version": 2,\n  "brief": 43,\n  "ruler": ${JSON.stringify(ruler)},\n  "textbook": ${enc(out.textbook)},\n  "natural": ${enc(out.natural)}\n}\n`);
  console.log(`\nwrote ${OUT}`);
}
