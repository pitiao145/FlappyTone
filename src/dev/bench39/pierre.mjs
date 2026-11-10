// Brief 41 — Pierre's voice (male learner). Its own block: never part of Jane's
// baseline, never PASS/FAIL. Reads fixtures/captures/pierre/ (gitignored, local
// only) and the Praat cache made by `praat-ref.py pierre` (floor 40 Hz).
//   node src/dev/bench39/pierre.mjs        # full block
// scorecard.mjs prints the same block after Jane's numbers when the files exist.
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { readContourSyllables } from "../../game/freeAttempts.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { CACHE, refAt, cachedRun } from "./tracks.mjs";
import { listWavs, pct, med, fmt } from "./lib.mjs";

const DIR = "fixtures/captures/pierre";
const JANE_UP = 8.8, JANE_DOWN = 7.9; // Jane's one-ruler halves (handover, 2nd/98th pct)

export const pierreReady = () => existsSync(`${DIR}/calibration.json`) && existsSync(`${CACHE}/ref-praat/pierre`);

/** Parses pierre_<pinyin><tones>_<take>. Tones "10" = 媽媽 (second syllable neutral). */
function parse(id) {
  const m = id.match(/^pierre_([a-z]+?)(\d+)_(\d+)$/);
  if (!m) return { id, kind: id.includes("talk") ? "talk" : id.includes("silence") ? "silence" : "other" };
  const tones = m[2].split("").map(Number);
  return { id, word: m[1] + m[2], take: +m[3], tones, kind: tones.length === 1 ? "single" : "pair" };
}

export function pierreBlock() {
  const cal = JSON.parse(readFileSync(`${DIR}/calibration.json`, "utf8"));
  const clips = listWavs(DIR).map((file) => ({ set: "pierre", file, ...parse(basename(file, ".wav")) }));
  const R = (c) => JSON.parse(readFileSync(`${CACHE}/ref-praat/pierre/${c.id}.json`, "utf8"));
  const LIVE = { minVoicedRunMs: 64, noiseFloor: 1e-4, f0Center: cal.f0Center }; // same live settings as Jane's bench
  const T = (c) => cachedRun(c, "live-pierre", LIVE);
  const voicedF0 = (cs) => cs.flatMap((c) => { const r = R(c); return r.f0.filter((f, i) => r.trusted[i] && f > 0); });
  const L = [];
  const out = (s = "") => L.push(s);

  const talk = clips.filter((c) => c.kind === "talk"), singles = clips.filter((c) => c.kind === "single"), pairs = clips.filter((c) => c.kind === "pair");
  const toneClips = [...singles, ...pairs];
  const talkMed = med(voicedF0(talk));
  const CREAK = talkMed * 2 ** (-10 / 12); // same rule as Jane: 10 st under the speaker's middle
  const st = (f, c = talkMed) => 12 * Math.log2(f / c);
  const okRef = (a) => a.trusted && a.f0 >= CREAK;

  out(`pierre (brief 41) — own block, not in Jane's baseline | ${singles.length} single, ${pairs.length} pair, ${talk.length} talk clips | phone AAC 16 kHz → WAV 48 kHz`);
  // ---- step 2: his voice -----------------------------------------------------
  const toneF0 = voicedF0(toneClips);
  out(`median pitch: talk ${fmt(talkMed, 1)} Hz | tone syllables ${fmt(med(toneF0), 1)} Hz | calibration centre ${fmt(cal.f0Center, 1)} Hz`);
  for (const [name, cs] of [["talk", talk], ["singles", singles], ["pairs", pairs]]) {
    const f = voicedF0(cs);
    out(`Praat frames under 70 Hz / 55 Hz, ${name}: ${fmt((100 * f.filter((x) => x < 70).length) / f.length, 1)}% / ${fmt((100 * f.filter((x) => x < 55).length) / f.length, 1)}% (n ${f.length})`);
  }
  out("per tone, singles, creak out, st from talk median: lowest (5th pct) | highest (95th pct)");
  for (const t of [1, 2, 3, 4]) {
    const s = voicedF0(singles.filter((c) => c.tones[0] === t)).filter((f) => f >= CREAK).map((f) => st(f));
    out(`  T${t}: ${fmt(pct(s, 5), 1)} | ${fmt(pct(s, 95), 1)}`);
  }
  // heard, error, delay, creak — same definitions as scorecard.mjs
  const SHIFTS = Array.from({ length: 11 }, (_, i) => i * 0.01);
  for (const [g, cs] of [["T1", 1], ["T2", 2], ["T3", 3], ["T4", 4], ["pairs", 0]].map(([g, t]) => [g, t ? singles.filter((c) => c.tones[0] === t) : pairs])) {
    let n = 0, h = 0; const byShift = SHIFTS.map(() => []);
    for (const c of cs) {
      const r = R(c), o = T(c);
      for (let j = 0; j < o.t.length; j++) { const a = refAt(r, o.t[j]); if (okRef(a)) { n++; h += o.v[j]; } }
      SHIFTS.forEach((s, k) => { for (let i = 0; i < o.t.length; i++) if (o.v[i]) { const a = refAt(r, o.t[i] - s); if (okRef(a)) byShift[k].push(Math.abs(st(o.f0[i], a.f0))); } });
    }
    const meds = byShift.map(med), b = meds.indexOf(Math.min(...meds));
    out(`${g}: voice heard ${fmt((100 * h) / n, 1)}% | error delay removed med ${fmt(meds[b])} / p90 ${fmt(pct(byShift[b], 90))} st | delay ${SHIFTS[b] * 1000} ms`);
  }
  {
    let all = 0, creak = 0, cv = 0; const ce = [];
    for (const c of [...toneClips, ...talk]) {
      const r = R(c), o = T(c);
      for (let i = 0; i < r.t.length; i++) if (r.trusted[i]) { all++; if (r.f0[i] < CREAK) creak++; }
      for (let j = 0; j < o.t.length; j++) { const a = refAt(r, o.t[j]); if (a.trusted && a.f0 < CREAK) { cv += o.v[j]; if (o.v[j]) ce.push(st(o.f0[j], a.f0)); } }
    }
    const nC = ce.length, nCreakTr = [...toneClips, ...talk].reduce((s, c) => { const r = R(c), o = T(c); let k = 0; for (let j = 0; j < o.t.length; j++) { const a = refAt(r, o.t[j]); if (a.trusted && a.f0 < CREAK) k++; } return s + k; }, 0);
    out(`creak (Praat < ${fmt(CREAK, 0)} Hz): ${fmt((100 * creak) / all, 1)}% of voiced frames | tracker draws ${fmt((100 * cv) / Math.max(1, nCreakTr), 0)}% of them; drawn pitch vs Praat there: med ${fmt(med(ce), 1)} st, ${fmt((100 * ce.filter((e) => e > 6).length) / Math.max(1, nC), 0)}% over +6 st (drawn higher)`);
  }

  // ---- step 3: real range vs three grids ---------------------------------------
  const realSt = toneF0.filter((f) => f >= CREAK);
  const realTop = pct(realSt, 95), realBot = pct(realSt, 5);
  const toneMed = med(toneF0);
  const grids = [
    ["(a) saved calibration", cal.f0Center, cal.rangeSemitones, cal.rangeDownSemitones],
    ["(b) Jane halves around talk median", talkMed, JANE_UP, JANE_DOWN],
    ["(c) Jane halves around tone-syllable median", toneMed, JANE_UP, JANE_DOWN],
  ];
  out(`real range (tone syllables, creak out, 5th–95th pct): ${fmt(realBot, 1)}–${fmt(realTop, 1)} Hz`);
  out("grid | centre Hz | bottom–top Hz | gap at top st | gap at bottom st   (gap > 0: voice goes past the grid; < 0: grid is bigger than needed)");
  for (const [n, c, up, dn] of grids) {
    const top = c * 2 ** (up / 12), bot = c * 2 ** (-dn / 12);
    out(`${n} | ${fmt(c, 1)} | ${fmt(bot, 1)}–${fmt(top, 1)} | ${fmt(st(realTop, top), 2)} | ${fmt(st(bot, realBot), 2)}`);
  }

  // ---- step 4: reader on each grid, plus Praat shape check -----------------------
  const contour = (c, centre, up, dn) => {
    const o = T(c), pts = [];
    for (let i = 0; i < o.t.length; i++) if (o.v[i]) pts.push({ tMs: o.t[i] * 1000, chao: semitonesToChao(st(o.f0[i], centre), up, dn) });
    if (pts.length < 3) return null;
    const t0 = pts[0].tMs;
    return { points: pts.map((p) => ({ tMs: p.tMs - t0, chao: p.chao })), startedAtMs: 0, endedAtMs: pts.at(-1).tMs - t0 };
  };
  // Praat shape check: rough rules on Praat's own contour (creak out), st from talk median.
  const shapeOf = (f) => {
    if (f.length < 5) return "?";
    const s = f.map((x) => st(x)), n = s.length, a = med(s.slice(0, Math.max(1, Math.floor(n / 4)))), z = med(s.slice(Math.floor((3 * n) / 4)));
    const lo = Math.min(...s), iLo = s.indexOf(lo), spread = pct(s, 90) - pct(s, 10);
    if (spread < 2) return 1;
    if (a - z > 3 && s.indexOf(Math.max(...s)) < n / 2) return 4;
    if (z - a > 2 && a - lo < 2) return 2;
    if (iLo > n * 0.2 && iLo < n * 0.85 && a - lo >= 2) return 3; // dips, then may rise
    return z > a ? 2 : 4;
  };
  const praatF = (c) => { const r = R(c); return r.f0.filter((f, i) => r.trusted[i] && f >= CREAK); };
  const praatHalves = (c) => { const r = R(c); const idx = []; for (let i = 0; i < r.t.length; i++) if (r.trusted[i] && r.f0[i] >= CREAK) idx.push(i);
    if (idx.length < 6) return [[], []];
    let cut = -1, gap = 2; for (let k = 1; k < idx.length; k++) if (idx[k] - idx[k - 1] > gap) { gap = idx[k] - idx[k - 1]; cut = k; }
    if (cut < 0) cut = Math.floor(idx.length / 2);
    return [idx.slice(0, cut).map((i) => r.f0[i]), idx.slice(cut).map((i) => r.f0[i])]; };
  const expected = (tones) => (tones[0] === 3 && tones[1] === 3 ? [2, 3] : tones); // 你好: third-tone sandhi, said 2+3
  const offShape = [];
  for (const c of singles) { const s = shapeOf(praatF(c)); if (s !== c.tones[0]) offShape.push(`${c.id} (Praat looks like T${s})`); }
  for (const c of pairs) { const e = expected(c.tones), h = praatHalves(c); h.forEach((f, k) => { if (e[k] === 0) return; const s = shapeOf(f); if (s !== e[k]) offShape.push(`${c.id} syllable ${k + 1} (want T${e[k]}, Praat looks like T${s})`); }); }
  const offIds = new Set(offShape.map((s) => s.split(" ")[0]));
  out("reader (classifier v2 / pair read) on the live contour; 'clean' = clips whose Praat shape matches the intended tone");
  out("grid | singles right | singles right, clean | pairs split in two | pairs both right | pairs both right, clean");
  const wrong = {};
  for (const [n, c, up, dn] of grids) {
    let sr = 0, sc = 0, scn = 0, two = 0, both = 0, bc = 0, bcn = 0; wrong[n] = [];
    for (const k of singles) { const ct = contour(k, c, up, dn); const res = ct && classifyToneV2(ct); const ok = !!res && res.tone === k.tones[0]; sr += ok; if (!offIds.has(k.id)) { scn++; sc += ok; } if (!ok) wrong[n].push(`${k.id}→${res ? "T" + res.tone : "none"}`); }
    for (const k of pairs) { const ct = contour(k, c, up, dn); const syl = ct && readContourSyllables(ct); const e = expected(k.tones);
      // 媽媽 (1+neutral): the short neutral syllable may not split off; only the first tone counts.
      const ok = e.includes(0) ? !!syl?.[0] && syl[0].tone === e[0] : !!syl && syl.length === 2 && syl.every((s, i) => s && s.tone === e[i]);
      if (syl && syl.length === 2) two++; both += ok; if (!offIds.has(k.id)) { bcn++; bc += ok; } if (!ok) wrong[n].push(`${k.id}→${syl ? syl.map((s) => (s ? "T" + s.tone : "?")).join("+") : "none"}`); }
    out(`${n} | ${sr}/${singles.length} | ${sc}/${scn} | ${two}/${pairs.length} | ${both}/${pairs.length} | ${bc}/${bcn}`);
  }
  for (const [n, w] of Object.entries(wrong)) out(`  wrong on ${n}: ${w.join(", ") || "none"}`);
  out(`Praat shape not the intended tone (${offShape.length}): ${offShape.join("; ") || "none"}`);
  out("notes: 你好 is read as T2+T3 (sandhi); 媽媽 second syllable is neutral and not scored.");
  return L;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("pierre.mjs")) {
  if (!pierreReady()) { console.error("Pierre's files or Praat cache missing. Run praat-ref.py pierre."); process.exit(2); }
  console.log(pierreBlock().join("\n"));
}
