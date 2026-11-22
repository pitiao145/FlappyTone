// Brief 51 step 4: offline proof that `process-clips --one-ruler` makes the
// shapes of `src/dev/local/shapes-v2.json`. Dev-only. Reads local audio only:
// no Supabase, no R2, no network, writes nothing.
//
// It runs `shapeOnRuler` (src/dev/clipRuler.ts, the code process-clips calls)
// on the same local audio make-shapes.mjs read, and compares each shape with
// the stored one: largest corridor gap over 51 points (chao), onset and
// duration (ms). The 30 older first-tone words get the same shared lift
// make-shapes adds (it is a stopgap; those words get re-recorded).
//
// Second pass (--raw): the raw takes under fixtures/recordings/jane/<session>/
// (process-clips' real input, edges not faded) for the newer textbook words.
//
//   node src/dev/bench39/ruler-pipeline-check.mjs [--raw]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { shapeOnRuler, JANE_RULER } from "../clipRuler.ts";
import { loadWav, med, fmt } from "./lib.mjs";

const LIMIT = 0.05; // chao
const OLD_SESSION = "fixtures/recordings/2026-08-07-xujzgs";
const v2 = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8"));
const rows = JSON.parse(readFileSync("src/data/wordsFallback.json", "utf8")).rows;
const lift = v2.adjustments["t1-session-offset"];
const lifted = new Set(lift.ids);

for (const k of ["middleHz", "upSemitones", "downSemitones", "measuredAtHz"]) {
  if (v2.ruler[k] !== JANE_RULER[k]) { console.log(`STOP: ruler ${k} ${JANE_RULER[k]} != shapes-v2 ${v2.ruler[k]}`); process.exit(2); }
}

function sourceOf(style, id) { // as make-shapes.mjs
  if (style === "natural") { const f = `fixtures/clips/jane/natural/${id}.wav`; return existsSync(f) ? f : null; }
  const f = `fixtures/clips/jane/${id}.wav`;
  if (existsSync(f)) return f;
  const raw = `${OLD_SESSION}/${id}.wav`;
  return existsSync(raw) ? raw : null;
}
const rawSessions = existsSync("fixtures/recordings/jane")
  ? readdirSync("fixtures/recordings/jane").filter((d) => /^\d{4}-/.test(d)) : [];
// A word re-recorded in a later sitting has several raw takes; offline there is
// no `recorded_session` to pick the published one, so take the raw file whose
// length equals the published clip's (the clip IS the take, edges faded).
function rawOf(id) {
  const clip = `fixtures/clips/jane/${id}.wav`;
  const len = existsSync(clip) ? loadWav(clip).samples.length : -1;
  for (const s of rawSessions) {
    const f = `fixtures/recordings/jane/${s}/${id}.wav`;
    if (existsSync(f) && loadWav(f).samples.length === len) return f;
  }
  return null;
}

const at = (p, t) => { for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const [t0, c0] = p[i - 1], [t1, c1] = p[i]; return t1 > t0 ? c0 + ((t - t0) / (t1 - t0)) * (c1 - c0) : c1; } return p.at(-1)[1]; };
const gap = (a, b) => { let m = 0; for (let i = 0; i <= 50; i++) m = Math.max(m, Math.abs(at(a, i / 50) - at(b, i / 50))); return m; };
const liftPt = ([t, c]) => [t, +Math.min(5, Math.max(1, c + lift.chao)).toFixed(3)];

function check(label, style, fileOf, ids) {
  const res = [];
  const missing = [], failed = [];
  for (const r of rows) {
    if (ids && !ids.has(r.id)) continue;
    const stored = v2[style][r.id];
    const file = fileOf(style, r.id);
    if (!stored) { if (file) missing.push(r.id); continue; }
    if (!file) { missing.push(r.id); continue; }
    try {
      const { samples, sampleRate } = loadWav(file);
      const s = shapeOnRuler(samples, sampleRate, JANE_RULER, r.tone, r.syllables);
      const poly = style === "textbook" && lifted.has(r.id) ? s.polyline.map(liftPt) : s.polyline;
      res.push({
        id: r.id, syl: r.syllables,
        g: gap(poly, stored.polyline),
        dOn: Math.abs(s.onsetMs - 1000 * stored.onset_s),
        dDur: Math.abs(s.durationMs - 1000 * stored.duration_s),
        nodes: `${s.polyline.length}/${stored.polyline.length}`,
      });
    } catch (e) { failed.push(`${r.id}: ${e.message}`); }
  }
  const over = res.filter((x) => x.g > LIMIT);
  const timing = res.filter((x) => x.dOn > 1 || x.dDur > 1);
  console.log(`\n### ${label}`);
  console.log(`shapes compared ${res.length} | within ${LIMIT} chao ${res.length - over.length} | over ${over.length} | median gap ${fmt(med(res.map((x) => x.g)), 4)} | worst ${fmt(Math.max(0, ...res.map((x) => x.g)), 4)} | onset or duration off > 1 ms ${timing.length}`);
  for (const x of over.sort((a, b) => b.g - a.g).slice(0, 30)) console.log(`  over: ${x.id} gap ${fmt(x.g, 3)} chao, onset ${fmt(x.dOn, 1)} ms, duration ${fmt(x.dDur, 1)} ms, nodes new/stored ${x.nodes}`);
  if (missing.length) console.log(`  no comparison (no audio or no stored shape): ${missing.length}${missing.length <= 10 ? ` (${missing.join(", ")})` : ""}`);
  for (const f of failed) console.log(`  failed to cut: ${f}`);
  return { n: res.length, over: over.length };
}

const a = check("textbook, make-shapes' own inputs", "textbook", sourceOf);
const b = check("natural, make-shapes' own inputs", "natural", sourceOf);
if (process.argv.includes("--raw")) {
  const newer = new Set(rows.filter((r) => existsSync(`fixtures/clips/jane/${r.id}.wav`)).map((r) => r.id));
  check("textbook, raw takes (process-clips' real input, edges not faded), newer words", "textbook", (_s, id) => rawOf(id), newer);
}
console.log(`\nresult: ${a.over + b.over === 0 ? "PASS" : "MISSES"}: ${a.n + b.n} shapes, ${a.over + b.over} over ${LIMIT} chao`);
