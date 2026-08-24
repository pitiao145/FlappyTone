# FlappyTone — R2 Clip Storage Migration (Spec for coding agent)

## Context

`public/ref/*.wav` (120 files, ~15MB) are committed to git and bundled into
every Vercel deploy. Measured 23 Aug 2026: `.git` has already grown to ~46MB,
almost entirely from binary clip history — every re-cut or re-recorded clip
leaves its old blob permanently in history. Every clip is also served off
Vercel's own hosting bandwidth rather than a CDN built for this. Both problems
compound as the word list and multi-syllable inventory grow.

This spec moves clip *audio* to Cloudflare R2 (public read, zero egress cost
at any volume — the reason R2 over alternatives). `manifest.json` stays
git-tracked and bundled: it's small text, worth keeping diffable in version
control, and the client needs it with zero network round-trip on load.

Prerequisite, done manually by Pierre: `docs/R2_SETUP.md` (bucket, public
access, CORS, API token). This spec assumes that's done and the env vars below
already exist in `.env.local` and Vercel.

## Env vars this introduces

Server-side only (upload script; must NOT carry the `VITE_` prefix, or Vite
would inline them into the client bundle):
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

Client-exposed (Vite only ships `VITE_`-prefixed vars to the browser):
- `VITE_CLIPS_BASE_URL` — e.g. `https://clips.pierrebuilds.dev/`

## 1. New dependency — confirm with Pierre before installing

R2 exposes an S3-compatible API. Recommend `@aws-sdk/client-s3` as a
devDependency for the upload script only (never bundled client-side, so it
doesn't touch client payload size). `aws4fetch` is a much lighter,
zero-dependency alternative if Pierre would rather not pull in the full AWS
SDK for one script. Either way: this project has an explicit "ask before
adding a dependency" rule in CLAUDE.md's working-style section — ask before
installing, don't just add it.

## 2. Separate cutting from publishing

Today `make-clips.ts` cuts and writes in one pass. Auto-uploading straight to
a public production bucket on every local run would skip the human-review step
the rest of this pipeline depends on — `clipReview.ts` is explicitly designed
to flag, never block, on the assumption a person reads the report before
trusting a batch (see CLAUDE.md's rule 3 on `clipReview.ts`). Keep that rhythm:

- `make-clips.ts` is unchanged — keeps writing locally to `outDir =
  ${root}public/ref` exactly as it does now (`writeFileSync` calls currently
  at lines 211 and 271–272). This stays the local review step.
- New script, `src/dev/upload-clips.ts`, wired up as `npm run upload-clips`
  next to the existing `make-clips` entry in `package.json`. Reads whatever is
  currently in `public/ref/` and pushes every `<id>.wav` plus `manifest.json`
  to R2 via the S3-compatible client and the `R2_*` env vars. Run manually,
  after `make-clips` and a look at its review report — cut, read, then
  publish, same as today.

## 3. Stop committing the clips

- `public/ref/*.wav` — untrack (`git rm --cached public/ref/*.wav`, keep the
  local files), then add `public/ref/*.wav` to `.gitignore`. This sits
  naturally next to the existing `fixtures/recordings/` and
  `fixtures/analytics/` entries, which document the identical reasoning ("not
  committed, re-derivable from storage").
- `public/ref/manifest.json` — stays committed and bundled. Do not gitignore
  this one. It's what lets the client build gates without a network
  round-trip on load, and unlike the audio, its git history is genuinely
  useful to keep.

## 4. Point the client at R2

`src/audio/reference.ts`, `loadClip()` (currently ~line 80). Today:

```ts
const url = `${import.meta.env.BASE_URL}ref/${word.file}`;
```

Change to:

```ts
const url = `${import.meta.env.VITE_CLIPS_BASE_URL}${word.file}`;
```

`manifest.json` loading is untouched by this — it's still bundled from
`public/ref/manifest.json` per step 3. Only the per-word audio fetch moves to
R2.

## 5. Seed the bucket

One-time: run `npm run upload-clips` against the 120 clips already in
`public/ref/` *before* untracking them from git, so the bucket starts
populated. Point local dev's `VITE_CLIPS_BASE_URL` at the bucket and verify a
handful of words play correctly before doing the `git rm --cached` step.

## 6. Vercel env vars

Add the four `R2_*` values and `VITE_CLIPS_BASE_URL` to the Vercel project's
environment variables, matching `.env.local`. `VITE_CLIPS_BASE_URL` is needed
at build time since Vite inlines it; the `R2_*` secrets don't need to exist on
Vercel at all unless `upload-clips` is ever run from CI rather than locally.

## Testing checklist

- [ ] `npm run upload-clips` pushes all 120 `.wav` files + `manifest.json`;
      confirm file count in the R2 dashboard
- [ ] Local dev, `VITE_CLIPS_BASE_URL` pointed at the bucket: play a full run,
      confirm gates play the native clip, not the synthetic-sweep fallback
      (`playToneCue`'s return value distinguishes these, or just listen — they
      sound different)
- [ ] No CORS errors in the console on clip `fetch()` calls
- [ ] A Vercel preview deploy also plays clips correctly (this is what the
      `*.vercel.app` CORS origin exists for)
- [ ] `npm run build && npm run typecheck` clean
- [ ] `public/ref/*.wav` no longer appears as tracked in `git status` after
      the `git rm --cached` step

## Explicitly out of scope here

- **Shrinking `.git`** (`git filter-repo` to strip the already-committed WAVs
  from history) — separate step, done once this has been live a while and
  nobody needs to `git revert` past it. It's a history rewrite (force-push,
  everyone re-clones), don't bundle it into this change.
- **Signed/expiring URLs or any other access control on the bucket** — not
  needed now. The bucket is public-read by design, same trust model as the
  current `public/ref/` static files; nothing about this migration changes
  what's downloadable, only where it's served from.
