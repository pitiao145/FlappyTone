import fs from "node:fs";
import { readContourSyllables, splitSyllables } from "../../../../src/game/freeAttempts.ts";
const clamp=(c:number)=>Math.min(5,Math.max(1,c));
const style = process.argv[2] ?? "textbook";
const rows = JSON.parse(fs.readFileSync(`fixtures/contours/jane-${style}-sample.json`,"utf8")).rows.filter((r:any)=>r.tones.length===2);
console.log("id        target  | shift -1   -0.5   0      +0.5   | maxGapMs dur");
for (const r of rows) {
  const out = [-1,-0.5,0,0.5].map(s=>{
    const pts = r.contour.map(([t,c]:number[])=>({tMs:t*r.durationS*1000, chao:clamp(c+s)}));
    const syl = readContourSyllables({points:pts,startedAtMs:0,endedAtMs:null});
    return (syl ?? []).map(x=>x? String(x.tone): "?").join("+") || "null";
  });
  let maxGap=0; for (let i=1;i<r.contour.length;i++) maxGap=Math.max(maxGap,(r.contour[i][0]-r.contour[i-1][0])*r.durationS*1000);
  console.log(r.id.padEnd(9), r.tones.join("+").padEnd(7), "|", out.map(o=>o.padEnd(6)).join(" "), "|", Math.round(maxGap).toString().padStart(5), Math.round(r.durationS*1000));
}
