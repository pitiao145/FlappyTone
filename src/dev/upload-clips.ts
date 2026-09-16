/**
 * FROZEN — one-time upload, already run; no longer wired to a package.json
 * script (Task 13, Sep 2026). Uploaded every `public/ref/<id>.wav` that had
 * a matching `words` row into `flappytone-clips` as `<id>.wav` — the exact
 * key shape `handleClip` (`workers/clips/src/routes/clip.ts`) reads with
 * `env.CLIPS.get(word.clipKey)`. Kept only as the historical record.
 *
 * `public/ref/*.wav` was untracked in Task 13 (Sep 2026) — git history
 * keeps it, but it is no longer checked out. This script only works against
 * a working copy that still has those files on disk (whoever ran the
 * original migration); a fresh clone will NOT have them and this will fail
 * with ENOENT for every id.
 *
 *   node --experimental-strip-types src/dev/upload-clips.ts              # all 120
 *   node --experimental-strip-types src/dev/upload-clips.ts -- --only ma1   # just one id
 *   node --experimental-strip-types src/dev/upload-clips.ts -- --dry-run    # print what would upload, write nothing
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
