/**
 * Downloads play sessions out of Blob storage onto disk.
 *
 *   npm run pull-analytics             # every day
 *   npm run pull-analytics 2026-08-06  # one day
 *
 * Lands in `fixtures/analytics/<day>/<sessionId>.json`, which
 * `npm run report-runs` then aggregates. Two steps rather than one for the same
 * reason as `pull-recordings`: the raw sessions are the evidence. If a number in
 * the report looks wrong, the thing to re-examine is the session, and it should
 * still be here to re-examine.
 *
 * Needs `BLOB_READ_WRITE_TOKEN`, read from the environment or `.env.local`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get, list } from "@vercel/blob";

const root = new URL("../../", import.meta.url).pathname;

/** Same minimal reader as `pull-recordings.ts`, for the same reason. */
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
if (wanted && !/^\d{4}-\d{2}-\d{2}$/.test(wanted)) {
  console.error(`Expected a day like 2026-08-06, got "${wanted}".`);
  process.exit(1);
}

const token = loadToken();
const prefix = wanted ? `analytics/${wanted}/` : "analytics/";

// Blob pages at 1000; a busy test round will exceed that in a week.
let cursor: string | undefined;
let written = 0;
let bytes = 0;

do {
  const page = await list({ prefix, token, limit: 1000, cursor });
  cursor = page.hasMore ? page.cursor : undefined;

  for (const blob of page.blobs) {
    // analytics/<day>/<sessionId>.json
    const parts = blob.pathname.split("/");
    if (parts.length !== 3 || !parts[2].endsWith(".json")) {
      console.warn(`skipping unexpected key ${blob.pathname}`);
      continue;
    }
    const [, day, filename] = parts;
    const dir = `${root}fixtures/analytics/${day}`;
    mkdirSync(dir, { recursive: true });

    // Authenticated read by pathname — these blobs are private, so the URL is
    // not enough on its own.
    const result = await get(blob.pathname, { access: "private", token });
    if (!result) {
      console.warn(`failed to download ${blob.pathname}: not found`);
      continue;
    }
    const body = await new Response(result.stream).text();
    writeFileSync(`${dir}/${filename}`, body);
    written++;
    bytes += body.length;
  }
} while (cursor);

if (written === 0) {
  console.log(`No sessions under ${prefix}.`);
  process.exit(0);
}

console.log(
  `${written} session(s), ${(bytes / 1024).toFixed(1)}KB -> fixtures/analytics/`,
);
console.log("Read them with: npm run report-runs");
