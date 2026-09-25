# Brand assets

## Palette

The canvas palette is defined once, in `src/ui/tokens.css`, and read by
`src/render/palette.ts`. Any asset drawn here uses those values — an icon or a
share image in a different blue would not read as the same product.

| Token | RGB | Hex | Use |
|---|---|---|---|
| `backdrop` | 20, 24, 33 | `#141821` | canvas background |
| `surface` | 5, 7, 10 | `#05070A` | page background, `theme_color` |
| `accent` | 96, 205, 255 | `#60CDFF` | the player's pitch trail |
| `demo` | 235, 208, 170 | `#EBD0AA` | the reference contour — warm, so it never reads as the player's own line |
| `grid` | 150, 180, 215 | `#96B4D7` | Chao guide lines, always low alpha |
| `good` | 120, 230, 170 | `#78E6AA` | |
| `danger` | 255, 110, 110 | `#FF6E6E` | |

## The OG image

`public/og.png` (1200×630), drawn from `src/dev/og-source.svg`.

The picture is one Tone 3 gate: the corridor, the dashed ideal contour, and the
player's trail through it. **The trail deliberately does not match the target** —
it overshoots the dip, wobbles on the hold and rides late on the climb. That
mismatch is the product; a perfect trace would say nothing.

Two things in the source are not decoration and should survive an edit:

- The centreline is the *measured* T3 polyline from PRD §6 —
  `(0,3) (0.45,1.2) (0.72,1.2) (1,5)` — mapped through
  `y(chao) = 0.80H - ((chao-1)/4)*0.60H`. The **hold** at the bottom is what
  makes it read as ˇ rather than as a V, and it is what a real citation Tone 3
  does.
- Everything meaningful sits inside a 1000×500 safe area at `100,65`. Slack,
  iMessage and X each crop the edges differently. Text stays ≥21px, because
  feeds render the image at roughly 500px wide.

The copy says *tone contour trainer*, never *pronunciation checker*. Humming
beats the game and v1 has no syllable verification (PRD §11).

### Regenerating it

macOS-only; needs Chrome and ffmpeg. Chrome rather than `sips` because `sips`
does not render the SVG filters, so the glow comes out flat.

```bash
python3 - <<'EOF'
s = open('src/dev/og-source.svg').read()
open('/tmp/og.html','w').write(
  '<!doctype html><meta charset="utf-8">'
  '<style>html,body{margin:0;padding:0;background:#141821}svg{display:block}</style>' + s)
EOF
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --force-device-scale-factor=2 --window-size=1200,630 --screenshot=/tmp/og-2x.png /tmp/og.html
ffmpeg -y -i /tmp/og-2x.png -vf "scale=1200:630:flags=lanczos" -pix_fmt rgb24 public/og.png
```

Rendering at 2× and downscaling is what keeps the type clean.

After changing it, bump the `?v=` on the `og:image` URL in **both** `index.html`
and `app.html` — WhatsApp, Slack, X and iMessage all cache the image by URL for
weeks, so a replaced file at the same URL keeps showing the old card. WhatsApp
also caches the preview per *page* URL; to check a change, paste a URL it has
never seen (e.g. `https://flappytone.com/?x=1`), and use Facebook's Sharing
Debugger ("Scrape Again") to refresh Meta's server-side copy.

## The icons

The icons are the OG image's art re-fitted to a square: the Tone 3 corridor,
the dashed ideal contour, the player's trail and Pip at its head. The trail, not
the bird, is the subject — the trail is what the product is (PRD §8).

There are two sources, one artwork:

- `src/dev/icon-source.svg` — the detailed version, for every home-screen icon.
- `public/favicon.svg` — the browser-tab icon, simplified for 16–32px: no dashed
  contour or wall strokes, a thicker trail, a bigger Pip. At tab size the
  detailed version's lines fall below a pixel.

`npm run make-icons` rasterises the PNGs from them (`icon-32.png` from the
favicon, the rest from `icon-source.svg`). The PNGs are committed;
re-run only when the mark changes.

| Output | Purpose |
|---|---|
| `icons/icon-32.png` | tab fallback for anything that will not take an SVG favicon |
| `icons/apple-touch-icon.png` (180) | iOS home screen |
| `icons/icon-192.png`, `icon-512.png` | manifest, `purpose: any` |
| `icons/icon-maskable-512.png` | manifest, `purpose: maskable` |

Three constraints on the artwork, all of which the current files satisfy:

- **Opaque, edge to edge.** iOS composites a transparent home-screen icon onto
  black, which would turn the glow into a black notch.
- **The mark runs close to the edges on purpose** — Pip sits in the top-right
  corner, where the climb ends. That is a choice in favour of legibility, and it is why
  `maskable` gets its own file rather than sharing `icon-512.png`: the launcher
  crop would cut the bird off. `make-icons` insets the maskable variant to 72%,
  inside the 80% safe circle the spec guarantees.
- `rasteriseMark()` hard-codes each source's `width="32" height="32"` in a regex
  and **throws** if it does not match, so a redrawn mark at another viewBox
  means updating that line.

Chrome renders it, not `sips`: `sips` ignores SVG filters, so the glow the mark
is built from came out flat.

