// How often does a raised gate remove the low end of a fall or a dip?
// Per clip, single T4 and T3. Gate as a share of the clip's own voice loudness.
//   node src/dev/bench39/gate-t4.mjs
import { clipList, loadRef, refAt, track, F0C } from "./tracks.mjs";
import { loadWav, pct, med, fmt } from "./lib.mjs";
const CREAK = F0C * 2 ** (-10 / 12);
console.log("tone | set | clips | gate % of voice | low end lost st: median | p90 | clips losing > 2 st % | clips losing > 4 st % | fall/dip depth kept % (median) | rescue active on % of voiced frames");
for (const tone of [4, 3, 2]) for (const set of ["textbook", "natural"]) {
  const cs = clipList().filter((c) => c.set === set && c.tones.length === 1 && c.tones[0] === tone);
  const data = cs.map((c) => { const w = loadWav(c.file), r = loadRef(c.set, c.id); const base = track(w.samples, w.sampleRate, { minVoicedRunMs: 64, noiseFloor: 1e-4 }); return { w, r, v: med(base.rms.filter((_, i) => base.v[i])) }; });
  for (const frac of [0.02, 0.1, 0.2, 0.3, 0.4]) {
    const lost = [], kept = []; let resc = 0, vo = 0;
    for (const d of data) {
      const floor = (d.v * frac) / 3;
      const o = track(d.w.samples, d.w.sampleRate, { minVoicedRunMs: 64, noiseFloor: floor });
      const refSt = [], trSt = [];
      for (let i = 0; i < o.t.length; i++) {
        const a = refAt(d.r, o.t[i]);
        if (a.trusted && a.f0 >= CREAK) refSt.push(12 * Math.log2(a.f0 / F0C));
        if (o.v[i]) { trSt.push(12 * Math.log2(o.f0[i] / F0C)); vo++; if (o.cl[i] < 0.7) resc++; }
      }
      if (refSt.length < 4) continue;
      const refLo = pct(refSt, 5), refHi = pct(refSt, 95);
      const l = trSt.length > 2 ? pct(trSt, 5) - refLo : refHi - refLo;
      lost.push(l); kept.push(Math.max(0, 1 - l / (refHi - refLo)));
    }
    console.log([`T${tone}`, set, lost.length, fmt(frac * 100, 0), fmt(med(lost)), fmt(pct(lost, 90)), fmt((100 * lost.filter((x) => x > 2).length) / lost.length, 0), fmt((100 * lost.filter((x) => x > 4).length) / lost.length, 0), fmt(100 * med(kept), 0), fmt((100 * resc) / vo, 1)].join(" | "));
  }
}
