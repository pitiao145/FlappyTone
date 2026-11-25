/**
 * Brief 54: a short table of a shots run's findings, per screen and check.
 *
 *   node --experimental-strip-types src/dev/shots/summary.ts [label] [--detail flow/state]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Result {
  flow: string;
  state: string;
  variant: string;
  failures: { check: string; detail: string }[];
  reference?: boolean;
}

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--")) ?? "after";
const di = args.indexOf("--detail");
const detail = di >= 0 ? args[di + 1] : null;
const results = JSON.parse(readFileSync(join("shots-out", label, "results.json"), "utf8")) as Result[];

if (detail) {
  for (const r of results.filter((r) => `${r.flow}/${r.state}` === detail)) {
    console.log(`${r.variant}`);
    for (const f of r.failures) console.log(`  ${f.check}: ${f.detail}`);
  }
} else {
  const rows = new Map<string, Map<string, number>>();
  for (const r of results) {
    const k = `${r.flow}/${r.state}${r.reference ? " (ref)" : ""}`;
    const m = rows.get(k) ?? new Map<string, number>();
    rows.set(k, m);
    for (const f of r.failures) m.set(f.check, (m.get(f.check) ?? 0) + 1);
  }
  for (const [k, m] of rows) console.log(`${k.padEnd(34)} ${[...m].map(([c, n]) => `${c}:${n}`).join("  ") || "ok"}`);
}
