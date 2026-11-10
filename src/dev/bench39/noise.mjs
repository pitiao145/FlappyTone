// Rooms: mix noise into Jane's clean clips at set levels, run the REAL tracker
// with the room-noise gate the app would set, and compare with the clean
// reference.   node src/dev/bench39/noise.mjs
//
// Noise sources (say what each one is):
//  wind  REAL. The wind before/after the voice in fixtures/captures/jane_ma1..4
//        (iPhone, outdoors). About 8 s in total, looped.
//  pink  SYNTHETIC stand-in for a steady fan / air-con hiss. Not a recording.
//  talk  REAL speech: other Jane clips, back to back. Stand-in for a TV or a
//        person talking in the room (the hard case: the noise is also a voice).
// "SNR" = how much louder the voice is than the noise, in dB.
//  30 dB = quiet room, 20 dB = normal room, 10 dB = loud room, 5 dB = very loud.
import { clipList, loadRef, refAt, track, groupOf, F0C } from "./tracks.mjs";
import { loadWav, rms, pct, med, mean, fmt, WIN, HOP } from "./lib.mjs";

const SR = 48000, LEAD_S = 0.8;
const CREAK_HZ = F0C * 2 ** (-10 / 12);
const clipsAll = clipList();
const subset = clipsAll.filter((_, i) => i % 4 === 0);

function windNoise() {
  const parts = [];
  for (const n of ["ma1", "ma2", "ma3", "ma4"]) {
    const w = loadWav(`fixtures/captures/jane_${n}.wav`), r = loadRef("captures", `jane_${n}`);
    const first = r.t[r.f0.findIndex((x) => x > 0)], last = r.t[r.f0.length - 1 - [...r.f0].reverse().findIndex((x) => x > 0)];
    parts.push(w.samples.subarray(0, Math.floor((first - 0.15) * SR)), w.samples.subarray(Math.floor((last + 0.2) * SR)));
  }
  const total = parts.reduce((a, p) => a + p.length, 0), out = new Float32Array(total);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function pinkNoise(n) {
  const out = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0; let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  for (let i = 0; i < n; i++) { const w = rnd(); b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; out[i] = b0 + b1 + b2 + w * 0.1848; }
  return out;
}
function talkNoise() {
  const picks = clipsAll.filter((c, i) => c.set === "natural" && c.tones.length === 2 && i % 4 === 2).slice(0, 12);
  const parts = picks.map((c) => loadWav(c.file)).filter((w) => w.sampleRate === SR).map((w) => w.samples);
  const total = parts.reduce((a, p) => a + p.length, 0), out = new Float32Array(total);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const NOISES = { wind: windNoise(), pink: pinkNoise(SR * 10), talk: talkNoise() };
// loudness of a noise = RMS over its loud half (so silences between words in "talk" do not count)
const noiseLevel = (x) => { const fr = []; for (let s = 0; s + WIN <= x.length; s += HOP) fr.push(rms(x, s, s + WIN)); return Math.sqrt(mean(fr.filter((v) => v >= med(fr)).map((v) => v * v))); };
const LEVEL = Object.fromEntries(Object.entries(NOISES).map(([k, x]) => [k, noiseLevel(x)]));

// READ IN CODE: sessionNoise.ts + noiseMeter.ts + tuning.ts
function appFloor(mixed, voiceRms) {
  const fr = [];
  let ms = 0;
  for (let s = 0; s + WIN <= mixed.length; s += HOP) { ms += (HOP / SR) * 1000; if (ms <= 200) continue; fr.push(rms(mixed, s, s + WIN)); if (ms >= 600) break; }
  const cap = Math.max(1e-4, (voiceRms * 0.4) / 3);
  return Math.min(cap, Math.max(1e-4, med(fr)));
}
const results = {};
let offset = 0;
for (const c of subset) {
  const w = loadWav(c.file);
  if (w.sampleRate !== SR) continue;
  const r = loadRef(c.set, c.id);
  const clean = track(w.samples, SR, { minVoicedRunMs: 64, noiseFloor: 1e-4 });
  const voiceRms = med(clean.rms.filter((_, i) => clean.v[i]));
  const lead = Math.round(LEAD_S * SR);
  for (const [nz, src] of Object.entries(NOISES)) for (const snr of [30, 20, 10, 5]) {
    const g = (voiceRms / 10 ** (snr / 20)) / LEVEL[nz];
    const mixed = new Float32Array(lead + w.samples.length);
    offset = (offset + 7919) % src.length;
    for (let i = 0; i < mixed.length; i++) mixed[i] = g * src[(offset + i) % src.length] + (i >= lead ? w.samples[i - lead] : 0);
    const floor = appFloor(mixed, voiceRms);
    for (const [cfgName, cfg] of Object.entries({ app: { minVoicedRunMs: 64, noiseFloor: floor }, nogate: { minVoicedRunMs: 64, noiseFloor: 1e-4 } })) {
      const o = track(mixed, SR, cfg);
      const key = `${nz}|${snr}|${cfgName}`;
      const R = (results[key] ??= { refV: 0, hit: 0, endV: 0, endHit: 0, leadN: 0, leadV: 0, errs: [], low: [], high: [], gate: [], n: 0, t4end: [0, 0] });
      R.n++; R.gate.push((floor * 3) / voiceRms);
      const tv = r.t.filter((_, i) => r.trusted[i]); const t0 = tv[0], t1 = tv.at(-1);
      const refSt = [], trSt = [];
      for (let i = 0; i < o.t.length; i++) {
        const t = o.t[i] - LEAD_S;
        if (t < -0.05) { R.leadN++; if (o.v[i]) R.leadV++; continue; }
        const a = refAt(r, t);
        if (a.trusted && a.f0 >= CREAK_HZ) {
          R.refV++; refSt.push(12 * Math.log2(a.f0 / F0C));
          const isEnd = t > t0 + (2 * (t1 - t0)) / 3;
          if (isEnd) R.endV++;
          if (c.tones.length === 1 && c.tones[0] === 4 && isEnd) R.t4end[0]++;
          if (o.v[i]) { R.hit++; if (isEnd) R.endHit++; if (c.tones.length === 1 && c.tones[0] === 4 && isEnd) R.t4end[1]++; }
        }
        if (o.v[i]) {
          const b = refAt(r, t - 0.04);
          if (b.trusted && b.f0 >= CREAK_HZ) R.errs.push(Math.abs(12 * Math.log2(o.f0[i] / b.f0)));
          trSt.push(12 * Math.log2(o.f0[i] / F0C));
        }
      }
      if (refSt.length > 3) { R.low.push(trSt.length > 3 ? pct(trSt, 5) - pct(refSt, 5) : 99); R.high.push(trSt.length > 3 ? pct(refSt, 95) - pct(trSt, 95) : 99); }
    }
  }
}
console.log(`clips: ${Object.values(results)[0].n} (every 4th clip, both styles). Lead-in of ${LEAD_S}s noise-only before each clip.`);
console.log("noise | SNR dB | gate | gate as % of voice (med) | voice heard % | end third heard % | T4 end third heard % | noise-only frames drawn as voice % | pitch err st med / p90 | gross >3 st % | low end lost st med / p90 | high end lost st med / p90");
for (const nz of ["wind", "pink", "talk"]) for (const snr of [30, 20, 10, 5]) for (const cfg of ["app", "nogate"]) {
  const R = results[`${nz}|${snr}|${cfg}`];
  const lows = R.low.map((v) => (v === 99 ? Infinity : v)), highs = R.high.map((v) => (v === 99 ? Infinity : v));
  console.log([nz, snr, cfg === "app" ? "app rule" : "none", fmt(100 * med(R.gate), 0), fmt((100 * R.hit) / R.refV, 1), fmt((100 * R.endHit) / R.endV, 0), fmt((100 * R.t4end[1]) / Math.max(1, R.t4end[0]), 0), fmt((100 * R.leadV) / R.leadN, 1),
    `${fmt(med(R.errs))} / ${fmt(pct(R.errs, 90))}`, fmt((100 * R.errs.filter((e) => e > 3).length) / R.errs.length, 1), `${fmt(med(lows))} / ${fmt(pct(lows, 90))}`, `${fmt(med(highs))} / ${fmt(pct(highs, 90))}`].join(" | "));
}
