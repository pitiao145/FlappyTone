/**
 * Downloads a recording session out of Blob storage onto disk.
 *
 *   npm run pull-recordings            # every session
 *   npm run pull-recordings 2026-08-06-a1b2c3
 *
 * Lands in `fixtures/recordings/<session>/<id>.wav`, which `npm run make-clips`
 * then cuts. Two steps rather than one because the raw takes are evidence: if a
 * clip comes out wrong, the thing to re-examine is the recording, and it should
 * still be here to re-examine.
 *
 * Needs `BLOB_READ_WRITE_TOKEN`, read from the environment or `.env.local`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get, list } from "@vercel/blob";

const root = new URL("../../", import.meta.url).pathname;

/**
 * Minimal `.env.local` reader. Not dotenv: this wants one variable, and adding
 * a dependency to a repo whose whole dependency list is five packages is a
 * worse trade than fifteen lines.
 */
function loadToken(): string {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const file = `${root}.env.local`;
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*(?:export\s+)?BLOB_READ_WRITE_TOKEN\s*=\s*(.*)$/.exec(line);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(
    "BLOB_READ_WRITE_TOKEN is not set. Put it in .env.local (get it with `vercel env pull .env.local`).",
  );
}

const wanted = process.argv[2];
const token = loadToken();

const prefix = wanted ? `recordings/${wanted}/` : "recordings/";
const { blobs } = await list({ prefix, token, limit: 1000 });

if (blobs.length === 0) {
  console.log(`No recordings under ${prefix}.`);
  process.exit(0);
}

let written = 0;
for (const blob of blobs) {
  // recordings/<session>/<id>.wav
  const parts = blob.pathname.split("/");
  if (parts.length !== 3 || !parts[2].endsWith(".wav")) {
    console.warn(`skipping unexpected key ${blob.pathname}`);
    continue;
  }
  const [, session, filename] = parts;
  const dir = `${root}fixtures/recordings/${session}`;
  mkdirSync(dir, { recursive: true });

  // Authenticated read by pathname. These blobs are private, so their URL is
  // not enough on its own — the token is what opens them.
  const result = await get(blob.pathname, { access: "private", token });
  if (!result) {
    console.warn(`failed to download ${blob.pathname}: not found`);
    continue;
  }
  writeFileSync(`${dir}/${filename}`, new Uint8Array(await new Response(result.stream).arrayBuffer()));
  written++;
  console.log(`${blob.pathname}  ${(blob.size / 1024) | 0}KB`);
}

console.log(`\n${written} clip(s) -> fixtures/recordings/`);
