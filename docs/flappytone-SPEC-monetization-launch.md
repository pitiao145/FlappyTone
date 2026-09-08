# FlappyTone — Tiers and Payment Spec

**Status:** Phases 1–4 shipped · **Branch:** `feat/tiers-payment` · **Written:** 8 Sep 2026 · **Updated:** 8 Sep 2026
**Goal:** ship a paid beta to Reddit — guest/free/pro tiers, real accounts, and a working Lemon Squeezy checkout, with the game itself kept free and shareable.

## How to use this spec (for the coding agent)
This is the **overarching context**. Do NOT implement it all at once. Work **one phase at a time**, in order. For each phase: read this file, read the cross-referenced source files, then produce a **separate detailed plan** for that phase only, implement it, and stop for review before the next phase. Each phase is independently testable.

---

## Product model (the decisions this spec encodes)

Three identity states, two gates:

- **Guest** (anonymous, no signup): full game, calibration, share, local progress only, leaderboard teaser (they see their place in the LB only, cannot join). **3 runs/day.** Free visualiser only (explore/hum, no per-tone practice).
- **Free account** (email signup): everything guest has **+ saved/synced progress + real leaderboard entry with generic name + basic stats. ~10 runs/day.** Per-tone visualiser practice, **~5 words per tone**.
- **Pro / EarlyBird** (paid, $19 lifetime beta): **unlimited runs**, every word, full history & trends, tone-shape analysis, weekly leaderboard with their real name, customization, all "SOON" features as they ship.

Gate 1 (guest→free) = **runs cap + persistence**. Gate 2 (free→pro) = **depth, content, customization** — NOT run quantity.

Positioning: sold honestly as **beta** — "core live now, more ships weekly, price rises after beta, refund anytime." Lifetime EarlyBird only; **no subscription and no free trial yet** (both belong to the post-beta phase).

---

## Current codebase state (cross-reference)

> **Historical, as of 8 Sep 2026 before any of this was built.** Phases 1–4
> have since shipped and most of what follows is now out of date — it is kept
> as the starting picture the plan was written against. For what the code
> actually does today, read CLAUDE.md and `docs/PRD.md`, which were brought
> level after Phase 4.


- **Entitlement seam: does NOT exist.** No `has_access`, no tier concept anywhere.
- **Run cap:** `src/game/dailyLimit.ts` — flat 5/day, localStorage only, **device-local, not tier-aware**. Consumed in `src/app/GameApp.tsx` (`dailyLimitReached`), shown in `src/ui/Profile.tsx`, `src/ui/GameOver.tsx`.
- **Auth: ~80% built but dev-gated.** `src/data/account.ts` = anonymous→email **upgrade-in-place** (identity preserved), per-tone stats sync. `src/data/supabase.ts`, `api/auth.ts`. UI is dev-only: `src/dev/AccountCard.tsx`. Method = **magic-link/OTP only** (no password).
- **Plan copy:** `src/ui/plan.ts` (FREE_FEATURES / PRO_FEATURES) — currently says "5 runs, all words"; **contradicts the new tiered model, must be rewritten**.
- **Paywall UI:** `src/ui/EarlyBirdModal.tsx` — Pay button hard-disabled; only newsletter capture works (`src/ui/useNewsletterSubscribe.ts`, `api/newsletter.ts`).
- **Leaderboard:** built — `src/ui/Leaderboard.tsx`, `src/ui/JoinBoardModal.tsx`, `src/data/leaderboard.ts`, `api/score.ts`. Free/paid split + ISO-week exists.
- **Payment: nothing.** No Lemon Squeezy code, no webhook.
- **Words/visualiser:** `src/game/words.ts`, `src/ui/Visualiser.tsx`.

---

## Supabase setup — how it constrains this plan (read before Phase 1)

The current backend is already live and its **write model is deliberate**; `has_access` must fit it, not fight it. Existing tables (`src/data/database.types.ts`): `profiles`, `leaderboard_scores`, `tone_stats`. Two write paths already coexist and set the pattern:

- **Client-written, RLS-guarded:** `profiles` (policy `auth.uid() = id`, plus `prof_update` keyed on the `is_anonymous` claim) and `tone_stats` (client upsert). The player owns and writes these rows directly.
- **Server-only:** `leaderboard_scores` has **no client write policy at all** — only `api/score.ts` writes it, holding the service-role key (server env, never bundled). `user_id` comes from a verified `auth.getUser(token)`, never the request body.

**The single non-negotiable rule for `has_access`:** it is **contestable** (it unlocks paid value), so it must be treated like a score, NOT like a profile field. If `has_access` were a column on `profiles`, a player could flip it to `true` from devtools in one call and self-grant Pro, because `profiles` is client-writable. Therefore:

- **`has_access` is server-written only, client-readable only.** Recommended: a new `entitlements` table (`user_id`, `has_access`, `source`, `updated_at`) following the `leaderboard_scores` pattern — RLS allows a player to **select their own** row, and there is **no client write policy**. Only the Lemon Squeezy webhook (Phase 4, service-role key like `api/score.ts`) writes it. Do **not** add `has_access` to `profiles`.
- **`getTier()` (Phase 1) reads that flag client-side for UX gating only.** Client-side gates (runs/day, words, visualiser) are soft UX nudges, never security — same stance `dailyLimit.ts` already documents. The server-written flag + RLS is the real Pro boundary; nothing of value is unlocked purely by a client-side tier read.

**Identity model already in place (do not re-architect):** lazy **anonymous** sign-in on first board-join (`supabase.ts` `ensureAnonSession`), then **upgrade-in-place** to a permanent account via `updateUser({ email })` — the `auth.users` id never changes, so scores/stats carry over with no "claim guest rows" step (`account.ts`). Phase 2's email+password must preserve this: attach credentials to the **existing** anonymous user, never sign into a fresh one.

**Supabase Auth settings this depends on (dashboard, not code — verify per environment):**
- "Anonymous sign-ins" **enabled** (already required by the leaderboard).
- **Email+password provider enabled** for Phase 2; decide the email-confirmation setting (confirm-on-signup vs. allow-then-verify) and state it, since it changes the signup UX.
- `has_access` / `entitlements` table created with the select-own / no-write RLS **before** Phase 4 wires the webhook.

**`database.types.ts` is generated** — regenerate it after any schema change (new `entitlements` table, `marketing_consent` column) so the client stays typed.

## PHASE 1 — Entitlement seam + dev toggle ✅ SHIPPED
**Why first:** everything downstream reads this. Without it, gates get hardcoded and rewritten twice.
**Deliverables:**
- New module (e.g. `src/data/tier.ts`) exposing `getTier(): 'guest' | 'free' | 'pro'` and a React hook `useTier()`, derived from **account status** (`getAccount()` in `account.ts`) **+ a `has_access` flag** (see Phase 3 for where the flag comes from; stub it now).
- A **dev toggle** (extend `src/dev/` / TuningPanel) to force any tier locally, so all later phases are testable without real auth or payment.
- Central tier config: runs/day per tier (guest 3, free 10, pro ∞), words-per-tone per tier, feature flags. One source of truth.
**Done when:** flipping the dev toggle changes `useTier()` and nothing else reads tier state directly.

## PHASE 2 — Auth to production ✅ SHIPPED
**Why:** the guest→free boundary needs real, persistent accounts.
**Deliverables:**
- Un-gate the account UI out of `src/dev/AccountCard.tsx` into the real app (Profile/Settings).
- Add **email + password** signup/login alongside the existing upgrade-in-place flow in `account.ts` (keep magic-link as secondary; do NOT make it primary — round-trip breaks in webviews, same class as the LINE mic bug). One provider set; Google OAuth is a post-launch fast-follow only.
- **Marketing opt-in:** one **unchecked** checkbox at signup ("Email me product updates — optional"). Store `marketing_consent` (boolean + timestamp) on the profile row. Account creation must not be conditional on it. Sync consented emails to the newsletter store (`api/newsletter.ts` path).
- Wire `useTier()`'s guest/free boundary to real auth state.
- **Automatic local→profile sync on signup.** The local-storage aggregates must merge into the profile **automatically** the moment an anonymous user upgrades to a real account — no manual step. Call `syncAccount()` (`src/data/account.ts`) on the success of the email-upgrade flow (`startEmailSignIn` → confirmation), and **remove the manual "Sync" button** (`handleSync` in `src/dev/AccountCard.tsx`). Keep the never-throw + merge-by-max contract intact (a failed sync must leave local data authoritative). Sync stays idempotent so a later sign-in on a new device still merges cleanly.
**Done when:** a player can sign up (email+password), it persists across logout + devices, progress syncs, and consent is recorded.

## PHASE 3 — Gate the app against `useTier()` ✅ SHIPPED
**Why:** biggest surface area; fully testable with the Phase 1 dev toggle, no payment needed.
**Deliverables:**
- Convert `dailyLimit.ts` + `GameApp.tsx` run cap from flat 5 to **tier-driven** (3/10/∞).
- Visualiser (`Visualiser.tsx`): guest = free explore only; free = per-tone practice, ~5 words/tone; pro = all words. Source limits from Phase 1 config.
- Words (`words.ts`): enforce per-tier word availability.
- Leaderboard (`Leaderboard.tsx`): confirm free = teaser (top-3 + own rank), pro = full board.
- Progress/Profile (`Progress.tsx`, `Profile.tsx`): keep "SOON"/locked previews reading tier.
- Rewrite `plan.ts` (FREE_FEATURES / PRO_FEATURES / FREE_SUMMARY) to match the tiered model.
- Every lock opens the **two-door modal** (`EarlyBirdModal.tsx`): "Upgrade" + "Join mailing list". Instrument both per lock location (PostHog events).
**Done when:** with the dev toggle, all three tiers show correct gating end-to-end and copy is consistent.

## PHASE 4 — Wire Lemon Squeezy ✅ SHIPPED
**Why:** small, because Phase 3 already reads `has_access` everywhere.
**Deliverables:**
- Enable the Pay button in `EarlyBirdModal.tsx` → Lemon Squeezy hosted checkout (require sign-in first, so the purchase attaches to a real account).
- New webhook endpoint (e.g. `api/webhook-ls.ts`, service-role key like `api/score.ts`): on `order_created` → set `has_access = true` for the matching user; on refund/chargeback → set `false`. `has_access` lives on the profile row, RLS on.
- `getTier()` (Phase 1) now reads the real flag.
**Done when:** one real $19 purchase flips the account to Pro automatically, a refund flips it back, verified on a real phone.

## PHASE 5 — Pre-launch hardening

Split after Phase 4, once the payment loop was verified end to end on a
preview deploy. What remains divides into things that block a paid launch and
things that are polish.

### 5a — Launch gates (must be green before the paid Reddit push)

- **TOS + Privacy Policy updated.** Lemon Squeezy as merchant of record,
  Supabase as processor, accounts + data stored, mailing-list consent.
  Tracked as a Notion task.
- **Production environment variables.** Production currently has **no Supabase
  and no Lemon Squeezy variables at all** — the whole backend is unconfigured
  there, and everything built in Phases 1–4 is inert on `flappytone.com`.
  Needs, in the Production scope: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_LEMONSQUEEZY_CHECKOUT_URL`,
  `LEMONSQUEEZY_WEBHOOK_SECRET`.
  **Going live is not just a deploy:** the Lemon Squeezy store has to be
  switched to live mode, with its own webhook pointed at
  `https://flappytone.com/api/webhook-ls` and its own signing secret. A
  test-mode secret will not verify live payloads, and the failure looks like
  the webhook silently doing nothing.
- **Supabase dashboard settings** (settings, not code — see CLAUDE.md's
  "Before accounts go live"):
  - **Custom SMTP.** Mandatory. The built-in sender allows roughly two emails
    an hour project-wide and is documented as unfit for production. Password
    reset is unusable without it, and reset is the only recovery path a player
    has, since email confirmation is deliberately off.
  - **Leaked-password protection** (Auth → Passwords). Was harmless while auth
    was magic-link only; password sign-in now ships, so it is real. Currently
    the only outstanding security-advisor warning.
  - **Redirect URLs allowlisted** per origin — production, previews, and
    localhost. An unlisted redirect is silently replaced by the Site URL,
    which is `/`, the marketing entry that ships no Supabase code: the
    confirmation succeeds server-side and the browser never notices.
  - **Re-run `get_advisors`** (security *and* performance) after the first real
    signups; some lints only appear once tables hold data.

### 5b — Deferred to a later session

- **Full loop test on a real phone**: guest → signup → gated → pay → unlocked
  → logout/other device → still Pro. The desktop loop was verified on a
  preview deploy on 8 Sep 2026 (purchase granted, refund revoked, all four
  tables consistent). The phone leg is the untested one, and it is where the
  mic gesture and the checkout tab round-trip actually get exercised.
- **Landing page**: pricing/beta section, the "no AI" line, confirm the
  `?ref=` / `?openExternalBrowser=1` share defaults.
- **Leaderboard tweaks/polish.**

**Done when:** 5a is fully green. 5b is not a launch gate.

## Explicitly OUT of scope for launch
Mascot roster · full trends/tone-shape charts (stay as SOON previews) · subscription SKU / monthly pricing · 7-day trial · tone-hint "why wrong" feature · iOS/Capacitor · Google OAuth (fast-follow if analytics show signup drop-off).
