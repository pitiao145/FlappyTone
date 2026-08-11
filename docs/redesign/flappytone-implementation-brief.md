# FlappyTone — Ink Tones Implementation Brief

This assumes the mockups (`flappytone-mockup-ink.html` for the landing page, `flappytone-mockup-gameplay-ink.html` for the play screen) as the visual target, and `flappytone-fix-brief.md` as the open bug list. A useful property of this direction: fixing the bugs and applying the redesign are largely the same work, not two separate passes. Sequence it that way.

---

## 0. Before touching styles: confirm the render approach for the game screen

The mockup draws the corridor and player dot as SVG for portability, but the real game likely renders to `<canvas>` for performance (worth confirming — check for a `<canvas>` element in the play route). If it's canvas:

- Corridor fill/stroke, dot color, and grid lines all need to move from hardcoded hex values in the drawing code to the same token values defined in step 1, so canvas and DOM never drift out of sync.
- Canvas equivalents of the mockup's soft glow (`box-shadow` on `.player-dot`) are `ctx.shadowColor` / `ctx.shadowBlur` — set `shadowColor` to the vermillion token at ~50% alpha and `shadowBlur` around 16–20px before filling the dot.
- The corridor's tapered-stroke look (`stroke-linecap: round`, low-opacity fill behind a brighter stroke) translates directly: draw the fill path first at ~9% opacity, then stroke the same path at full jade opacity with `ctx.lineCap = 'round'`.

If it's SVG/DOM already, the mockup markup is close to a direct port.

## 1. Ship the token file first

Before any component changes, add one CSS custom-properties file (or extend the existing global stylesheet) with the palette, type, spacing, and radius tokens below. This is also where fix-brief item **"no consistent font-family set at the base level"** gets closed — setting `font-family` on `html`/`body` here is what stops the app-menu and mobile-nav screens from falling back to Times.

```css
:root{
  --bg-canvas:#100d0e;
  --bg-surface:#181415;
  --bg-surface-raised:#211c1d;

  --jade:#3ea88f;
  --jade-dim: rgba(62,168,143,0.28);

  --vermillion:#e2543d;
  --vermillion-dim: rgba(226,84,61,0.25);

  --text-primary:#f5f1ea;
  --text-secondary:#a79e93;
  --text-tertiary:#6f665d;

  --line: rgba(255,255,255,0.08);
  --line-strong: rgba(255,255,255,0.14);

  --radius-pill: 999px;
  --radius-md: 14px;

  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:24px; --space-6:32px; --space-7:48px; --space-8:64px;
}

html, body, #root{
  font-family: 'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: var(--bg-canvas);
  color: var(--text-primary);
}
```

Load `Fraunces` (headline/display face) alongside the existing `Hanken Grotesk` — both are on Google Fonts, same loading pattern already in use.

**Contrast check, done against the actual token values so it doesn't need re-verifying later:** text-primary on bg-canvas is ~17:1, text-secondary ~6.9:1, jade ~6.6:1, vermillion ~5.1:1 — all clear WCAG AA (4.5:1) for text use. Vermillion at small icon sizes (e.g., the pause-panel "Quit run" outline) is borderline for AA-large but fine as an outlined button with a text label, not color-only signal.

## 2. Consolidate the header and button components — this is where the "three apps" problem actually lives

Per the fix brief, the landing page, the app menu, and the mobile nav overlay currently ship as three separate implementations. Before reskinning each one individually, pull them into one shared component each:

- **One `<Header>`** used on every screen, taking a prop for which nav links to show (or none, for the in-game screen). Fixes both the visual-inconsistency bug and the redundant Play-dropdown-plus-hamburger issue on mobile — pick one nav trigger, not both.
- **One `<Button>`** with `variant="primary" | "ghost" | "outline-danger"`, replacing whatever separate button markup exists per-screen today. Maps directly to `.btn-primary` / `.btn-ghost` / `.btn-outline-danger` in the mockups.

Doing this before the visual reskin means the reskin is "restyle one component" instead of "restyle three screens," and it's the actual fix for the inconsistency bug, not a workaround.

## 3. Landing page

Port `flappytone-mockup-ink.html` section by section against the real content — hero, "How it works," the four tone-curve cards, Play/Visualiser cards, "What it doesn't do." All copy in the mockup is your real copy, so this should mostly be markup/class changes, not new writing.

Two things from the fix brief get resolved as part of this pass, not separately:
- **Sticky header clipping content on scroll** — add `scroll-margin-top: <header-height>` to every anchor-linked section (`#how`, `#play`, `#visualiser`, `#mobile`) while you're rebuilding this markup anyway.
- **Invisible tone-mark glyphs** — the mockup replaces the ˉ ˊ ˇ ˋ characters with small inline SVG strokes (see the four `.curve-cell svg` blocks). This is a direct fix, not a font swap — port those SVGs as-is or as a small reusable `<ToneMark tone={1|2|3|4} />` component.

The autoplaying demo widget (flaky across navigations, per the fix brief) should get its state-reset bug fixed as part of restyling it — same component, don't defer the reliability fix to "later."

## 4. Game screen

Port `flappytone-mockup-gameplay-ink.html`. Specifics worth calling out:

- **Status line at the bottom replaces the raw debug telemetry** that was visible in dev — "say **gāo** — hold it flat and high" is a real, user-facing hint using the same screen space, not a placeholder. If there's an existing per-tone hint string in the data model, wire it here; if not, this is worth adding as content (four short hints, one per tone, already drafted in the settings panel copy — "flat and high," "start mid, slide up," "dip low, then rise," "drop sharply, top to bottom").
- **Heart icons are SVG, not emoji or a font glyph** — gives consistent rendering across platforms and lets the outline/filled states use the exact vermillion token instead of relying on system emoji rendering.
- **The "listening…" badge with the animated waveform bars** is new relative to the current build (previously just a text badge) — small addition, but it's a good, cheap "the mic is live" signal that's currently missing.
- **The pause/settings overlay fixes the unstyled "home page" link** from the fix brief — it's now a proper `.btn-outline`, matched visually to "Quit run" (`.btn-outline-danger`) rather than sitting as bare text.
- **The frame + ambient background treatment** (the soft radial jade wash behind the phone-width frame) is the fix for "narrow fixed-width column with dead space on desktop" — the frame stays phone-shaped (that's fine, even correct, for this game), but it now sits inside a full-bleed stage that makes the width a deliberate composition choice instead of an accident. On mobile viewports, the frame should expand to fill the viewport as it does today; the ambient stage is a desktop-only treatment (see the mockup's `@media (max-width: 540px)` block).

## 5. Rollout order

1. Token file + base font-family (step 1) — ships immediately, fixes the Times-fallback bug on its own before anything else changes.
2. Shared Header/Button components (step 2) — no visual change yet if you keep current colors, just consolidates the implementation.
3. Reskin Header/Button to the new tokens — this is the moment the three screens visually converge.
4. Landing page port (step 3).
5. Game screen port (step 4).
6. Sweep: re-run through the original fix-brief list and confirm each item is closed, since most will already be closed as a side effect of the above.

Happy to re-audit the live page against both mockups once any of these land — screenshot diffing against the mockups is quick to do from here.
