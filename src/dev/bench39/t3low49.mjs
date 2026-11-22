// Brief 49 Part 2: does the reader say "none" on a natural third tone that only
// goes low (no rise back)? Jane's natural single third tones, split by Praat's
// own shape: "low-only" = the last quarter rises less than 1.5 st above the low.
// Dev-only, offline, numbers only.
import { readFileSync } from "node:fs";
import { classifyToneV2 } from "../../game/toneClassifierV2.ts";
import { setTuning } from "../../game/tuning.ts";
import { semitonesToChao } from "../../pitch/math.ts";
import { clipList, cachedTrack, CACHE } from "./tracks.mjs";
import { JANE_GRIDS } from "./cut49data.mjs";
import { med } from "./lib.mjs";

export function praatShape(set, id) {
  const r = JSON.parse(readFileSync(`${CACHE}/ref-praat/${set}/${id}.json`, "utf8"));
  const f = r.f0.filter((x) => x > 0);
  if (f.length < 6) return null;
  const st = f.map((x) => 12 * Math.log2(x / med(f)));
  const lo = Math.min(...st), iLo = st.indexOf(lo), end = med(st.slice(Math.floor(st.length * 0.75)));
  return { lowOnly: end - lo < 1.5, rise: end - lo, lowAt: iLo / st.length };
}
export function readSingle(c, grid, style = "textbook") {
  const o = cachedTrack(c, "live"), pts = [];
  for (let i = 0; i < o.t.length; i++) if (o.v[i]) pts.push({ tMs: o.t[i] * 1000, chao: semitonesToChao(o.st[i] - grid.mid, grid.up, grid.down) });
  if (pts.length < 3) return null;
  const t0 = pts[0].tMs;
  return classifyToneV2({ points: pts.map((p) => ({ tMs: p.tMs - t0, chao: p.chao })), startedAtMs: 0, endedAtMs: pts.at(-1).tMs - t0 }, style);
}
const NAT = !process.argv.includes("--off"); // --off: read every clip as textbook (rule off)
if (import.meta.url === `file://${process.argv[1]}` && !process.argv.includes("--cut")) {
  for (const style of ["natural", "textbook"]) {
    const singles = clipList().filter((c) => c.set === style && c.tones.length === 1 && c.tones[0] >= 1);
    for (const [g, grid] of Object.entries(JANE_GRIDS)) {
      setTuning({ playerRulerV2: grid.flag });
      const tab = {};
      for (const c of singles) {
        const sh = praatShape(c.set, c.id); if (!sh) continue;
        const k = c.tones[0] === 3 ? (sh.lowOnly ? "T3 low-only" : "T3 dip-rise") : `T${c.tones[0]}`;
        const r = readSingle(c, grid, NAT ? style : "textbook");
        const t = r ? String(r.tone) : "null";
        (tab[k] ??= {})[t] = (tab[k][t] ?? 0) + 1;
      }
      console.log(style, g, JSON.stringify(tab));
    }
  }
  setTuning({ playerRulerV2: false });
}

// Stand-in for a low-only third tone: Jane's natural single third tones cut off
// shortly after their low point (no rise back). `--cut`.
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--cut")) {
  for (const [g, grid] of Object.entries(JANE_GRIDS)) {
    setTuning({ playerRulerV2: grid.flag });
    for (const keep of [0, 40, 80]) {
      const tab = {};
      for (const c of clipList().filter((c) => c.set === "natural" && c.tones.length === 1 && c.tones[0] === 3)) {
        const o = cachedTrack(c, "live"), pts = [];
        for (let i = 0; i < o.t.length; i++) if (o.v[i]) pts.push({ tMs: o.t[i] * 1000, chao: semitonesToChao(o.st[i] - grid.mid, grid.up, grid.down) });
        if (pts.length < 5) continue;
        const sm = pts.map((_, i) => med(pts.slice(Math.max(0, i - 1), i + 2).map((p) => p.chao)));
        const tLow = pts[sm.indexOf(Math.min(...sm))].tMs;
        const cut = pts.filter((p) => p.tMs <= tLow + keep);
        if (cut.length < 3) { tab.tooShort = (tab.tooShort ?? 0) + 1; continue; }
        const t0 = cut[0].tMs;
        const r = classifyToneV2({ points: cut.map((p) => ({ tMs: p.tMs - t0, chao: p.chao })), startedAtMs: 0, endedAtMs: cut.at(-1).tMs - t0 }, NAT ? "natural" : "textbook");
        const t = String(r?.tone ?? "null");
        tab[t] = (tab[t] ?? 0) + 1;
      }
      console.log(`natural T3 cut ${keep} ms after the low, grid ${g}: ${JSON.stringify(tab)}`);
    }
  }
  setTuning({ playerRulerV2: false });
}
