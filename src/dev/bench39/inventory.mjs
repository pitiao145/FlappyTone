// What is each fixture folder really? node src/dev/bench39/inventory.mjs
import { listWavs, loadWav, frameRms, pct, med, db, fmt } from "./lib.mjs";
const dirs = [
  "fixtures/captures", "fixtures/anchors", "fixtures/tonepairs/wav",
  "fixtures/clips/jane", "fixtures/clips/jane/natural", "fixtures/clips/verify",
  "fixtures/recordings/2026-08-06-j9143v", "fixtures/recordings/2026-08-07-xujzgs",
  "fixtures/recordings/jane/2026-09-19-1m1ozb", "fixtures/recordings/jane/2026-09-20-jus5s9",
  "fixtures/recordings/jane/2026-09-28-kh04zm", "fixtures/recordings/jane/2026-10-20-y0vfxz",
  "fixtures/recordings/jane/textbook/2026-09-28-kh04zm", "fixtures/recordings/jane/natural/2026-09-28-kh04zm",
];
console.log("folder | n | sampleRates | dur s med (min..max) | peak med | quiet p10 dB | loud p90 dB | SNR-ish dB med | clipped files");
for (const d of dirs) {
  const files = listWavs(d);
  const srs = {}; const durs = []; const peaks = []; const q = []; const l = []; const snr = []; let clipped = 0; let bad = 0;
  for (const f of files) {
    let w; try { w = loadWav(f); } catch { bad++; continue; }
    srs[w.sampleRate] = (srs[w.sampleRate] || 0) + 1;
    durs.push(w.samples.length / w.sampleRate);
    let pk = 0; for (const v of w.samples) { const a = Math.abs(v); if (a > pk) pk = a; }
    peaks.push(pk); if (pk >= 0.999) clipped++;
    const fr = frameRms(w.samples);
    if (fr.length < 4) continue;
    const lo = pct(fr, 10), hi = pct(fr, 90);
    q.push(db(lo)); l.push(db(hi)); snr.push(db(hi) - db(lo));
  }
  console.log([d.replace("fixtures/", ""), files.length, JSON.stringify(srs), `${fmt(med(durs))} (${fmt(Math.min(...durs))}..${fmt(Math.max(...durs))})`,
    fmt(med(peaks)), fmt(med(q), 1), fmt(med(l), 1), fmt(med(snr), 1), clipped, bad ? `unreadable ${bad}` : ""].join(" | "));
}
