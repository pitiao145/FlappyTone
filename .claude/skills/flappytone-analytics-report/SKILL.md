---
name: flappytone-analytics-report
description: Use when Pierre asks for FlappyTone analytics, a daily or weekly traffic report, PostHog numbers, real visitors, where visitors came from, landing-page or CTA click-through, signups, demo ("Try it now") plays, or how many people played — for any date range.
---

# FlappyTone analytics report

One query classifies every visitor (`pierre` / `bot` / `bounce` / `real`) and returns each journey in one row. Build the report from `real` rows only, then cross-check accounts in Supabase. Read-only: no insights, dashboards, cohorts or file edits.

## Steps

1. **Window.** Default: yesterday as a Taipei calendar day. Turn "since Friday", "this week" etc. into Taipei days.
2. **Render the query:** `python3 -I .claude/skills/flappytone-analytics-report/render.py [first-day] [last-day]` (dates `YYYY-MM-DD`, Taipei, last day inclusive). It prints the UTC bounds on stderr.
3. **Run it** with the PostHog MCP `exec` tool, project 426310: `call execute-sql {"query": "<rendered text, unchanged>"}`. The PostHog server first wants `learn analytics` and `metric-list`; the catalog is empty, so go straight to this query after. More than 500 rows → run one day at a time.
4. **Run `supabase.sql`** on Supabase project `vtctkvvxzetbgfsdbpvh` with the same bounds (`'YYYY-MM-DD HH:MM:SS+00'`).
5. **Merge** rows that share an `ip`: one person, several devices or IDs (often an Instagram in-app browser, then the phone's own browser). A `bounce` row that shares an `ip` with a `real` row joins that person. Count people after the merge. Take the source from the earliest row.
6. **Link accounts:** a signup is a Supabase `new_account`; match it to the row whose `signup_completed` fired within about 60 s. A `signup_completed` with no matching `new_account` was a login to an old account: do not count it. Pierre's accounts (ToneMaster, BrightKite15) never count.
7. **Write the report** in the format below.

## What the query decides

| class | Rule | Why |
|---|---|---|
| `pierre` | Any event in the last 90 days from Yilan, from an IP used in Yilan, on a `flappy-tone*.vercel.app` preview, or in the internal cohort | Pierre lives in Yilan. His phone sometimes shows as Taipei; the shared IP catches it. The PostHog "Internal / Test users" cohort holds only his old devices |
| `bot` | PostHog bot flag on a **page view**, a Meta IP (link previews from Instagram/Facebook posts), or a cloud IP (AWS, Google Cloud, Scaleway) | PostHog misses Meta previews and flags real players' pre-2026-10-29 app events as "Automation" |
| `bounce` | 1 page view, under 10 s, no click, no tool, no app event | Person or bot: cannot tell. Count only |
| `real` | Everything else | Report these |

Domain: only people with a `$pageview` on `flappytone.com`. Their app events without `$host` (before the 2026-10-29 deploy) still count. Other hosts (easycard, pierrebuilds.dev) share the project; never include them.

## Report format

Write these sections, in this order:

1. **Headline:** one sentence with real people, how many reached `/app`, signed up, played a game, opened the demo, paid.
2. **Funnel table:** real people → clicked a CTA → reached `/app` → saw signup → signed up → mic OK in the app (`reached_app` and `mic_ok > 0`) → played (game run) → hit daily limit → earlybird click → paid.
3. **By source:** source (utm_source, else referrer, else "direct") | people | entry pages | reached app | played.
4. **By landing page:** entry path | people | clicked a CTA | reached app.
5. **CTAs clicked:** `cta@location` (landing), `page:cta` (SEO), `tool:placement` (tool and demo end screen), tone test `app_open` | people who clicked | people who then reached the app.
6. **Demo ("Try it now"):** opened | finished | end-screen button chosen | went on to signup.
7. **Journeys:** one line per real person: place/device, new or returning, source → entry page → CTAs → app steps → runs/best score.
8. **Accounts (Supabase):** new accounts, runs, leaderboard, entitlements (purchases), feedback.
9. **Excluded:** counts for pierre, bot (by reason) and bounce.
10. **Notes:** anything odd. Include `n` beside every percentage; with fewer than 20 people, give counts only.

Never print IP addresses or Supabase user ids. Display names (CleverKite98) are fine.

## Field guide

| Question | Column / event |
|---|---|
| Where from | First match: `utm_source` (+ `utm_campaign`) → `social_hint` (`instagram`/`facebook` in-app browser, or `fbclid`) → `first_ref` → "direct" (`$direct`). `first_ref = flappytone.com` with `entry_path = /app` means the landing page view was lost in an in-app browser handoff; trust `social_hint` |
| First page | `entry_path`; `seo_src` = site page whose CTA sent them to `/app` |
| Landing buttons | `landing_ctas`: `play@hero_actions`, `try_demo_link@hero_actions`, `try_now@hero_demo`, `visualiser@…`, `tone_pairs@tone_pairs`, `try_<mode>@options`, `pricing@pricing_pro`, `play@try_now_done` |
| Demo | `demo_opened`, `demo_finished`, `demo_ctas` (`demo_gameover_signup` / `_retry` / `_pairs`) |
| Free tools | `tools`: `tone-test:*`, `tone-visualizer:*`; `app_opens` = tone test's button into `/app` |
| Signup wall | `auth_screens` (`signup`/`login`); since 2026-10-29 `/app` needs an account |
| Played | "Played" = `game_runs ≥ 1`. `tutorial_runs` only = "tutorial only". Also `best_score`, `mic_ok`, `calib_done`; `mic_denied > 0` with `mic_ok = 0` = blocked the mic and could not play (name it in Notes); reached `/app` with both 0 = never asked for the mic |
| Which browser | `in_app`: `none` = normal browser, else the app (`instagram`, `line`, `facebook`, `x`, `google-app`, `threads`, `wechat`, `tiktok`, …, `webview-android`/`webview-ios`). From the `in_app_browser` super property since brief 27; before it, from the first page view's user agent with the same rules as `src/lib/inAppBrowser.ts` |
| Installed app (PWA) | `display_modes`: `['standalone']` = opened from the Home Screen, `['browser']` = a tab, both = used both. An iOS Home Screen launch shows `in_app = webview-ios`; trust `display_modes`. `[]` before the display-mode deploy. Person property `first_standalone_at` = first Home Screen launch; event `pwa_installed` = Android/desktop Chrome install only |
| Mic trouble | `mic_ok`/`mic_denied` count the game only (`surface = app`; before brief 27 the demo and visualizer were mixed in). `mic_perm_first` = browser permission before the first request (`prompt`/`granted`/`denied`/`unsupported`). `mic_errors` = `surface:error_name` per failure (`NotAllowedError` = blocked, `NotReadableError` = mic used by another app). `mic_help` = `surface:reason:action` from the help panel (`reload`, `try_again`, `open_external`, `copy_link`). To compare "only denied" by browser, group `mic_denied > 0 AND mic_ok = 0` by `in_app` |
| Money | `daily_limit`, `earlybird_shown`, `earlybird_clicks`; purchase = Supabase `entitlement` row |

## Pitfalls

- **Time zone:** the PostHog project is in UTC, so the bounds from `render.py` are UTC. Report times in Taipei time.
- **Run counts:** use PostHog `game_runs`. Supabase `run_log` keeps only the latest 5 runs for a free account (Pro keeps all).
- **Site-page CTAs** (`seo_cta_click`, the tone test's and the visualizer's buttons) are tracked only from 2026-10-29. Before that, a tool page → `/app` path shows in `paths` with no CTA.
- **`feedback_submitted`** may not exist in PostHog yet (no one has sent it). The query still works; ignore the warning.
- **New or returning:** `returning` = a `flappytone.com` page view in the 90 days before the window.
- **A lone `$pageleave`** with no page view is a stale tab. The query drops it; do not add it back.
- **Source on returning people** is the source of this visit, not their first visit ever.
- **`perm_before`, `error_name`, `mic_help`** exist only from the brief-27 deploy; earlier rows show `(null)` / `[]`. PostHog warns that they are not in the taxonomy until the first event arrives; ignore it.
- **Edit the rules only in `journey.sql`.** If you find a new bot pattern or a new Pierre device, change the query, re-run it on a known day, and say so in Notes.
