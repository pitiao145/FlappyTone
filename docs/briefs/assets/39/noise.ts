import { readFileSync } from "node:fs";
import { PitchTracker } from "../../../../src/pitch/PitchTracker.ts";
import { decodeWav } from "../../../../src/dev/wav.ts";
import { rmsOf } from "../../../../src/pitch/math.ts";
const FS=2048, HOP=1024;
function run(file:string, floor:number) {
  const d = decodeWav(readFileSync(file)); const sr=d.sampleRate;
  const tr = new PitchTracker({ sampleRate: sr, f0Center: 168, noiseFloor: floor, minVoicedRun: 3 });
  const out:{t:number; v:boolean; c:number; rms:number}[]=[];
  for (let s=0; s+FS<=d.samples.length; s+=HOP){ const f=d.samples.subarray(s,s+FS); const p=tr.push(f); out.push({t:s/sr*1000, v:p.voiced, c:p.smoothedChao, rms:rmsOf(f)}); }
  return out;
}
const med=(a:number[])=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]};
console.log("file          gate/voice  voicedMs  first-last(ms)   chao lo..hi   chao at start  at end");
for (const f of ["ma1","ma2","ma3","ma3_natural","ma4","chang2","ba1"]) {
  const file=`fixtures/captures/jane_${f}.wav`;
  const base=run(file,1e-4); const voiceRms=med(base.filter(p=>p.v).map(p=>p.rms));
  for (const frac of [0.0003/voiceRms*3 /*~min*/, 0.1, 0.2, 0.3, 0.4]) {
    const floor = voiceRms*frac/3; const r=run(file,floor); const v=r.filter(p=>p.v);
    if (!v.length){console.log(f.padEnd(13), frac.toFixed(2), "no voice");continue;}
    const cs=v.map(p=>p.c);
    console.log(f.padEnd(13), frac.toFixed(2).padStart(9), String(Math.round(v.length*HOP/44.1)).padStart(9), (Math.round(v[0].t)+"-"+Math.round(v.at(-1)!.t)).padStart(14), (Math.min(...cs).toFixed(2)+".."+Math.max(...cs).toFixed(2)).padStart(12), cs[0].toFixed(2).padStart(12), cs.at(-1)!.toFixed(2).padStart(7));
  }
}
