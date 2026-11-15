// Brief 46, step 1: how well can the LIVE tracker's frames be split into
// syllables? Dev-only, offline, numbers only.
//
// Reference ("true") boundaries: the clip pipeline's own syllable runs
// (`multiSyllableSpan`, as `cutClip` calls it for shapes-v2.json: centre =
// ruler.measuredAtHz, per-clip gate). shapes-v2.json does not store the spans,
// so they are measured again here with the same code and settings.
//
// Splitters under test, on the live tracker's voiced frames (time, pitch, rms):
//   a  silence only (today: gaps > mergeGapMs, fragments < minUtteranceMs dropped)
//   b  silence, then loudness dip (quietest interior frame) until the count is met
//   c  as b, but a sharp pitch reset is tried before the loudness dip
//
//   node src/dev/bench39/split46.mjs            # comparison table
//   node src/dev/bench39/split46.mjs --fails    # list the words that still fail
import { readFileSync } from "node:fs";
import { multiSyllableSpan } from "../clipCutMulti.ts";
import { clipNoiseFloor } from "../clipCut.ts";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { readContourSyllables } from "../../game/freeAttempts.ts";
import { setTuning, tuning } from "../../game/tuning.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { clipList, cachedTrack, F0C } from "./tracks.mjs";
import { loadWav, med, pct } from "./lib.mjs";

const RULER = JSON.parse(readFileSync("src/dev/local/shapes-v2.json", "utf8")).ruler;
const F = RULER.measuredAtHz;
const GRIDS = {
  old: { mid: 0, up: 7, down: 5.75, flag: false }, // scorecard section 4 board, flag off
  ruler: { mid: 12 * Math.log2(RULER.middleHz / F0C), up: RULER.upSemitones, down: RULER.downSemitones, flag: true },
};
const argOf = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const SHOW_FAILS = process.argv.includes("--fails");

// ---- reference spans --------------------------------------------------------
function referenceBoundaries(c) {
  const { samples, sampleRate } = loadWav(c.file);
  const span = multiSyllableSpan(samples, sampleRate, F, c.tones.length, { noiseFloor: clipNoiseFloor(samples, sampleRate, F) });
  if (!span || span.runs.length !== c.tones.length) return null;
  const ms = (s) => (s / sampleRate) * 1000;
  // Reference quality (pairs, dip-filled only): does the cut sit at the 20% search edge,
  // and is there a real dip (trough under 0.7 x the quieter side's loudest frame)?
  let edge = false, flat = false;
  if (span.underSegmented && span.runs.length === 2) {
    const HOP = 1024, WIN = 2048, a = span.runs[0].start, z = span.runs[1].end, cut = span.runs[0].end, L = z - a;
    const rmsAt = (c) => { let q = 0, k = 0; for (let i = Math.max(0, Math.round(c - WIN / 2)); i < c + WIN / 2 && i < samples.length; i++) { q += samples[i] ** 2; k++; } return Math.sqrt(q / k); };
    edge = cut - (a + 0.2 * L) < HOP || z - 0.2 * L - cut < HOP;
    let l = 0, r = 0;
    for (let c2 = a; c2 < cut; c2 += HOP) l = Math.max(l, rmsAt(c2));
    for (let c2 = cut + HOP; c2 <= z; c2 += HOP) r = Math.max(r, rmsAt(c2));
    flat = rmsAt(cut) > 0.7 * Math.min(l, r);
  }
  const b = [];
  for (let k = 0; k + 1 < span.runs.length; k++) b.push((ms(span.runs[k].end) + ms(span.runs[k + 1].start)) / 2);
  return { b, edge, flat, under: span.underSegmented, over: span.overSegmented, start: ms(span.start), end: ms(span.end) };
}

// ---- live frames ----------------------------------------------------------
function liveFrames(c) {
  const o = cachedTrack(c, "live"), out = [];
  for (let i = 0; i < o.t.length; i++) if (o.v[i]) out.push({ tMs: o.t[i] * 1000, st: o.st[i], rms: o.rms[i] });
  return out;
}

// ---- splitters ----------------------------------------------------------------
const dur = (p) => (p.length ? p.at(-1).tMs - p[0].tMs : 0);
function splitAtGaps(frames, gapMs) {
  const out = []; let cur = [];
  for (const f of frames) { if (cur.length && f.tMs - cur.at(-1).tMs > gapMs) { out.push(cur); cur = []; } cur.push(f); }
  if (cur.length) out.push(cur);
  return out;
}
/** Index (into piece) of the quietest interior frame, 20% trimmed each end; -1 if none. */
function troughAt(piece, trim) {
  const t0 = piece[0].tMs, L = dur(piece), lo = t0 + L * trim, hi = piece.at(-1).tMs - L * trim;
  let best = -1, bestR = Infinity;
  for (let i = 1; i < piece.length - 1; i++) { const f = piece[i]; if (f.tMs < lo || f.tMs > hi) continue; if (f.rms < bestR) { bestR = f.rms; best = i; } }
  return best;
}
/** Index of the first frame after the largest frame-to-frame pitch jump (≥ minSt), interior only; -1 if none. */
function resetAt(piece, trim, minSt) {
  const t0 = piece[0].tMs, L = dur(piece), lo = t0 + L * trim, hi = piece.at(-1).tMs - L * trim;
  let best = -1, bestJ = minSt;
  for (let i = 1; i < piece.length; i++) {
    const f = piece[i]; if (f.tMs < lo || f.tMs > hi) continue;
    const j = Math.abs(f.st - piece[i - 1].st); if (j >= bestJ) { bestJ = j; best = i; }
  }
  return best;
}
/**
 * Generic count-aware splitter. opts: gapMs (silence), useDip, useReset, resetSt, trim, minPieceMs.
 * Returns pieces, or null when the expected count is not found.
 */
function splitN(frames, n, o) {
  let pieces = splitAtGaps(frames, o.gapMs).filter((p) => dur(p) >= o.dropMs);
  // Too many: join across the shortest silence until the count fits.
  while (pieces.length > n) {
    let k = 0, g = Infinity;
    for (let i = 0; i + 1 < pieces.length; i++) { const gi = pieces[i + 1][0].tMs - pieces[i].at(-1).tMs; if (gi < g) { g = gi; k = i; } }
    pieces = [...pieces.slice(0, k), [...pieces[k], ...pieces[k + 1]], ...pieces.slice(k + 2)];
  }
  while (pieces.length < n && (o.useDip || o.useReset)) {
    const longest = pieces.reduce((a, p) => (dur(p) > dur(a) ? p : a));
    let at = o.useReset ? resetAt(longest, o.trim, o.resetSt) : -1, skip = 0;
    if (at < 0 && o.useDip) { at = troughAt(longest, o.trim); skip = 1; }
    if (at <= 0 || at >= longest.length - 1) break;
    const k = pieces.indexOf(longest);
    pieces = [...pieces.slice(0, k), longest.slice(0, at), longest.slice(at + skip), ...pieces.slice(k + 1)];
  }
  if (pieces.length !== n || pieces.some((p) => dur(p) < o.minPieceMs)) return null;
  return pieces;
}
const boundariesOf = (pieces) => pieces.slice(0, -1).map((p, k) => (p.at(-1).tMs + pieces[k + 1][0].tMs) / 2);

const SPLITTERS = {
  "a silence only (today)": null, // uses readContourSyllables itself
  "b silence 150 + dip": { gapMs: 150, dropMs: 0, useDip: true, trim: 0.2, minPieceMs: 0 },
  "b silence 60 + dip": { gapMs: 60, dropMs: 0, useDip: true, trim: 0.2, minPieceMs: 0 },
  "c silence 60 + reset 2 st + dip": { gapMs: 60, dropMs: 0, useDip: true, useReset: true, resetSt: 2, trim: 0.2, minPieceMs: 0 },
  "c silence 60 + reset 1 st + dip": { gapMs: 60, dropMs: 0, useDip: true, useReset: true, resetSt: 1, trim: 0.2, minPieceMs: 0 },
};

// ---- reading --------------------------------------------------------------
function chaoPiece(piece, grid) {
  const t0 = piece[0].tMs;
  const points = piece.map((f) => ({ tMs: f.tMs - t0, chao: semitonesToChao(f.st - grid.mid, grid.up, grid.down) }));
  return { points, startedAtMs: 0, endedAtMs: points.at(-1).tMs };
}
/** Reads every piece: tone or null ("?") when too short. Whole read is null when pieces is null. */
function readPieces(pieces, grid) {
  if (!pieces) return null;
  const minMs = tuning().minUtteranceMs;
  return pieces.map((p) => (dur(p) < minMs ? null : (classifyToneV2(chaoPiece(p, grid))?.tone ?? null)));
}
function todayRead(frames, grid) {
  const k = chaoPiece(frames, grid);
  return readContourSyllables(k)?.map((s) => s?.tone ?? null) ?? null;
}
/** Today's pieces (for boundaries): readAttempt's split, gap = mergeGapMs, fragments < minUtteranceMs dropped. */
function todayPieces(frames) {
  return splitAtGaps(frames, tuning().mergeGapMs).filter((p) => dur(p) >= tuning().minUtteranceMs);
}

// ---- run ------------------------------------------------------------------
const clips = clipList().filter((c) => c.tones.length >= 2 && c.tones.every((t) => t >= 1));
const ref = new Map();
for (const c of clips) ref.set(c.set + c.id, referenceBoundaries(c));
const STYLES = ["textbook", "natural"];
const groups = { pairs: (c) => c.tones.length === 2, "3+syll": (c) => c.tones.length > 2 };
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");

console.log(`reference: multiSyllableSpan at ${F} Hz, per-clip gate. Pairs ${clips.filter(groups.pairs).length}, longer ${clips.filter(groups["3+syll"]).length}.`);
for (const [s, n] of Object.entries({ textbook: 0, natural: 0 })) {
  const k = clips.filter((c) => c.set === s);
  const r = k.map((c) => ref.get(c.set + c.id));
  console.log(`  ${s}: ${k.length} words, reference found ${r.filter(Boolean).length}, voicing gap ${r.filter((x) => x && !x.under).length}, filled by loudness dip ${r.filter((x) => x?.under).length}, over ${r.filter((x) => x?.over).length}`);
  console.log(`    pairs cut by the dip fallback: at the 20% search edge ${r.filter((x) => x?.edge).length}, no real dip ${r.filter((x) => x?.flat).length}, either ${r.filter((x) => x?.edge || x?.flat).length}`);
}

const results = {};
for (const gridName of Object.keys(GRIDS)) {
  const grid = GRIDS[gridName];
  setTuning({ playerRulerV2: grid.flag });
  console.log(`\n### Grid: ${gridName} (${grid.flag ? "Jane's one ruler, reader flag on" : "Phase A board, flag off"})`);
  console.log("splitter | style | group | n | right count % | boundary err med ms | p90 ms | within 50 ms % | both right % (of all) | wrong-tone reads on wrong-count | wrong reads on bad boundary (>80 ms)");
  for (const [name, o] of Object.entries(SPLITTERS)) for (const style of STYLES) for (const [gname, gf] of Object.entries(groups)) {
    const ks = clips.filter((c) => c.set === style && gf(c));
    let n = 0, countOk = 0, both = 0, wrongOnMis = 0, wrongOnBad = 0; const errs = []; const fails = [];
    for (const c of ks) {
      const fr = liveFrames(c); if (fr.length < 3) continue;
      const r = ref.get(c.set + c.id);
      n++;
      const pieces = o ? splitN(fr, c.tones.length, o) : todayPieces(fr);
      const read = o ? readPieces(pieces, grid) : todayRead(fr, grid);
      const okCount = !!pieces && pieces.length === c.tones.length && !!read && read.length === c.tones.length;
      const hasWrong = !!read && read.some((t, i) => t !== null && t !== "none" && t !== c.tones[i]);
      if (okCount) countOk++;
      else if (hasWrong) wrongOnMis++;
      let bad = false;
      if (okCount && r) {
        const e = boundariesOf(pieces).map((b, k) => Math.abs(b - r.b[k]));
        errs.push(...e); bad = e.some((x) => x > 80);
      }
      if (okCount && bad && hasWrong) wrongOnBad++;
      const allRight = okCount && read.every((t, i) => t === c.tones[i]);
      if (allRight) both++;
      else fails.push(`${c.id}${okCount ? (bad ? " (bad boundary)" : " (reader)") : " (count)"} read ${JSON.stringify(read)}`);
    }
    const within = errs.length ? (100 * errs.filter((e) => e <= 50).length) / errs.length : NaN;
    results[`${gridName}|${name}|${style}|${gname}`] = { n, count: (100 * countOk) / n, both: (100 * both) / n, wrongOnMis, fails };
    console.log([name, style, gname, n, f1((100 * countOk) / n), f1(med(errs)), f1(pct(errs, 90)), f1(within), f1((100 * both) / n), wrongOnMis, wrongOnBad].join(" | "));
    if (SHOW_FAILS && name === argOf("--fails", "")) console.log("   fails: " + fails.join("; "));
  }
}

// ---- per-syllable reader accuracy with the reference split (oracle) ----------
console.log("\n### Per-syllable reader accuracy on the reference split (oracle boundaries, live frames)");
console.log("grid | style | syllables | right % | '?' % | wrong % | pairs both right %");
for (const gridName of Object.keys(GRIDS)) {
  const grid = GRIDS[gridName]; setTuning({ playerRulerV2: grid.flag });
  for (const style of STYLES) {
    let n = 0, ok = 0, q = 0, pn = 0, pboth = 0;
    for (const c of clips.filter((c) => c.set === style && c.tones.length === 2)) {
      pn++;
      const fr = liveFrames(c), r = ref.get(c.set + c.id); if (!r || fr.length < 3) continue;
      const pieces = [fr.filter((f) => f.tMs < r.b[0]), fr.filter((f) => f.tMs >= r.b[0])];
      if (pieces.some((p) => p.length < 2)) { n += 2; q += 2; continue; }
      const read = readPieces(pieces, grid);
      read.forEach((t, i) => { n++; if (t === c.tones[i]) ok++; else if (t === null || t === "none") q++; });
      if (read.every((t, i) => t === c.tones[i])) pboth++;
    }
    console.log([gridName, style, n, f1((100 * ok) / n), f1((100 * q) / n), f1((100 * (n - ok - q)) / n), f1((100 * pboth) / pn)].join(" | "));
  }
}
setTuning({ playerRulerV2: false });
