# SPEC — Character roster (swappable mascots)

**Status:** proposed (7 Sep 2026). Build **after** the leaderboard. Coding-agent-ready.
**Goal:** let players pick their bird from a roster of Taiwan-snack mascots (滷肉飯鳥, 雞排鳥, 珍珠奶茶鳥, 小籠包鳥, …). One reusable "character database" drives the in-game bird **and** every UI surface (picker, Profile, share card). Bird customisation is already a listed Pro/EarlyBird perk in `src/ui/plan.ts`, so this is a share hook *and* a monetisation lever.
**NOT this phase:** new animations per bird, per-bird sound, procedural food-birds.

---

## 1. The core decision — one draw seam, images for the roster

Today the bird ("the Pip") is drawn **100% procedurally** in `src/render/scene.ts` → `drawPip()` (traces body/beak/belly/eye every frame). The roster birds are **illustrations** (PNwebP), not paths — you cannot hand-author them procedurally. So:

- **Introduce a single call, `drawCharacter(ctx, character, …)`**, that the game/UI use instead of calling `drawPip` directly. **This one seam is the "one code path"** — callers never branch on bird type.
- Internally the registry entry has a `kind`: `"image"` (all roster birds) or `"procedural"` (the Pip may stay this way transitionally). **Target end-state: everything is an image** (export the Pip too — its vector source already exists at `src/dev/og-source.svg`), collapsing to a truly single path. Shipping the food birds as images while the Pip stays procedural behind the same seam is an acceptable interim — the seam is what matters, not that both kinds exist for a while.
- **Effects stay procedural and character-agnostic.** The halo, success ring, hurt flash and trail in `drawPip`/`scene.ts` are drawn *around* the bird from tokens. Keep them; an image bird can't recolor itself green/red, but the effect layer already conveys success/hurt. So the swappable part is only the **body**; the juice is universal.

## 2. The anchor invariant (why scoring never changes)

`drawPip` authors the bird with the **beak tip at local (0,0) = the scoring anchor**, then does `translate(x, chaoToY(chao,height)) → rotate(angle) → scale(s)` so the bird tilts/scales about the beak tip without moving the scored point. **Every roster image must reproduce this**: the registry stores each sprite's **`beakTip {x,y}` in normalized [0..1] coords**, and `drawCharacter` positions the sprite so that point lands on the same anchor and rotates about it. Result: **scoring is byte-identical across all birds** — only the picture changes.

The prepared assets already carry these anchors (auto-detected as the rightmost opaque pixel): see `docs/bird-design/roster/anchors.json`.

## 3. The registry — `src/game/characters.ts` (the "database")

```ts
export interface Character {
  id: string;                 // "pip" | "lu_rou_fan" | "ji_pai" | "boba" | "xiao_long_bao"
  nameHant: string;           // Traditional only (hard rule 9): 滷肉飯鳥, 雞排鳥, …
  pinyin: string; nameEn: string;
  kind: "image" | "procedural";
  asset?: string;             // for image: URL to the webp (see §4)
  beakTip: { x: number; y: number };   // normalized anchor (from anchors.json)
  tier: "free" | "pro";       // gating (see §6)
  displayScale?: number;      // per-bird size tweak vs the Pip's footprint, default 1
  tiltFactor?: number;        // 0..1 damping of pitch-slope rotation, default 1 (see §7)
  accent?: string;            // token/hex for this bird's halo+trail tint, default current accent
}
export const CHARACTERS: Record<string, Character> = { … };
export const DEFAULT_CHARACTER = "pip";
```
Seed values for the three prepared birds (from `anchors.json`): `lu_rou_fan {0.999, 0.457}`, `ji_pai {0.999, 0.413}`, `boba {0.999, 0.556}`. `xiao_long_bao` pending a transparent re-export. Confirm `nameHant`/`pinyin` per bird before shipping.

## 4. Assets & authoring contract

- **Runtime home: `public/birds/<id>.webp`** (served static; one URL reused by canvas + every UI surface). Prepared sprites currently staged in `docs/bird-design/roster/` — move them to `public/birds/` when building.
- **512px square WebP, transparent, effect-free** (no baked shadow/glow — §1). Prep already done: trimmed, cleaned, squared.
- **Authoring contract for any new bird:** face right, one clear pointed beak as the rightmost point, square, transparent, consistent scale/padding. Then re-run the prep (trim + rightmost-opaque-pixel → `beakTip`) so anchors stay uniform. A tiny script did this for the first batch; keep it as `scripts/prep-bird.py` or similar so new birds are one command.
- Later, if the roster grows or goes premium, `public/birds/` → Cloudflare R2 is a drop-in swap (deferred storage plan). Bundle for now.

## 5. The draw seam — `drawCharacter` + decode-once

- **New `src/render/characters.ts`** (or extend `scene.ts`): `drawCharacter(ctx, character, height, chao, x, angle, state, voiced, now, …, width)`.
  - `kind:"procedural"` → delegate to `drawPip` unchanged.
  - `kind:"image"` → `ctx.save(); translate(x, chaoToY(chao,height)); rotate(angle * (tiltFactor ?? 1)); scale(s * displayScale)` then `drawImage(bitmap, -beakTip.x*w, -beakTip.y*h, w, h)` so the beak tip sits on (0,0); `restore()`. Size `s` off `pipHeightFrac(width)` exactly like `drawPip`.
- **Decode once, draw many (the one perf rule):** load each selected sprite into an **`ImageBitmap`** via `createImageBitmap()` ONCE (preload the roster or on selection), cache by id. **Never** create `Image`/decode per frame — `drawImage` of a cached bitmap is a single cheap GPU op. This matches the engine's existing "no per-frame allocation" discipline.
- **Call sites to switch** from `drawPip` to `drawCharacter(currentCharacter, …)`: `drawScene` (in-game, `scene.ts` ~L474/489), and the UI animations `src/render/pipAnimations.ts` (`drawSpinningPip`/`drawJumpingPip` via `src/ui/bird/PipCanvas.tsx`). Keeping the Pip `procedural` initially means these keep working untouched for the default bird.

## 6. Selection state — local-first, Pro-gated

- **Chosen id** in localStorage `toneflap.character.v1` (settings.ts key/version/validate pattern). Local-first for anon; **synced to the profile at signup** (same rule as all stats — see Supabase ARCH §1b).
- **Gating:** Pip (+ maybe one) `tier:"free"`; branded birds `tier:"pro"` (EarlyBird). "Bird customisation" is already in `PRO_FEATURES` (`src/ui/plan.ts`). Selecting a locked bird opens the existing EarlyBird two-door modal (`src/ui/EarlyBirdModal.tsx`).

## 7. Two design knobs
- **`tiltFactor`** — the Pip rotating about its beak looks great; a whole bowl tilting 30° may not. Damp per bird (Pip 1.0, bowl ~0.3–0.5). Eyeball each.
- **`displayScale`** — normalize felt size across differently-shaped sprites (a wide bowl vs a round dumpling).

## 8. Reuse surfaces (the payoff of one registry)
Same registry entry feeds: the **in-game bird** (ImageBitmap), a **character-picker** UI (new, likely in Profile/Settings — `<img src=asset>`), the **Profile** display, and the **share card** (`src/share/renderCard.ts` — swap the mascot it draws for the selected character). One source of truth, every surface.

## 9. Codebase anchors
| Work item | Files (NEW = create) |
|---|---|
| Registry | NEW `src/game/characters.ts` |
| Draw seam + ImageBitmap cache | NEW `src/render/characters.ts`; call from `src/render/scene.ts` (`drawScene`) + `src/render/pipAnimations.ts` |
| Anchor model reference (don't reinvent) | `src/render/scene.ts` `drawPip` / `pipHeightFrac` / `chaoToY` / `PIP_BASE_R` |
| Sprites + anchors | `public/birds/<id>.webp` (from `docs/bird-design/roster/*` + `anchors.json`) |
| Prep script (reuse for new birds) | NEW `scripts/prep-bird.py` (trim → rightmost-opaque → beakTip; cleanup) |
| Selection state | NEW `src/game/character.ts` (localStorage `toneflap.character.v1`) |
| Pro gating | `src/ui/plan.ts` (`PRO_FEATURES`), `src/ui/EarlyBirdModal.tsx` |
| Picker UI | inside `src/ui/Profile.tsx` / `src/ui/Settings.tsx` |
| Share card mascot swap | `src/share/renderCard.ts` |
| Pip-as-image (target end state) | export from `src/dev/og-source.svg` → `public/birds/pip.webp` |

## 10. Open decisions
- Confirm each bird's **`nameHant` + pinyin** (Traditional only, hard rule 9).
- Which birds are **free vs Pro** (recommend: Pip free, all snacks Pro).
- **Collapse to all-image now**, or ship food-birds-as-image with Pip still procedural and collapse later? (Recommend: ship interim, collapse in a follow-up — lower risk to working Pip code.)
- `xiao_long_bao` needs a **transparent PNG re-export** before it can join.
