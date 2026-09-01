# SPEC — Post-run feedback prompt

## What
A single tap-only feedback prompt, shown at most once a day, after the 3rd run of the day, on `GameOver`. No free-text field in the game — the game has no text input today (`session.ts`'s privacy invariant) and this doesn't change that.

## Trigger
- Show on `GameOver` when: `runsToday >= 3` AND no feedback prompt has been shown yet today.
- "Today" = local calendar day, same convention as `dailyLimit.ts`.
- Track last-shown via a small localStorage entry (key/version convention matching `settings.ts` / `dailyLimit.ts`), storing only `lastShownDate` — nothing about the answer itself needs to persist locally, it's sent to analytics.
- If the user dismisses without answering, still mark it shown for today (don't re-nag same day).

## UI
- A small, low-friction card/banner on the `GameOver` screen (same visual weight as the existing recalibration-suggestion card — not a blocking modal).
- Copy: "How's it feeling?" + 4 tappable chips:
  - 🎯 Felt great
  - 🎙️ Calibration felt off
  - 😴 Too easy
  - 💥 Too hard
- Tapping a chip: fires the analytics event, shows a brief "thanks!" acknowledgement, auto-dismisses. No confirm step.
- Below the chips, one small link: "More to say? Email me →" as a plain `mailto:` link (pierre@pierrebuilds.dev). This is the escape hatch for anything a tap can't capture — don't build an in-app text box for it.
- Dismiss (✕) always available, no penalty.

## Data / analytics
Add to `AnalyticsEvent` in `src/analytics/session.ts` (closed union, same pattern as existing variants):

```ts
| { type: "run_feedback"; sentiment: "great" | "calib_off" | "too_easy" | "too_hard"; mode: RunMode }
```

- `mode` = the `RunMode` of the run that just ended (Normal / Tone Drill / Learn) — lets Pierre separate signal per mode later.
- Update `posthog.ts`'s `before_send` allowlist and `session.test.ts` to include the new variant, per the existing convention — this is a required step, not optional, per `CLAUDE.md`'s analytics rules.
- No PII, no free text, no audio — same invariants as every other event in this file.

## Explicitly out of scope for this pass
- No in-app free-text feedback box.
- No server-side storage of individual responses beyond what PostHog already captures.
- No changes to `dailyLimit.ts`'s run-count logic itself — only reads `runsToday`.
