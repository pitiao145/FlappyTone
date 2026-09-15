/**
 * One-time upload: every `public/ref/<id>.wav` that has a matching `words`
 * row goes into `flappytone-clips` as `<id>.wav` — the exact key shape
 * `handleClip` (`workers/clips/src/routes/clip.ts`) reads with
 * `env.CLIPS.get(word.clipKey)`.
 *
 *   npm run upload-clips              # all 120
 *   npm run upload-clips -- --only ma1   # just one id
 *   npm run upload-clips -- --dry-run    # print what would upload, write nothing
 *
 * Source of truth for "which ids exist" is the `words` table, not the
 * directory listing — a stray file in `public/ref/` with no `words` row
 * should not silently ship.
 */

import { existsSync } from "node:fs";

import { serviceClient } from "./serviceClient.ts";
import { r2Put } from "./r2.ts";

const root = new URL("../../", import.meta.url).pathname;

const dryRun = process.argv.includes("--dry-run");
const onlyIdx = process.argv.indexOf("--only");
if (onlyIdx !== -1 && !process.argv[onlyIdx + 1]) throw new Error("--only needs an id");
const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

const supabase = serviceClient();
const { data, error } = await supabase.from("words").select("id").order("id");
if (error) throw new Error(`words query failed: ${error.message}`);

const ids = data.map((row) => row.id).filter((id) => !only || id === only);
if (only && ids.length === 0) throw new Error(`--only ${only}: no such word id`);

let uploaded = 0;
let missing = 0;

for (const id of ids) {
  const file = `${root}public/ref/${id}.wav`;
  if (!existsSync(file)) {
    console.warn(`missing ${file} for word id ${id}`);
    missing++;
    continue;
  }
  if (dryRun) {
    console.log(`[dry-run] flappytone-clips/${id}.wav <- ${file}`);
  } else {
    r2Put("flappytone-clips", `${id}.wav`, file);
    console.log(`uploaded flappytone-clips/${id}.wav`);
  }
  uploaded++;
}

console.log(
  `\n${dryRun ? "[dry-run] would upload" : "uploaded"} ${uploaded} clip(s)` +
    (missing ? `, ${missing} missing local file(s)` : ""),
);
if (missing > 0) process.exit(1);
