/**
 * Verifies the R2 upload by reading objects back OUT of R2 and comparing
 * byte length AND SHA-256 against the local source file. This is the gate:
 * an upload's exit code, or an object listing, proves nothing about
 * content — only a re-download and a hash comparison does. This is the
 * routine post-`process-clips` check, not a one-time migration script.
 *
 *   npm run verify-clips                        # every ACTIVE speaker, in turn
 *   npm run verify-clips -- --speaker jane      # just hers
 *   npm run verify-clips -- --raw               # raw_key instead of clip_key
 *   npm run verify-clips -- --speaker jane --only ma1
 *
 * Keys come from `word_clips`, so a speaker is always part of the question.
 * With no `--speaker` it walks every `speakers.active` row and reports per
 * speaker — a single pooled total would hide one voice's failures inside
 * another's passes.
 *
 * Downloads land in `fixtures/clips/verify/` (gitignored scratch space),
 * never touching `fixtures/clips/<speaker>/` or `fixtures/recordings/`
 * themselves.
 *
 * Exits 1 on any mismatch or missing local source — a row this machine
 * cannot compare is reported, not silently skipped, since "nothing to
 * compare" is not a pass.
 *
 * The local comparison source for a published clip is
 * `fixtures/clips/<speaker>/<id>.wav`, written by `process-clips.ts`. For
 * Jane's 120 pre-roster words, the source is instead the legacy
 * `public/ref/<id>.wav` — untracked in Task 13 (Sep 2026; git history keeps
 * it, but it's no longer checked out) — so those rows only verify on a
 * working copy that still has that directory on disk (whoever ran the
 * original migration). A fresh clone reports them as missing-local rather
 * than a mismatch: there is nothing to regenerate them from without a
 * re-cut.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";

import { serviceClient } from "./serviceClient.ts";
import { r2Get } from "./r2.ts";

const root = new URL("../../", import.meta.url).pathname;
const scratchDir = `${root}fixtures/clips/verify`;

const argv = process.argv.slice(2);
const isRaw = argv.includes("--raw");
const onlyIdx = argv.indexOf("--only");
if (onlyIdx !== -1 && (!argv[onlyIdx + 1] || argv[onlyIdx + 1].startsWith("--")))
  throw new Error("--only needs an id");
const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;

const speakerIdx = argv.indexOf("--speaker");
if (speakerIdx !== -1 && (!argv[speakerIdx + 1] || argv[speakerIdx + 1].startsWith("--")))
  throw new Error("--speaker needs an id");
const onlySpeaker = speakerIdx !== -1 ? argv[speakerIdx + 1] : null;

mkdirSync(scratchDir, { recursive: true });

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

interface Row {
  id: string;
  bucketKey: string;
  localFile: string;
}

const supabase = serviceClient();

const { data: roster, error: rosterError } = await supabase
  .from("speakers")
  .select("id,active")
  .order("id");
if (rosterError) throw new Error(`speakers query failed: ${rosterError.message}`);

const speakers = (roster ?? [])
  .filter((s) => (onlySpeaker ? s.id === onlySpeaker : s.active))
  .map((s) => s.id);
if (speakers.length === 0) {
  throw new Error(
    onlySpeaker ? `--speaker ${onlySpeaker}: no such speaker` : "No active speakers to verify",
  );
}

async function rowsFor(speaker: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from("word_clips")
    .select("word_id,clip_key,raw_key,recorded_session")
    .eq("speaker_id", speaker)
    .order("word_id");
  if (error) throw new Error(`word_clips query failed: ${error.message}`);
  return (data ?? [])
    .filter((r) => (isRaw ? r.raw_key && r.recorded_session : r.clip_key))
    .filter((r) => !only || r.word_id === only)
    .map((r) => ({
      id: r.word_id,
      bucketKey: (isRaw ? r.raw_key : r.clip_key)!,
      localFile: isRaw
        ? localTake(speaker, r.recorded_session!, r.word_id)
        : localClip(speaker, r.word_id),
    }));
}

/** Both cache layouts — see `process-clips.ts`'s `localPath` for why. */
function localTake(speaker: string, session: string, id: string): string {
  const legacy = `${root}fixtures/recordings/${session}/${id}.wav`;
  return existsSync(legacy) ? legacy : `${root}fixtures/recordings/${speaker}/${session}/${id}.wav`;
}

/**
 * `process-clips.ts` writes published clips to `fixtures/clips/<speaker>/`.
 * Jane's 120 pre-roster words predate that layout and live (if present at
 * all) in the legacy `public/ref/` directory — see the file header.
 */
function localClip(speaker: string, id: string): string {
  const legacy = `${root}public/ref/${id}.wav`;
  return existsSync(legacy) ? legacy : `${root}fixtures/clips/${speaker}/${id}.wav`;
}

const bucket = isRaw ? "flappytone-raw" : "flappytone-clips";

let totalMismatches = 0;

for (const speaker of speakers) {
  const rows = await rowsFor(speaker);
  let mismatches = 0;
  let noLocalSource = 0;
  const results: { id: string; ok: boolean; detail: string }[] = [];

  for (const row of rows) {
    if (!existsSync(row.localFile)) {
      results.push({
        id: row.id,
        ok: false,
        detail: `no local source on this machine: ${row.localFile}`,
      });
      noLocalSource++;
      continue;
    }

    const downloaded = `${scratchDir}/${speaker}-${row.id}.wav`;
    rmSync(downloaded, { force: true });
    try {
      r2Get(bucket, row.bucketKey, downloaded);
    } catch (e) {
      results.push({ id: row.id, ok: false, detail: `r2 get failed: ${(e as Error).message}` });
      mismatches++;
      continue;
    }

    if (!existsSync(downloaded)) {
      results.push({ id: row.id, ok: false, detail: `download produced no file` });
      mismatches++;
      continue;
    }

    const localSize = statSync(row.localFile).size;
    const remoteSize = statSync(downloaded).size;
    if (localSize !== remoteSize) {
      results.push({ id: row.id, ok: false, detail: `size mismatch: local=${localSize} remote=${remoteSize}` });
      mismatches++;
      continue;
    }

    const localHash = sha256(row.localFile);
    const remoteHash = sha256(downloaded);
    if (localHash !== remoteHash) {
      results.push({ id: row.id, ok: false, detail: `sha256 mismatch: local=${localHash} remote=${remoteHash}` });
      mismatches++;
      continue;
    }

    results.push({ id: row.id, ok: true, detail: `${localSize}B, sha256 ${localHash.slice(0, 12)}...` });
  }

  console.log(`\nVerify ${speaker} (${isRaw ? "raw" : "clips"}) — ${results.length} object(s):\n`);
  if (results.length === 0) console.log("  (nothing recorded for this speaker yet)");
  for (const r of results) console.log(`  ${r.ok ? "OK  " : "FAIL"}  ${r.id.padEnd(10)} ${r.detail}`);
  // Per speaker, never pooled: one voice's failures must not disappear into
  // another's passes.
  const ok = results.length - mismatches - noLocalSource;
  console.log(
    `  ${ok}/${results.length} matched, ${mismatches} mismatch(es), ${noLocalSource} missing-local.`,
  );
  totalMismatches += mismatches + noLocalSource;
}

if (totalMismatches > 0) process.exit(1);
