// Other voices — a STAND-IN only. We have one speaker. This plays Jane's clips
// slower or faster, which moves the pitch (and also the vowel colour and the
// speed, so it is NOT a real male or child voice). It tests one thing: does
// the listener's arithmetic (70–400 Hz band, 1024-sample window) hold when
// the same contour sits lower or higher?   node src/dev/bench39/voices.mjs
import { clipList, loadRef, refAt, track, F0C } from "./tracks.mjs";
import { loadWav, pct, med, fmt } from "./lib.mjs";

const subset = clipList().filter((_, i) => i % 4 === 0);
function resample(x, k) { // k < 1: slower and lower
  const n = Math.floor(x.length / k), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * k, j = Math.floor(p), f = p - j; out[i] = x[j] * (1 - f) + (x[Math.min(j + 1, x.length - 1)] || 0) * f; }
  return out;
}
console.log("pitch factor | centre Hz | like | ref frames under 70 Hz % | over 400 Hz % | voice heard % | heard, frames inside band only % | pitch err st med / p90 (delay removed) | gross >3 st % | octave errors % | low end lost st med / p90 | high end lost st med / p90");
for (const [k, like] of [[1, "Jane"], [0.75, "low female / high male"], [0.6, "typical male"], [0.5, "deep male"], [0.42, "very deep male"], [1.4, "high female / child"]]) {
  let refV = 0, hit = 0, inBand = 0, inBandHit = 0, under = 0, over = 0, oct = 0;
  const errs = [], lows = [], highs = [];
  for (const c of subset) {
    const w = loadWav(c.file), r = loadRef(c.set, c.id);
    const x = k === 1 ? w.samples : resample(w.samples, k);
    const o = track(x, w.sampleRate, { minVoicedRun: 3, noiseFloor: 1e-4, f0Center: F0C * k });
    const creak = F0C * 2 ** (-10 / 12);
    const refSt = [], trSt = [];
    for (let i = 0; i < o.t.length; i++) {
      const a = refAt(r, o.t[i] * k);
      if (a.trusted && a.f0 >= creak) {
        const f = a.f0 * k; refV++; refSt.push(12 * Math.log2(a.f0 / F0C));
        if (f < 70) under++; if (f > 400) over++;
        const ok = f >= 70 && f <= 400; if (ok) inBand++;
        if (o.v[i]) { hit++; if (ok) inBandHit++; }
      }
      if (o.v[i]) {
        const b = refAt(r, (o.t[i] - 0.04) * k);
        if (b.trusted && b.f0 >= creak) { const e = 12 * Math.log2(o.f0[i] / (b.f0 * k)); errs.push(Math.abs(e)); if (Math.abs(Math.abs(e) - 12) < 1.5) oct++; }
        trSt.push(12 * Math.log2(o.f0[i] / (F0C * k)));
      }
    }
    if (refSt.length > 3 && trSt.length > 3) { lows.push(pct(trSt, 5) - pct(refSt, 5)); highs.push(pct(refSt, 95) - pct(trSt, 95)); }
  }
  console.log([k, fmt(F0C * k, 0), like, fmt((100 * under) / refV, 1), fmt((100 * over) / refV, 1), fmt((100 * hit) / refV, 1), fmt((100 * inBandHit) / inBand, 1), `${fmt(med(errs))} / ${fmt(pct(errs, 90))}`,
    fmt((100 * errs.filter((e) => e > 3).length) / errs.length, 1), fmt((100 * oct) / errs.length, 1), `${fmt(med(lows))} / ${fmt(pct(lows, 90))}`, `${fmt(med(highs))} / ${fmt(pct(highs, 90))}`].join(" | "));
}
