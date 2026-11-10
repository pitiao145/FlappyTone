// Sanity check of the reference on signals with a KNOWN pitch (synthetic glides).
// Synthetic audio proves the reference's arithmetic only, nothing about voices.
import { referenceTrack } from "./ref.mjs";
const sr = 48000;
function synth(f0fn, dur, harm = 8, noise = 0) {
  const n = Math.round(dur * sr), x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = f0fn(i / sr); ph += (2 * Math.PI * f) / sr;
    let v = 0; for (let h = 1; h <= harm; h++) v += Math.sin(h * ph) / h;
    x[i] = 0.2 * v + noise * (Math.random() * 2 - 1);
  }
  return x;
}
const cases = {
  "flat 200": (t) => 200,
  "flat 80": (t) => 80,
  "flat 450": (t) => 450,
  "fall 380->130 in 0.2s": (t) => 380 * (130 / 380) ** Math.min(1, t / 0.2),
  "rise 150->260 in 0.3s": (t) => 150 * (260 / 150) ** Math.min(1, t / 0.3),
  "fall 150->60 in 0.3s": (t) => 150 * (60 / 150) ** Math.min(1, t / 0.3),
};
for (const [name, fn] of Object.entries(cases)) {
  for (const nz of [0, 0.05]) {
    const r = referenceTrack(synth(fn, 0.5, 8, nz), sr);
    const errs = [];
    let v = 0, tr = 0;
    r.t.forEach((t, i) => { if (t < 0.03 || t > 0.47) return; if (r.f0[i] > 0) { v++; if (r.trusted[i]) tr++; errs.push(Math.abs(12 * Math.log2(r.f0[i] / fn(t)))); } });
    errs.sort((a, b) => a - b);
    console.log(name.padEnd(24), "noise", nz, "voiced", v, "trusted", tr, "err st median", (errs[errs.length >> 1] ?? NaN).toFixed(3), "p95", (errs[Math.floor(errs.length * 0.95)] ?? NaN).toFixed(3), "max", (errs.at(-1) ?? NaN).toFixed(2));
  }
}
