/**
 * Reads pulled sessions and prints the aggregate.
 *
 *   npm run pull-analytics     # first — fills fixtures/analytics/
 *   npm run report-runs
 *   npm run report-runs 2026-08-06   # one day
 *
 * The arithmetic lives in `runReport.ts` and is tested there. This file only
 * finds the files and prints what comes back.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { SessionRecord } from "../analytics/session.ts";
import { buildReport, formatReport } from "./runReport.ts";

const root = new URL("../../", import.meta.url).pathname;
const base = `${root}fixtures/analytics`;

if (!existsSync(base)) {
  console.error("No fixtures/analytics — run `npm run pull-analytics` first.");
  process.exit(1);
}

const wanted = process.argv[2];
if (wanted && !/^\d{4}-\d{2}-\d{2}$/.test(wanted)) {
  console.error(`Expected a day like 2026-08-06, got "${wanted}".`);
  process.exit(1);
}

const days = readdirSync(base).filter((d) => !wanted || d === wanted);
const sessions: SessionRecord[] = [];
let skipped = 0;

for (const day of days) {
  const dir = `${base}/${day}`;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      sessions.push(JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as SessionRecord);
    } catch {
      // A truncated download is not worth stopping the report for, but it is
      // worth saying out loud — a silently dropped session skews every rate.
      console.warn(`skipping unreadable ${day}/${file}`);
      skipped += 1;
    }
  }
}

if (sessions.length === 0) {
  console.error(`No sessions found under ${base}${wanted ? `/${wanted}` : ""}.`);
  process.exit(1);
}

console.log(formatReport(buildReport(sessions)));
if (skipped > 0) console.log(`\n(${skipped} file(s) skipped as unreadable)`);
console.log("");
