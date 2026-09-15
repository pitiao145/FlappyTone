/**
 * Verifies the R2 upload by reading objects back OUT of R2 and comparing
 * byte length AND SHA-256 against the local source file. This is the gate:
 * an upload's exit code, or an object listing, proves nothing about
 * content — only a re-download and a hash comparison does.
 *
 *   npm run verify-clips             # every words.clip_key vs public/ref/
 *   npm run verify-clips -- --raw    # every words.raw_key vs fixtures/recordings/
 *   npm run verify-clips -- --only ma1
 *
 * Downloads land in `fixtures/clips/verify/` (gitignored scratch space),
 * never touching `public/ref/` or `fixtures/recordings/` themselves.
 *
 * Exits 1 on any mismatch or missing object.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";

import { serviceClient } from "./serviceClient.ts";
import { r2Get } from "./r2.ts";

const root = new URL("../../", import.meta.url).pathname;
const scratchDir = `${root}fixtures/clips/verify`;

const isRaw = process.argv.includes("--raw");
const onlyIdx = process.argv.indexOf("--only");
if (onlyIdx !== -1 && !process.argv[onlyIdx + 1]) throw new Error("--only needs an id");
const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

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

let rows: Row[];
if (isRaw) {
  const { data, error } = await supabase.from("words").select("id,raw_key,recorded_session").order("id");
  if (error) throw new Error(`words query failed: ${error.message}`);
  rows = data
    .filter((r) => r.raw_key && r.recorded_session)
    .filter((r) => !only || r.id === only)
    .map((r) => ({
      id: r.id,
      bucketKey: r.raw_key!,
      localFile: `${root}fixtures/recordings/${r.recorded_session}/${r.id}.wav`,
    }));
} else {
  const { data, error } = await supabase.from("words").select("id,clip_key").order("id");
  if (error) throw new Error(`words query failed: ${error.message}`);
  rows = data
    .filter((r) => r.clip_key)
    .filter((r) => !only || r.id === only)
    .map((r) => ({ id: r.id, bucketKey: r.clip_key!, localFile: `${root}public/ref/${r.id}.wav` }));
}

if (rows.length === 0) throw new Error(only ? `--only ${only}: no matching row` : "No rows to verify");

const bucket = isRaw ? "flappytone-raw" : "flappytone-clips";

let mismatches = 0;
const results: { id: string; ok: boolean; detail: string }[] = [];

for (const row of rows) {
  if (!existsSync(row.localFile)) {
    results.push({ id: row.id, ok: false, detail: `local file missing: ${row.localFile}` });
    mismatches++;
    continue;
  }

  const downloaded = `${scratchDir}/${row.id}.wav`;
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

console.log(`\nVerify (${isRaw ? "raw" : "clips"}) — ${results.length} object(s):\n`);
for (const r of results) console.log(`  ${r.ok ? "OK  " : "FAIL"}  ${r.id.padEnd(10)} ${r.detail}`);

console.log(`\n${results.length - mismatches}/${results.length} matched, ${mismatches} mismatch(es).`);
if (mismatches > 0) process.exit(1);
