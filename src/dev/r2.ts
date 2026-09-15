/**
 * Thin wrappers over `wrangler r2 object`, for one-shot dev scripts that
 * copy files into/out of the two clip buckets (`flappytone-clips`,
 * `flappytone-raw`). Both buckets are private with no public access — this
 * is the only sanctioned way to write or read them outside the Worker
 * itself.
 *
 * `--remote` targets the real bucket, not wrangler's local emulation. Run
 * from `workers/clips` (where `wrangler.toml` binds both buckets), not the
 * repo root. Throws on any non-zero exit — these scripts are meant to stop
 * loudly, not degrade.
 */

import { execFileSync } from "node:child_process";

const WORKERS_CLIPS_CWD = new URL("../../workers/clips", import.meta.url).pathname;

export type Bucket = "flappytone-raw" | "flappytone-clips";

export function r2Put(bucket: Bucket, key: string, file: string, contentType = "audio/wav"): void {
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", file, "--remote", "--content-type", contentType],
    { cwd: WORKERS_CLIPS_CWD, stdio: "inherit" },
  );
}

export function r2Get(bucket: Bucket, key: string, file: string): void {
  execFileSync("npx", ["wrangler", "r2", "object", "get", `${bucket}/${key}`, "--file", file, "--remote"], {
    cwd: WORKERS_CLIPS_CWD,
    stdio: "inherit",
  });
}
