/**
 * One-time upload of every raw take into `flappytone-raw`, then points each
 * `words` row at the take that fed its shipped clip.
 *
 *   npm run migrate-raw              # all sessions, all ids
 *   npm run migrate-raw -- --only ma1
 *   npm run migrate-raw -- --dry-run
 *
 * Steps:
 *  1. `npm run pull-recordings` (no session arg — every session in Blob),
 *     so `fixtures/recordings/` is current before anything uploads.
 *  2. For every `fixtures/recordings/<session>/<id>.wav`, upload to
 *     `flappytone-raw` as `raw/<session>/<id>.wav` — the exact key shape
 *     Task 10's `/raw` route depends on.
 *  3. For each id that appears in more than one session, the LATEST session
 *     (sorted by name — these are `YYYY-MM-DD-xxxxxx`, so lexicographic sort
 *     is chronological) wins: that id's `words.raw_key`/`recorded_session`
 *     point at the latest take, not the first one found or an arbitrary one.
 *     A word recorded once in an early session and re-recorded later in
 *     another must end up pointing at the re-recording.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

import { serviceClient } from "./serviceClient.ts";
import { r2Put } from "./r2.ts";

const root = new URL("../../", import.meta.url).pathname;
const recordingsDir = `${root}fixtures/recordings`;

const dryRun = process.argv.includes("--dry-run");
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

// Step 1: refresh fixtures/recordings/ from Blob (every session).
console.log("Pulling recordings from Blob...");
execFileSync("node", ["--experimental-strip-types", "src/dev/pull-recordings.ts"], {
  cwd: root,
  stdio: "inherit",
});

if (!existsSync(recordingsDir)) throw new Error(`${recordingsDir} does not exist after pull-recordings`);

const sessions = readdirSync(recordingsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (sessions.length === 0) throw new Error("No recording sessions found under fixtures/recordings/");

// id -> latest session that contains a take for it
const latestSessionForId = new Map<string, string>();
const perSessionCounts = new Map<string, number>();

let uploaded = 0;

for (const session of sessions) {
  const dir = `${recordingsDir}/${session}`;
  const files = readdirSync(dir).filter((f) => f.endsWith(".wav"));
  let sessionUploaded = 0;

  for (const filename of files) {
    const id = filename.slice(0, -".wav".length);
    if (only && id !== only) continue;

    // Sessions are visited in sorted (chronological) order, so the last
    // write for a given id is always the latest session — no comparison
    // needed beyond "visit in order and overwrite".
    latestSessionForId.set(id, session);

    const file = `${dir}/${filename}`;
    const key = `raw/${session}/${filename}`;
    if (dryRun) {
      console.log(`[dry-run] flappytone-raw/${key} <- ${file}`);
    } else {
      r2Put("flappytone-raw", key, file);
      console.log(`uploaded flappytone-raw/${key}`);
    }
    uploaded++;
    sessionUploaded++;
  }
  perSessionCounts.set(session, sessionUploaded);
}

if (only && latestSessionForId.size === 0) {
  throw new Error(`--only ${only}: no raw take found for that id in any session`);
}

console.log(`\n${dryRun ? "[dry-run] would upload" : "uploaded"} ${uploaded} raw take(s):`);
for (const [session, count] of perSessionCounts) console.log(`  ${session}: ${count}`);

// Step 3: point each id's words row at its latest session's raw_key.
if (dryRun) {
  console.log(`\n[dry-run] would update ${latestSessionForId.size} words row(s):`);
  for (const [id, session] of latestSessionForId) {
    console.log(`  ${id} -> raw_key=raw/${session}/${id}.wav, recorded_session=${session}`);
  }
  process.exit(0);
}

const supabase = serviceClient();
let updated = 0;
let skipped = 0;
for (const [id, session] of latestSessionForId) {
  const { data, error } = await supabase
    .from("words")
    .update({ raw_key: `raw/${session}/${id}.wav`, recorded_session: session })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`words update failed for ${id}: ${error.message}`);
  // A raw take with no matching words row (e.g. the four fixtures/anchors
  // takes ma1/ma3/ma4, whose word ids are ma1b/mao1/ma3b/ma4v etc) still
  // uploads — Step 2 copies every take verbatim — but has nothing to update.
  if (data && data.length > 0) updated++;
  else skipped++;
}

console.log(
  `\nUpdated raw_key/recorded_session on ${updated} words row(s)` +
    (skipped ? ` (${skipped} take(s) had no matching word id — uploaded only)` : "") +
    ".",
);
