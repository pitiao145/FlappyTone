// Brief 46 step 3: would the shared finder (src/game/syllables.ts) give the clip
// pipeline the same syllable runs as multiSyllableSpan? Dev-only, numbers only.
//   node src/dev/bench39/pipe46.mjs
import { readFileSync } from "node:fs";
const { multiSyllableSpan } = await import("../clipCutMulti.ts");
const { clipNoiseFloor } = await import("../clipCut.ts");
const { findSyllables } = await import("../../game/syllables.ts");
const { PitchTracker } = await import("../../pitch/PitchTracker.ts");
const { speakerFMin } = await import("../../game/tuning.ts");
const { clipList } = await import("./tracks.mjs");
const { loadWav } = await import("./lib.mjs");
const F = JSON.parse(readFileSync("src/dev/local/shapes-v2.json","utf8")).ruler.measuredAtHz;
const WIN=2048, HOP=1024;
const rmsAt=(x,c)=>{let s=0,n=0;for(let i=Math.max(0,Math.round(c-WIN/2));i<c+WIN/2&&i<x.length;i++){s+=x[i]*x[i];n++}return Math.sqrt(s/n)};
for (const set of ["textbook","natural"]) {
  let n=0, notFound=0, same=0, moved=0;
  for (const c of clipList().filter(c=>c.set===set&&c.tones.length>=2)) {
    const {samples:x,sampleRate:sr}=loadWav(c.file); const floor=clipNoiseFloor(x,sr,F);
    const sp=multiSyllableSpan(x,sr,F,c.tones.length,{noiseFloor:floor});
    const tr=new PitchTracker({sampleRate:sr,f0Center:F,fMin:speakerFMin(F),noiseFloor:floor});
    const fr=[]; for(let s=0;s+WIN<=x.length;s+=HOP){ if(tr.push(x.subarray(s,s+WIN)).voiced){const cc=s+WIN/2; fr.push({tMs:cc/sr*1000,rms:rmsAt(x,cc),cc});} }
    const got=findSyllables(fr,c.tones.length); n++;
    if(!got){notFound++;continue}
    const ok=got.every((p,k)=>Math.abs(p[0].cc-sp.runs[k].start)<=HOP&&Math.abs(p.at(-1).cc-sp.runs[k].end)<=HOP);
    ok?same++:moved++;
  }
  console.log(set,{words:n,notFound,sameRuns:same,differentRuns:moved});
}
