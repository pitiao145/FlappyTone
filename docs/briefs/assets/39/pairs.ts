import fs from "node:fs";
import { wordsFromCatalog, wordInStyle, toneComboKey } from "../../../../src/game/words.ts";
import { corridorChaoAt, shapeForWord } from "../../../../src/game/gates.ts";
const raw = JSON.parse(fs.readFileSync("src/data/wordsFallback.json","utf8"));
const words = wordsFromCatalog(raw.rows.map((r:any)=>({...r, speaker_id:"jane"})));
console.log("words", words.length, "pairs", words.filter(w=>w.syllables===2).length);
for (const style of ["textbook","natural"] as const) {
  const groups: Record<string, number[][]> = {};
  for (const w0 of words) {
    const w = wordInStyle(w0, style); if (!w) continue;
    const s = shapeForWord(w);
    const key = w.syllables===1 ? `single ${w.tone}` : toneComboKey(w.tones);
    const start = corridorChaoAt(s, 0), mid = corridorChaoAt(s, 0.5), end = corridorChaoAt(s,1);
    let min=9,max=0; for (let i=0;i<=60;i++){const c=corridorChaoAt(s,i/60);min=Math.min(min,c);max=Math.max(max,c);}
    (groups[key] ??= []).push([start, mid, end, min, max, w.durationS]);
  }
  console.log(`\n== ${style}: key  n  start  mid  end  min  max  dur(s)`);
  const avg = (a:number[][],i:number)=> (a.reduce((s,r)=>s+r[i],0)/a.length).toFixed(2);
  for (const k of Object.keys(groups).sort()) { const g=groups[k]; console.log(k.padEnd(10), String(g.length).padStart(3), [0,1,2,3,4,5].map(i=>avg(g,i)).join("  ")); }
}
