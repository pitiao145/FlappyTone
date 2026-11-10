// Splits the listener's pitch error into: delay, creak, and what is left.
//   node src/dev/bench39/detail.mjs
import { clipList, cachedTrack, loadRef, refAt, groupOf, F0C } from "./tracks.mjs";
import { pct, med, mean, fmt } from "./lib.mjs";
// For Jane (centre 181 Hz) a reference pitch more than 10 st under her centre
// (< 102 Hz) is creak ("vocal fry": the voice box rattles in slow, irregular
// pulses; there is no single true pitch there).
const CREAK_HZ = F0C * 2 ** (-10 / 12);
const groups = ["T1", "T2", "T3", "T4", "pairs", "3+syll"];
for (const name of ["pipe", "live"]) {
  console.log(`\n### ${name}: error with the delay removed, and creak`);
  console.log("set | group | clips | err now st (med/p90) | err after removing 40 ms delay (med/p90) | gross>3st after delay% | creak frames % of ref | creak: tracker silent % | creak: tracker says octave-up % | creak: other % | low end lost st excl. creak (med/p90)");
  const clips = clipList();
  for (const set of ["textbook", "natural"]) for (const g of groups) {
    const cs = clips.filter((c) => c.set === set && groupOf(c.tones) === g);
    if (!cs.length) continue;
    const now = [], lagged = [], lows = [];
    let creak = 0, refN = 0, cSilent = 0, cOct = 0, cOther = 0;
    for (const c of cs) {
      const r = loadRef(c.set, c.id), o = cachedTrack(c, name);
      const refSt = [], trSt = [];
      for (let i = 0; i < o.t.length; i++) {
        const a = refAt(r, o.t[i]);
        if (a.trusted) {
          refN++;
          const isCreak = a.f0 < CREAK_HZ;
          if (isCreak) {
            creak++;
            if (!o.v[i]) cSilent++;
            else { const e = 12 * Math.log2(o.f0[i] / a.f0); if (Math.abs(e - 12) < 2 || Math.abs(e - 19) < 2 || Math.abs(e - 24) < 2) cOct++; else cOther++; }
          } else {
            refSt.push(12 * Math.log2(a.f0 / F0C));
            if (o.v[i]) now.push(Math.abs(12 * Math.log2(o.f0[i] / a.f0)));
          }
        }
        if (o.v[i]) {
          const b = refAt(r, o.t[i] - 0.04);
          if (b.trusted && b.f0 >= CREAK_HZ) lagged.push(Math.abs(12 * Math.log2(o.f0[i] / b.f0)));
          if (o.f0[i] >= CREAK_HZ) trSt.push(12 * Math.log2(o.f0[i] / F0C));
        }
      }
      if (refSt.length > 3 && trSt.length > 3) lows.push(pct(trSt, 5) - pct(refSt, 5));
    }
    console.log([set, g, cs.length, `${fmt(med(now))}/${fmt(pct(now, 90))}`, `${fmt(med(lagged))}/${fmt(pct(lagged, 90))}`, fmt((100 * lagged.filter((e) => e > 3).length) / lagged.length, 1),
      fmt((100 * creak) / refN, 1), fmt((100 * cSilent) / Math.max(1, creak), 0), fmt((100 * cOct) / Math.max(1, creak), 0), fmt((100 * cOther) / Math.max(1, creak), 0), `${fmt(med(lows))}/${fmt(pct(lows, 90))}`].join(" | "));
  }
}
