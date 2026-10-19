/**
 * Writes TonyStory's burned-in captions as an .srt for CapCut.
 * Usage: node --experimental-strip-types video/export-srt.ts [out.srt]
 */
import { writeFileSync } from "node:fs";
import { CAPS, SCENE_ORDER, STORY_FPS, sceneStart } from "./src/tonyStoryScript.ts";

const stamp = (frame: number) => {
  const ms = Math.round((frame / STORY_FPS) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

const rows = SCENE_ORDER.flatMap((k) => CAPS[k].map((c) => ({ ...c, from: c.from + sceneStart(k), to: c.to + sceneStart(k) }))).sort((a, b) => a.from - b.from);
const srt = rows.map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`).join("\n");
const out = process.argv[2] ?? "video/out/tony-story.srt";
writeFileSync(out, srt);
console.log(`${rows.length} captions → ${out}`);
