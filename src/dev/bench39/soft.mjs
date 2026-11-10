// What if the gate sits at its cap (40% of the CALIBRATED voice loudness) and
// the player then speaks more softly than in calibration?
// 6 dB softer = half as loud -> the gate is at 80% of the voice they use now.
//   node src/dev/bench39/soft.mjs
import { clipList, loadRef, refAt, track, groupOf, F0C } from "./tracks.mjs";
import { loadWav, pct, med, fmt } from "./lib.mjs";
const CREAK = F0C * 2 ** (-10 / 12);
const subset = clipList().filter((_, i) => i % 4 === 0);
console.log("gate % of the voice in use | means | group | voice heard % | clips with under half heard % | clips with nothing heard % | low end lost st med / p90");
for (const [frac, label] of [[0.4, "cap, same loudness as calibration"], [0.57, "cap, 3 dB softer"], [0.8, "cap, 6 dB softer"]]) {
  for (const g of ["T1", "T2", "T3", "T4", "pairs"]) {
    let refV = 0, hit = 0, half = 0, none = 0, n = 0; const lows = [];
    for (const c of subset.filter((c) => groupOf(c.tones) === g)) {
      const w = loadWav(c.file), r = loadRef(c.set, c.id);
      const base = track(w.samples, w.sampleRate, { minVoicedRun: 3, noiseFloor: 1e-4 });
      const v = med(base.rms.filter((_, i) => base.v[i]));
      const o = track(w.samples, w.sampleRate, { minVoicedRun: 3, noiseFloor: (v * frac) / 3 });
      let rv = 0, h = 0; const refSt = [], trSt = [];
      for (let i = 0; i < o.t.length; i++) {
        const a = refAt(r, o.t[i]);
        if (a.trusted && a.f0 >= CREAK) { rv++; refSt.push(12 * Math.log2(a.f0 / F0C)); if (o.v[i]) h++; }
        if (o.v[i]) trSt.push(12 * Math.log2(o.f0[i] / F0C));
      }
      n++; refV += rv; hit += h; if (h < rv / 2) half++; if (h === 0) none++;
      if (refSt.length > 3 && trSt.length > 3) lows.push(pct(trSt, 5) - pct(refSt, 5));
    }
    console.log([fmt(frac * 100, 0), label, g, fmt((100 * hit) / refV, 0), fmt((100 * half) / n, 0), fmt((100 * none) / n, 0), `${fmt(med(lows))} / ${fmt(pct(lows, 90))}`].join(" | "));
  }
}
