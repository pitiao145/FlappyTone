// Brief 37 throwaway. Known gap: the natural-style accuracy and corridor rows print 0,
// because wordInStyle() found no natural take for these fallback rows (the fallback
// bundle is textbook-only). Only the natural read/split rows are meaningful.
import fs from "node:fs";
import { readContourSyllables } from "../../../../src/game/freeAttempts.ts";
import { classifyToneV2 } from "../../../../src/game/toneClassifierV2.ts";
import { toneAccuracyDetail, referenceFromWord } from "../../../../src/game/toneAccuracy.ts";
import { wordsFromCatalog, wordInStyle } from "../../../../src/game/words.ts";
import { corridorChaoAt, corridorToleranceAt, shapeForWord, toleranceChao } from "../../../../src/game/gates.ts";
import { tuning } from "../../../../src/game/tuning.ts";
const raw = JSON.parse(fs.readFileSync("src/data/wordsFallback.json","utf8"));
const words = wordsFromCatalog(raw.rows.map((r:any)=>({...r, speaker_id:"jane"})));
const byId = new Map(words.map(w=>[w.id,w]));
const SHIFTS=[-1,-0.75,-0.5,-0.25,0,0.25,0.5,0.75,1];
const clamp=(c:number)=>Math.min(5,Math.max(1,c));
for (const style of ["textbook","natural"] as const) {
  const rows = JSON.parse(fs.readFileSync(`fixtures/contours/jane-${style}-sample.json`,"utf8")).rows;
  const agg: Record<string,{n:number; read:number[]; split:number[]; acc:number[]; inCorr:number[]}> = {};
  for (const r of rows) {
    const kind = r.tones.length===1 ? "single" : "pair";
    const w0 = byId.get(r.id); const w = w0 ? wordInStyle(w0, style) : null;
    const a = (agg[kind] ??= {n:0, read:SHIFTS.map(()=>0), split:SHIFTS.map(()=>0), acc:SHIFTS.map(()=>0), inCorr:SHIFTS.map(()=>0)});
    a.n++;
    SHIFTS.forEach((s,i)=>{
      const pts = r.contour.map(([t,c]:number[])=>({tMs:t*r.durationS*1000, chao:clamp(c+s)}));
      const contour = {points:pts, startedAtMs:0, endedAtMs:pts.at(-1).tMs};
      let ok=false;
      if (kind==="single") { const c=classifyToneV2(contour); ok = c?.tone===r.tones[0]; a.split[i]++; }
      else { const syl = readContourSyllables(contour); if (syl && syl.length===2) { a.split[i]++; ok = syl[0]?.tone===r.tones[0] && syl[1]?.tone===r.tones[1]; } }
      if (ok) a.read[i]++;
      if (w) {
        const d = toneAccuracyDetail(pts, r.tones, referenceFromWord(w), style);
        a.acc[i] += d?.accuracy ?? 0;
        // game: share of voiced points inside corridor (gate clock == contour t)
        const shape = shapeForWord(w); const tol = toleranceChao(w.tones, tuning().baseToleranceH);
        let inside=0; for (const [t,c] of r.contour) { const ctr=corridorChaoAt(shape,t); const tc=corridorToleranceAt(shape,t,tol,1); if (Math.abs(clamp(c+s)-ctr)<=tc) inside++; }
        a.inCorr[i] += inside/r.contour.length;
      }
    });
  }
  console.log(`\n=== ${style} — shift (chao):  ${SHIFTS.map(s=>String(s).padStart(5)).join(" ")}`);
  for (const [k,a] of Object.entries(agg)) {
    console.log(`${k} n=${a.n} read correct %   ${a.read.map(v=>String(Math.round(100*v/a.n)).padStart(5)).join(" ")}`);
    if (k==="pair") console.log(`${k} two syllables found % ${a.split.map(v=>String(Math.round(100*v/a.n)).padStart(5)).join(" ")}`);
    console.log(`${k} vis accuracy avg %   ${a.acc.map(v=>String(Math.round(100*v/a.n)).padStart(5)).join(" ")}`);
    console.log(`${k} game in-corridor %   ${a.inCorr.map(v=>String(Math.round(100*v/a.n)).padStart(5)).join(" ")}`);
  }
}
