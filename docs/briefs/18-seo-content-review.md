---
status: done
notion_task: https://app.notion.com/p/40035e5140dd8146b0d1d21b8f722da3
risk: low
---
# 18 Run the SEO content review on every public page (report only)

## Goal
Run the `seo-content-reviewer` agent (built in brief 17) on every public SEO page and produce one
ranked findings report for Pierre and a separate list for Jane. Fix nothing. A later brief applies
the fixes Pierre approves.

## Context / files to read first
- `docs/briefs/reports/17-seo-content-reviewer.md` (what was built, the 2 known mismatches, the trial output).
- `.claude/agents/seo-content-reviewer.md`, `docs/seo-review/rubric.md`, `taiwan-conventions.md`, `sources.md`.
- `CLAUDE.md` (hard rule 9; never "Pip", never "Jane" in public copy).
- Run in a NEW session so the agent is loaded (check `/agents` lists `seo-content-reviewer`). If it is
  not listed, set `blocked` and say so; do not substitute a general agent.

## Pages (13)
`/chinese-tones`, `/tools/tone-marks`, `/tools/tone-visualizer`, `/tools/tone-test`, `/say`, and
`/say/thank-you`, `/say/hello`, `/say/goodbye`, `/say/please`, `/say/sorry`, `/say/youre-welcome`,
`/say/no-problem`, `/say/yuan`. Exclude `/`, `/privacy-policy`, `/terms-of-service`, `/app`.

## Work
1. Run `npm run seo:check-pinyin -- --notes`; save the full output for the report.
2. Invoke `seo-content-reviewer` once per page (13 calls; several may run in parallel). Each prompt
   names the page, its source files (page component, `sayWords.ts` record, `routes.ts` / `SAY_META`
   entry, `jsonLd` export) and asks the agent to ALSO:
   - trace every CTA and internal link to an existing route in `routes.ts` (or `/app?src=…`);
   - check product claims against `docs/ARCHITECTURE.md` and `src/game/tiers.ts`;
   - fetch MOE for every word a language finding rests on.
   `/say/thank-you` was trialled in brief 17; review it again with the link/CTA tracing added.
3. Merge results. Drop exact duplicates; keep cross-page patterns as one finding listing all pages.
4. Spot-check: for 3 random Confirmed findings, re-open the cited source yourself and verify it says
   what the finding claims. Record the result; downgrade any that fail to Plausible.

## Constraints
- Report only. No edits to `src/`, copy, routes or the agent. No push/deploy, no dependency, no DB.
- Do not edit the reviewer docs to "fix" the agent mid-run; note prompt problems under Follow-ups.
- Never quote MOE or other pages at length (short quotes only).

## Acceptance checks
- All 13 pages reviewed (list each with its finding count), or the missing ones named with a reason.
- Every finding has page, quote, issue, severity, source, label (format from the agent file).
- The 2 known mismatches (拜拜 `sayWords.ts:248`, 對不起 `sayWords.ts:336`) appear in the report.
- Spot-check result recorded.

## Report back with
- Summary counts: findings by severity × label, and per page.
- **High** findings first, then med, then low, each with the one-line suggested fix.
- **For Jane**: every "Needs native speaker" item as a short question with both options
  (e.g. "拜拜: bāi bāi or bài bài on the page?"), ready to paste to her.
- Cross-page patterns (e.g. a repeated sandhi or 注音 convention issue).
- Agent/prompt problems seen (false positives, missed checks) for a later reviewer tweak.
- A proposed brief 19 scope: which fixes are safe to apply without Jane, which wait for her.
