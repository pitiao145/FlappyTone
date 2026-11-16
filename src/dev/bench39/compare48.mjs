// Brief 48: every scorecard number, production vs new.
// Production = the brief 40 baseline (commit 0c05601): `main`'s src/pitch and
// reader are unchanged since then (checked with git diff in brief 48).
// New = what `npm run bench` prints now (one-ruler rows are the flag-on side).
// Usage: node src/dev/bench39/compare48.mjs > docs/briefs/reports/48-scorecard-production-vs-new.md
import { execSync } from "node:child_process";

const PROD_COMMIT = "0c05601";
const prod = JSON.parse(execSync(`git show ${PROD_COMMIT}:docs/briefs/refs/39-baseline.json`, { encoding: "utf8" })).metrics;
const out = execSync("node src/dev/bench39/scorecard.mjs", { encoding: "utf8", maxBuffer: 1 << 26 });
const rows = [];
for (const line of out.split("\n")) {
  const m = line.match(/^([\w.]+) \| ([-\d.]+) \| ([-\d.]+) \| (.+?) \| (PASS|FAIL)$/);
  if (m) rows.push({ key: m[1], now: Number(m[2]), allowed: m[4], result: m[5] });
}
// One-ruler rows that have an old-foundation partner on the same scorecard.
const partner = (k) => {
  let m = k.match(/^ruler\.reader\.singlesRight\.pct\.calibrated\.(\w+)$/);
  if (m) return [`reader.singlesRight.pct.calibrated.${m[1]}`, "partner on all clips; ruler row is the held-out half"];
  m = k.match(/^ruler\.reader\.singlesRight\.pct\.lower2\.(\w+)$/);
  if (m) return [`reader.singlesRight.pct.voice2stLower.${m[1]}`, "partner on all clips; ruler row is the held-out half"];
  m = k.match(/^toneAcc\.(.+)\.new\.height[\d.]+$/);
  if (m) return [`toneAcc.${m[1]}.old.height0.15`, "same scorecard, old averages"];
  m = k.match(/^pairs46\.bothRight\.pct\.(?:old|ruler)\.textbook$/);
  if (m) return ["reader.pairsBothRight.pct.textbook", "production = split at silences only"];
  return null;
};
const fmt = (v) => (v == null || Number.isNaN(v) ? "—" : String(Math.round(v * 100) / 100));
const prodVal = (k) => (prod[k] ? prod[k].value : undefined);
console.log("# Brief 48 — scorecard, production vs new\n");
console.log(`Made by \`node src/dev/bench39/compare48.mjs\`. Production = brief 40 baseline (\`${PROD_COMMIT}\`, same pitch code as \`main\`). New = \`npm run bench\` on this branch (${rows.length} numbers, ${rows.filter((r) => r.result === "FAIL").length} FAIL). "—" = the row did not exist in production (added by briefs 42–46). Units: see the "allowed" column.\n`);
console.log("| number | production | new | allowed (vs this branch's baseline) | note |");
console.log("|---|---|---|---|---|");
let same = 0, moved = 0, added = 0;
for (const r of rows) {
  let p = prodVal(r.key);
  let note = "";
  if (p === undefined) {
    const pr = partner(r.key);
    if (pr && prodVal(pr[0]) !== undefined) {
      p = prodVal(pr[0]);
      note = `vs \`${pr[0]}\`: ${pr[1]}`;
    } else if (pr) {
      note = `partner \`${pr[0]}\` (new in 42–46)`;
    }
  }
  if (p === undefined) added++;
  else if (Math.abs(p - r.now) < 1e-9 || fmt(p) === fmt(r.now)) same++;
  else moved++;
  console.log(`| ${r.key} | ${fmt(p)} | ${fmt(r.now)} | ${r.allowed} | ${note} |`);
}
console.log(`\nRows: ${rows.length}. Same as production: ${same}. Moved: ${moved}. No production value: ${added}.`);
