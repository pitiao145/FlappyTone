# Profile redesign — handoff

Redesign the **Profile tab** (`src/ui/Profile.tsx` + `src/ui/AccountCard.tsx`, styles in `src/App.css`) to the "Hero banner" direction (option **2a** in the design doc). Scope: the Profile content column only — do **not** touch `GameNav`/shell. All colors, fonts, radii, and shadows already exist as tokens in `src/ui/tokens.css`; reference them, add no new literals.

## Structure (top → bottom)

1. **Hero identity banner** — replaces the current `.profile-identity` block and the `<h2>Profile</h2>` header.
   - Full-bleed band (negative margin to card edges), `background: linear-gradient(150deg, var(--accent), var(--accent-bright))`, text `var(--accent-ink)`.
   - Eyebrow `PROFILE` (11px, 700, letter-spacing .14em, opacity .75).
   - Row: **bird avatar left** + name column.
     - Avatar: 52px circle, pale-jade fill, `public/Bird-hor-halo.png` inset ~78%, border `rgba(247,241,227,.5)`.
     - Name: `displayName()`-derived label — `"Guest player"` for guest, the account **email** when signed in (`var(--font-display)`, 600, truncate with ellipsis).
     - Pill row: board-name pill `@{boardName}` (paper-tint bg `rgba(247,241,227,.2)`) + plan label (`Guest plan` / `Free plan` / `EarlyBird Pro`).
   - **Pro only:** a `★ PRO` beak-colored badge pinned top-right; avatar border uses `var(--beak)`.

2. **Account card** (`AccountCard.tsx`, keep all existing auth logic/handlers):
   - **Guest (anonymous/signed-out):** card titled "Save your progress" — Email + Password fields, primary `Create account`, secondary links `Email me a link` / `Log in`. (Keep the existing signup/login mode toggle behavior; visually it can collapse to the create-first layout shown.)
   - **Free (signed in):** "Board name" row showing `displayName()` with a muted `Pro to rename` tag; `Sign out` link below a hairline.
   - **Pro (signed in):** editable board-name input + `Rename` button (existing `renameAccount` flow); `Sign out` below.

3. **Plan card** — keep `useTier()` + `loadDailyRuns()`:
   - Header "Daily runs" + tier badge (`.badge-free`).
   - Usage bar (`.teaser-bar` / `.plan-usage-bar`), `daily.count / daily.limit` (∞ for pro).
   - One-line plan summary note (`GUEST_SUMMARY` / `FREE_SUMMARY` / "everything, current and future").

4. **EarlyBird upsell** — render only when `tier !== "pro"`. Replace the tall bordered hero with a **calm one-line sticker card**:
   - `box-shadow: var(--shadow-sticker-pro)` (beak), border `var(--beak)`, bg `color-mix(in srgb, var(--beak) 8%, var(--surface-panel))`.
   - Left: `EarlyBird · $19 once` + one-line benefit; right: `→`. Whole card triggers `onEarlyBird("plan_card")`.
   - Keep the full feature list + `PRO_FEATURES` for the EarlyBird **modal**, not this card.

5. **Pro celebration** — when `tier === "pro"`, in place of the upsell: a centered card, "Thanks for being an EarlyBird 🎉" + "Everything's unlocked — current and future." Otherwise keep the Pro screen minimal.

## Conditional matrix

| Block | Guest | Free | Pro |
|---|---|---|---|
| Banner name | "Guest player" | email | email |
| Banner badge | — | — | ★ PRO |
| Account card | signup/login form | signed-in, rename locked | signed-in, rename enabled |
| Plan badge/limit | Guest · 0/3 | Free · 0/10 | Pro · ∞ |
| EarlyBird card | shown | shown | hidden |
| Celebration | — | — | shown |

## Notes
- Data sources unchanged: `useTier`, `useSessionVersion`, `getAccount`, `loadDailyRuns`, `displayName`, `plan.ts` copy constants.
- Keep `DevTierCard` (dev-only) exactly as-is.
- New CSS: add classes under the `/* progress & profile */` section of `App.css`; reuse `.badge`, `.teaser-bar`, `.progress-card`, `--shadow-sticker-pro`. No new color values.
- Visual reference: option **2a** in `Profile Redesign.dc.html` (guest/free/pro columns).
