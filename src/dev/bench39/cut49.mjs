// Brief 49: where to cut a two-syllable word. Compares four ways on the live
// tracker's frames of Jane's 411 pairs (and Pierre's takes), reads each half
// on its own (classifier v2, no target), and reports per tone pair and style.
// Dev-only, offline, numbers only.
//
//   node src/dev/bench39/cut49.mjs              # step 2 table (16 pairs x 2 styles x approaches)
//   node src/dev/bench39/cut49.mjs --summary    # totals only
//   node src/dev/bench39/cut49.mjs --swap       # step 3 label-swap test
//   node src/dev/bench39/cut49.mjs --pierre     # step 4
//
// Approaches:
//   0 today      findSyllables (silence 150 ms, then a real loudness dip, else "?")
//   1 middle     half the voiced frames
//   2 spot       expected spot per tone pair and style (learned on the OTHER half of
//                Jane's clips, 2-fold), then search a window around it: silence,
//                loudness dip, the pair's typical pitch event; nothing found → the spot
//   2q           as 2, but nothing found → "?" for both syllables
//   3 stretch    Jane's other recording of the same word stretched in time (linear)
//                onto this one; cut where her join lands
//   3d dtw       same, stretched by dynamic time warping on the pitch line
import { janePairs, pierrePairs, pierreReady, JANE_GRIDS, RULER } from "./cut49data.mjs";
import { findSyllables, splitAtSilences } from "../../game/syllables.ts";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { setTuning, tuning } from "../../game/tuning.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { med, pct } from "./lib.mjs";

const ARG = (k) => process.argv.includes(k);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const dur = (p) => (p.length ? p.at(-1).tMs - p[0].tMs : 0);
const keyOf = (t) => t.join("");
const foldOf = (id) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 2;
export const PAIR_KEYS = ["11", "12", "13", "14", "21", "22", "23", "24", "31", "32", "33", "34", "41", "42", "43", "44"];

// ---- cut helpers --------------------------------------------------------------
const splitAt = (fr, tCut) => { const p = [fr.filter((f) => f.tMs < tCut), fr.filter((f) => f.tMs >= tCut)]; return p[0].length && p[1].length ? p : null; };
const cutOf = (pieces) => (pieces && pieces[0].length && pieces[1].length ? (pieces[0].at(-1).tMs + pieces[1][0].tMs) / 2 : null);
function smooth(st) {
  return st.map((_, i) => { const w = st.slice(Math.max(0, i - 1), i + 2).sort((a, b) => a - b); return w[w.length >> 1]; });
}
/** Today's silence rule: 2+ pieces at gaps > gapMs, joined across the shortest gap down to 2. */
function silencePieces(fr, gapMs) {
  let p = splitAtSilences(fr, gapMs);
  while (p.length > 2) {
    let k = 0, g = Infinity;
    for (let i = 0; i + 1 < p.length; i++) { const gi = p[i + 1][0].tMs - p[i].at(-1).tMs; if (gi < g) { g = gi; k = i; } }
    p = [...p.slice(0, k), [...p[k], ...p[k + 1]], ...p.slice(k + 2)];
  }
  return p.length === 2 ? p : null;
}
const EVENTS = ["min", "max", "fall", "rise"];
/** Time of a pitch event inside frames[a..b] (indices), or null. */
function eventAt(fr, a, b, ev) {
  if (b - a < 3) return null;
  const s = smooth(fr.map((f) => f.st));
  let best = null, bv = -Infinity;
  for (let i = Math.max(a, 1); i <= Math.min(b, fr.length - 2); i++) {
    const v = ev === "min" ? -s[i] : ev === "max" ? s[i] : ev === "fall" ? s[i - 1] - s[i + 1] : s[i + 1] - s[i - 1];
    if (v > bv) { bv = v; best = i; }
  }
  if (best === null) return null;
  if ((ev === "fall" || ev === "rise") && bv < 0.6) return null; // no real movement
  return fr[best].tMs;
}

// ---- the expected-spot model (approach 2) --------------------------------------
export function learnSpots(train) {
  const model = {};
  for (const style of ["textbook", "natural"]) for (const key of PAIR_KEYS) {
    const ks = train.filter((c) => c.set === style && keyOf(c.truth) === key && c.ref);
    if (ks.length < 2) continue;
    const share = (c) => (c.ref.cut - c.fr[0].tMs) / dur(c.fr);
    const shares = ks.map(share);
    const s = med(shares);
    const w = Math.min(0.2, Math.max(0.08, (pct(shares, 90) - pct(shares, 10)) / 2 + 0.04));
    // pitch event: the one that lands closest to the reference, after a fixed offset
    let ev = null, off = 0, bestErr = 50;
    for (const e of EVENTS) {
      const d = [];
      for (const c of ks) {
        const L = dur(c.fr), t0 = c.fr[0].tMs;
        const a = c.fr.findIndex((f) => f.tMs >= t0 + (s - w) * L), b = c.fr.findLastIndex((f) => f.tMs <= t0 + (s + w) * L);
        const t = eventAt(c.fr, a, b, e);
        if (t !== null) d.push(t - c.ref.cut);
      }
      if (d.length < Math.max(2, 0.7 * ks.length)) continue;
      const o = med(d), err = med(d.map((x) => Math.abs(x - o)));
      if (err < bestErr) { bestErr = err; ev = e; off = o; }
    }
    model[`${style}|${key}`] = { s, w, ev, off, n: ks.length };
  }
  return model;
}

/** Approach 2. opts: gapMs (in-window silence), dipRatio, fallback "spot" | "q". */
export function spotCut(fr, m, opts) {
  if (!m) { const sil = silencePieces(fr, tuning().mergeGapMs); return { pieces: sil, how: sil ? "silence" : "nomodel" }; }
  const t0 = fr[0].tMs, L = dur(fr), lo = t0 + (m.s - m.w) * L, hi = t0 + (m.s + m.w) * L;
  const far = opts.farW ?? Infinity; // a cut further than far x w from the spot is unsure → "?"
  const okAt = (t) => Math.abs((t - t0) / L - m.s) <= far * m.w;
  // long silences: the one nearest the expected spot
  const sp = splitAtSilences(fr, tuning().mergeGapMs);
  if (sp.length >= 2) {
    let k = 0, bd = Infinity;
    for (let i = 0; i + 1 < sp.length; i++) { const d = Math.abs((sp[i].at(-1).tMs + sp[i + 1][0].tMs) / 2 - (t0 + m.s * L)); if (d < bd) { bd = d; k = i; } }
    const pieces = [sp.slice(0, k + 1).flat(), sp.slice(k + 1).flat()];
    return okAt(cutOf(pieces)) ? { pieces, how: "silence" } : { pieces: null, how: "far" };
  }
  const a = fr.findIndex((f) => f.tMs >= lo), b = fr.findLastIndex((f) => f.tMs <= hi);
  if (a < 1 || b > fr.length - 2 || b - a < 1) return { pieces: opts.fallback === "q" ? null : splitAt(fr, t0 + m.s * L), how: "spot" };
  // silence inside the window
  let g = -1, gl = opts.gapMs;
  for (let i = Math.max(a, 1); i <= b + 1 && i < fr.length; i++) { const d = fr[i].tMs - fr[i - 1].tMs; if (d > gl) { gl = d; g = i; } }
  if (g > 0) return { pieces: [fr.slice(0, g), fr.slice(g)], how: "gap" };
  // real loudness dip inside the window
  let q = -1, qr = Infinity;
  for (let i = Math.max(a, 1); i <= Math.min(b, fr.length - 2); i++) if (fr[i].rms < qr) { qr = fr[i].rms; q = i; }
  if (q > 0) {
    const peak = (p) => Math.max(...p.map((f) => f.rms));
    if (qr < opts.dipRatio * Math.min(peak(fr.slice(0, q)), peak(fr.slice(q + 1)))) return { pieces: [fr.slice(0, q), fr.slice(q + 1)], how: "dip" };
  }
  if (m.ev) {
    const t = eventAt(fr, a, b, m.ev);
    if (t !== null) return { pieces: splitAt(fr, t + m.off), how: "pitch" };
  }
  return { pieces: opts.fallback === "q" ? null : splitAt(fr, t0 + m.s * L), how: "spot" };
}

// ---- approach 3: stretch Jane's other recording ---------------------------------
function dtwCut(fr, jane) {
  const A = fr.map((f) => f.st), B = jane.fr.map((f) => f.st);
  const ma = med(A), mb = med(B), n = A.length, m = B.length;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const c = Math.abs(A[i - 1] - ma - (B[j - 1] - mb));
    D[i][j] = c + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
  }
  // walk back; the first player frame matched to a Jane frame at/after her cut
  let i = n, j = m, hit = null;
  while (i > 0 && j > 0) {
    if (jane.fr[j - 1].tMs >= jane.ref.cut) hit = i - 1;
    const d = D[i - 1][j - 1], u = D[i - 1][j], l = D[i][j - 1];
    if (d <= u && d <= l) { i--; j--; } else if (u <= l) i--; else j--;
  }
  return hit === null ? null : fr[hit].tMs;
}
function stretchCut(fr, jane, kind) {
  const sil = silencePieces(fr, tuning().mergeGapMs);
  if (sil) return { pieces: sil, how: "silence" };
  if (!jane?.ref) return { pieces: null, how: "noversion" };
  const share = (jane.ref.cut - jane.fr[0].tMs) / dur(jane.fr);
  const t = kind === "dtw" ? dtwCut(fr, jane) : fr[0].tMs + share * dur(fr);
  return t === null ? { pieces: null, how: "nodtw" } : { pieces: splitAt(fr, t), how: kind };
}

// ---- reading --------------------------------------------------------------------
/** opts.trim: drop edge frames under this share of the piece's loudest; opts.guardMs: drop frames this close to the cut. */
export function readPieces(pieces, grid, opts = {}) {
  if (!pieces) return [null, null];
  const minMs = opts.minMs ?? tuning().minUtteranceMs;
  const cut = cutOf(pieces);
  return pieces.map((p0) => {
    let p = p0;
    if (opts.guardMs) p = p.filter((f) => Math.abs(f.tMs - cut) > opts.guardMs);
    if (opts.trim && p.length) {
      const pk = Math.max(...p.map((f) => f.rms));
      let a = 0, z = p.length - 1;
      while (a < z && p[a].rms < opts.trim * pk) a++;
      while (z > a && p[z].rms < opts.trim * pk) z--;
      p = p.slice(a, z + 1);
    }
    if (p.length < 2 || dur(p) < minMs) return null;
    const t0 = p[0].tMs;
    const points = p.map((f) => ({ tMs: f.tMs - t0, chao: semitonesToChao(f.st - grid.mid, grid.up, grid.down) }));
    const r = classifyToneV2({ points, startedAtMs: 0, endedAtMs: points.at(-1).tMs });
    return r ? r.tone : null;
  });
}
const isQ = (t) => t === null || t === "none";

// ---- run --------------------------------------------------------------------------
const OPTS2 = { gapMs: 45, dipRatio: ARG("--dip") ? +process.argv[process.argv.indexOf("--dip") + 1] : tuning().syllableDipRatio, farW: ARG("--far") ? +process.argv[process.argv.indexOf("--far") + 1] : Infinity };
export function approaches(models, versions) {
  return {
    "0 today": (c) => ({ pieces: findSyllables(c.fr, 2), how: "today" }),
    "1 middle": (c) => ({ pieces: [c.fr.slice(0, c.fr.length >> 1), c.fr.slice(c.fr.length >> 1)], how: "middle" }),
    "2 spot": (c) => spotCut(c.fr, models[foldOf(c.id) ^ 1][`${c.set}|${keyOf(c.truth)}`], { ...OPTS2, fallback: "spot" }),
    "2q spot, else ?": (c) => spotCut(c.fr, models[foldOf(c.id) ^ 1][`${c.set}|${keyOf(c.truth)}`], { ...OPTS2, fallback: "q" }),
    "3 stretch": (c) => stretchCut(c.fr, versions(c), "linear"),
    "R oracle (ref cut)": (c) => ({ pieces: c.ref ? splitAt(c.fr, c.ref.cut) : null, how: "oracle" }),
    "3d dtw": (c) => stretchCut(c.fr, versions(c), "dtw"),
  };
}

/**
 * Clean-up before cutting: drop silence-separated pieces at the edges of the word
 * that are short (< shortMs) or quiet (loudest frame < quiet x the word's loudest).
 */
export function cleanEdges(fr, o = { gapMs: 45, shortMs: 100, quiet: 0.15 }) {
  let p = splitAtSilences(fr, o.gapMs);
  const peak = Math.max(...fr.map((f) => f.rms));
  // gap: silence between this edge piece and the rest of the word
  const junk = (q, gap) => Math.max(...q.map((f) => f.rms)) < o.quiet * peak || (dur(q) < o.shortMs && gap > tuning().mergeGapMs);
  while (p.length > 1 && junk(p[0], p[1][0].tMs - p[0].at(-1).tMs)) p = p.slice(1);
  while (p.length > 1 && junk(p.at(-1), p.at(-1)[0].tMs - p.at(-2).at(-1).tMs)) p = p.slice(0, -1);
  return p.flat();
}
export function score(clips, cutFn, grid, readOpts) {
  const rows = clips.map((c0) => {
    const c = readOpts?.clean ? { ...c0, fr: cleanEdges(c0.fr) } : c0;
    const r = cutFn(c);
    const read = readPieces(r.pieces, grid, readOpts);
    const cut = cutOf(r.pieces);
    const err = c.ref && cut !== null ? Math.abs(cut - c.ref.cut) : null;
    const wrong = read.some((t, i) => !isQ(t) && t !== c.truth[i]);
    return { c: c0, read, cut, err, how: r.how, both: read.every((t, i) => t === c.truth[i]), wrong, q: read.filter(isQ).length, badCutWrong: err !== null && err > 80 && wrong };
  });
  const n = rows.length, errs = rows.map((x) => x.err).filter((x) => x !== null);
  return {
    rows, n, nRef: errs.length,
    errMed: med(errs), errP90: pct(errs, 90),
    both: (100 * rows.filter((x) => x.both).length) / n,
    wrong: (100 * rows.filter((x) => x.wrong).length) / n,
    q: (100 * rows.reduce((a, x) => a + x.q, 0)) / (2 * n),
    badCutWrong: rows.filter((x) => x.badCutWrong).length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = janePairs();
  const models = [learnSpots(all.filter((c) => foldOf(c.id) === 0)), learnSpots(all.filter((c) => foldOf(c.id) === 1))];
  // Jane's "version" for her own clip: same style and tone pair, another word (the
  // other fold), closest in voiced length. Her same clip would be the answer itself.
  const versions = (c) => {
    const k = all.filter((o) => o.set === c.set && o.id !== c.id && foldOf(o.id) !== foldOf(c.id) && keyOf(o.truth) === keyOf(c.truth) && o.ref);
    return k.sort((a, b) => Math.abs(dur(a.fr) - dur(c.fr)) - Math.abs(dur(b.fr) - dur(c.fr)))[0] ?? null;
  };
  const A = approaches(models, versions);
  const readOpts = { ...(ARG("--trim") ? { trim: 0.06 } : {}), ...(ARG("--clean") ? { clean: true } : {}) };

  if (!ARG("--swap") && !ARG("--pierre")) {
    for (const style of ["textbook", "natural"]) {
      const k = all.filter((c) => c.set === style), byHow = {};
      for (const c of k) byHow[c.ref?.how ?? "none"] = (byHow[c.ref?.how ?? "none"] ?? 0) + 1;
      console.log(`reference ${style}: ${k.length} pairs; ${JSON.stringify(byHow)}`);
    }
    for (const g of Object.keys(JANE_GRIDS)) {
      const grid = JANE_GRIDS[g];
      setTuning({ playerRulerV2: grid.flag });
      console.log(`\n## grid: ${g}${readOpts.trim ? " (edge trim)" : ""}`);
      console.log("approach | style | pair | n | n ref | cut err med ms | p90 ms | both right % | wrong tone named % | '?' syllables % | wrong with cut > 80 ms off");
      for (const [name, fn] of Object.entries(A)) for (const style of ["textbook", "natural"]) {
        const keys = ARG("--summary") ? ["all"] : [...PAIR_KEYS, "all"];
        for (const key of keys) {
          const ks = all.filter((c) => c.set === style && (key === "all" || keyOf(c.truth) === key));
          if (!ks.length) continue;
          const s = score(ks, fn, grid, readOpts);
          if (ARG("--badcuts") && key === "all") for (const x of s.rows.filter((r) => r.badCutWrong)) console.log(`   bad cut: ${x.c.set} ${x.c.id} want ${x.c.truth.join("+")} read ${x.read.map((t) => t ?? "?").join("+")} (${x.how}; cut ${f0(x.cut)} ref ${f0(x.c.ref.cut)} ${x.c.ref.how})`);
          console.log([name, style, key, s.n, s.nRef, f0(s.errMed), f0(s.errP90), f1(s.both), f1(s.wrong), f1(s.q), s.badCutWrong].join(" | "));
        }
      }
    }
    setTuning({ playerRulerV2: false });
  }
}

// ---- step 3: label swap, step 4: Pierre ------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` && ARG("--swap")) {
  const all = janePairs();
  const models = [learnSpots(all.filter((c) => foldOf(c.id) === 0)), learnSpots(all.filter((c) => foldOf(c.id) === 1))];
  console.log("approach | grid | reads (clip x wrong label) | a name moved toward the wrong label % | any name changed %");
  for (const fb of ["spot", "q"]) for (const g of Object.keys(JANE_GRIDS)) {
    const grid = JANE_GRIDS[g];
    setTuning({ playerRulerV2: grid.flag });
    let n = 0, moved = 0, changed = 0;
    for (const c0 of all) {
      const c = { ...c0, fr: cleanEdges(c0.fr) };
      const M = models[foldOf(c.id) ^ 1];
      const own = readPieces(spotCut(c.fr, M[`${c.set}|${keyOf(c.truth)}`], { ...OPTS2, fallback: fb }).pieces, grid, { trim: 0.06 });
      for (const L of PAIR_KEYS) {
        if (L === keyOf(c.truth) || !M[`${c.set}|${L}`]) continue;
        const r = readPieces(spotCut(c.fr, M[`${c.set}|${L}`], { ...OPTS2, fallback: fb }).pieces, grid, { trim: 0.06 });
        n++;
        if (r.some((t, i) => t !== own[i])) changed++;
        if (r.some((t, i) => t !== own[i] && String(t) === L[i] && Number(L[i]) !== c.truth[i])) moved++;
      }
    }
    console.log([`2 ${fb}`, g, n, f1((100 * moved) / n), f1((100 * changed) / n)].join(" | "));
  }
  setTuning({ playerRulerV2: false });
}

if (import.meta.url === `file://${process.argv[1]}` && ARG("--pierre") && pierreReady()) {
  const jane = janePairs();
  const model = learnSpots(jane);
  const { cal, clips } = pierrePairs();
  const grids = {
    old: { mid: 0, up: cal.rangeSemitones, down: cal.rangeDownSemitones, flag: false }, // saved calibration, old board
    ruler: { mid: 0, up: RULER.upSemitones, down: RULER.downSemitones, flag: true }, // Jane's halves around his calibration centre
  };
  const PREAD = { ...(ARG("--trim") ? { trim: 0.06 } : {}), ...(ARG("--clean") ? { clean: true } : {}) };
  const janeOf = (c) => jane.find((j) => j.set === c.style && j.id === c.word) ?? null;
  const P = {
    "0 today": (c) => ({ pieces: findSyllables(c.fr, 2) }),
    "1 middle": (c) => ({ pieces: [c.fr.slice(0, c.fr.length >> 1), c.fr.slice(c.fr.length >> 1)] }),
    "2 spot": (c) => spotCut(c.fr, model[`${c.style}|${keyOf(c.truth)}`], { ...OPTS2, fallback: "spot" }),
    "2q spot, else ?": (c) => spotCut(c.fr, model[`${c.style}|${keyOf(c.truth)}`], { ...OPTS2, fallback: "q" }),
    "3 stretch": (c) => stretchCut(c.fr, janeOf(c), "linear"),
    "3d dtw": (c) => stretchCut(c.fr, janeOf(c), "dtw"),
  };
  console.log(`Pierre: ${clips.length} pair takes; reference cut found for ${clips.filter((c) => c.ref).length}`);
  for (const [g, grid] of Object.entries(grids)) {
    setTuning({ playerRulerV2: grid.flag });
    console.log(`\n## Pierre, grid ${g}`);
    console.log("approach | style | n | n ref | cut err med | p90 | both right % | wrong named % | '?' % | 1+2 syllable 1 read T4");
    for (const [name, fn] of Object.entries(P)) for (const style of ["textbook", "natural"]) {
      const ks = clips.filter((c) => c.style === style);
      if (!ks.length) continue;
      const s = score(ks, fn, grid, PREAD);
      const t4 = s.rows.filter((x) => keyOf(x.c.truth) === "12" && x.read[0] === 4).length;
      console.log([name, style, s.n, s.nRef, f0(s.errMed), f0(s.errP90), f1(s.both), f1(s.wrong), f1(s.q), t4].join(" | "));
      if (ARG("--detail") && name.startsWith(process.argv[process.argv.indexOf("--detail") + 1] ?? "2q")) for (const x of s.rows) console.log(`   ${x.c.id} want ${x.c.truth.join("+")} read ${x.read.map((t) => t ?? "?").join("+")} (${x.how}, cut ${x.cut === null ? "—" : f0(x.cut - x.c.fr[0].tMs)} ms in, ref ${x.c.ref ? f0(x.c.ref.cut - x.c.fr[0].tMs) : "—"})`);
    }
  }
  setTuning({ playerRulerV2: false });
}
