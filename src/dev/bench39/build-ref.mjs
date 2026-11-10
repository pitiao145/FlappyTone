// Runs the independent reference over every local clip and caches the result
// (JSON, no audio) under node_modules/.cache/bench39/ref/. node src/dev/bench39/build-ref.mjs
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { listWavs, loadWav } from "./lib.mjs";
import { referenceTrack } from "./ref.mjs";
export const SETS = {
  textbook: "fixtures/clips/jane",
  natural: "fixtures/clips/jane/natural",
  captures: "fixtures/captures",
  tonepairs: "fixtures/tonepairs/wav",
};
const force = process.argv.includes("--force");
for (const [set, dir] of Object.entries(SETS)) {
  const out = `node_modules/.cache/bench39/ref/${set}`;
  mkdirSync(out, { recursive: true });
  let n = 0;
  const t0 = Date.now();
  for (const f of listWavs(dir)) {
    const o = `${out}/${basename(f, ".wav")}.json`;
    if (existsSync(o) && !force) continue;
    const w = loadWav(f);
    const r = referenceTrack(w.samples, w.sampleRate);
    const q = (a, d) => a.map((v) => Number(v.toFixed(d)));
    writeFileSync(o, JSON.stringify({ sr: w.sampleRate, durS: w.samples.length / w.sampleRate, t: q(r.t, 3), f0: q(r.f0, 2), peak: q(r.peak, 3), shs: q(r.shs, 2), trusted: r.trusted.map((b) => (b ? 1 : 0)), rms: q(r.rms, 6) }));
    n++;
  }
  console.log(set, "built", n, "in", ((Date.now() - t0) / 1000).toFixed(1), "s");
}
