# FlappyTone — R2 + Worker Setup (Cloudflare Dashboard)

**Status: superseded and largely done.** This file originally described a
single **public** R2 bucket for `docs/SPECS/flappytone-SPEC-r2-clip-storage.md`
(a spec that was never implemented — no code references it). The clip storage
that actually shipped is `docs/SPECS/flappytone-SPEC-clip-catalog-r2.md`'s
model instead: **two private buckets**, read only through a Cloudflare Worker
that mints short-lived play tickets — see CLAUDE.md's "The clip catalog and
its Worker" and `docs/DECISIONS.md`'s "Clip catalog: DB + R2 migration"
entry for why (guests get clips too; protection is defence-in-depth, not a
public/private wall alone). Steps 1–4 below are **done** (Task 5/6/8 of the
migration plan; the Worker is live at `clips.flappytone.com`). Step 5 (the
rate-limit WAF rule) is the one item still outstanding — it is a genuine gap,
not paperwork: a live probe of 20 rapid `POST /token` from one IP currently
returns all `200`s, no `429`.

## 1. Enable R2 — done

Cloudflare dashboard → R2 Object Storage → Enable. Needs a payment method on
file; the free allowance covers this project (10 GB storage, 10M reads/month).

## 2. Two private buckets — done

Create, location Automatic:
- `flappytone-raw` — Jane's uncut takes from `/record`, one per recording.
- `flappytone-clips` — the processed, game-ready clips `process-clips` writes.

**Do not** enable public access, an `r2.dev` URL, or a custom domain on
either bucket, and add **no CORS policy** — the Worker is the only reader of
both. This is the load-bearing difference from the original (unimplemented)
public-bucket spec this file used to describe: nothing outside the Worker can
list or fetch an object directly, at any layer.

## 3. Custom domain for the Worker — done

After `wrangler deploy` (the Worker's own deploy, `npm run worker:deploy`),
Workers & Pages → `flappytone-clips-api` → Settings → Domains & Routes → Add
custom domain `clips.flappytone.com`. Cloudflare creates the DNS record.
`workers/clips/wrangler.toml` already declares the route
(`{ pattern = "clips.flappytone.com", custom_domain = true }`); the dashboard
step is only needed if the deploy itself couldn't create it.

## 4. Secrets — done

Four secrets, set with `wrangler secret put <NAME>` from `workers/clips/`
(needs `npx wrangler login` once): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
(same values `api/score.ts` uses on Vercel), `RECORD_PASSCODES` (a JSON
object mapping each booth passcode to a `speakers.id`, e.g.
`{"<jane's code>":"jane","<mark's code>":"mark"}` — this replaced the single
`RECORD_PASSCODE`, since the booth now derives *whose* rows a session may
write from the code itself; adding a recorder is a secret update, not a
deploy), `CLIP_TOKEN_SECRET` (a fresh value —
`openssl rand -base64 48` — this is the HS256 secret the Worker signs play
tickets with; it is unrelated to Supabase's own ES256 session-JWT key, which
the Worker verifies against Supabase's public JWKS instead of holding a
secret for). None of these are in `wrangler.toml` or any committed file.

`VITE_CLIPS_BASE_URL=https://clips.flappytone.com` is set in `.env.local`.
**It is not yet confirmed set in Vercel** (Production or Preview) — per the
build ledger this was flagged as Pierre's outstanding step twice (after
Task 7 and again after Task 11) and never confirmed done. This is why the
migration's own precondition for retiring the old `public/ref/*.wav` path (a
full run played off R2 in production) hasn't been met yet, and why the
booth shows "Recording isn't configured" in a deployed build until it's set.
See CLAUDE.md's "clip catalog" section and DECISIONS.md's pending-Task-13
checklist.

## 5. Rate limit — NOT DONE

Security → WAF → Rate limiting rules → Create:
- Name `clips per ip`; expression
  `(http.host eq "clips.flappytone.com" and starts_with(http.request.uri.path, "/clip/"))`;
  characteristics IP; period 1 minute; requests 60; action Block for 1 minute.
- A second rule for `/token`: same shape, 20 requests/minute per IP.
- A third for the booth: `/auth` and `/booth/*`, and tighter — there are two
  legitimate users in the world, so 10 requests/minute per IP is generous.
  `/auth` in particular is the booth passcode's front door and **has no rate
  limit at all today** — the compare is constant-time and the codes are not
  guessable by hand, but nothing slows an automated sweep. This is an
  inherited gap, not one the voice-roster work introduced; it predates the
  passcode→speaker change and is unaffected by it.

This is the last layer of the defence-in-depth list CLAUDE.md describes
(private buckets, no listing, one clip per request, short-lived IP-bound
tickets, rate limit). The first four are live; this one is a dashboard step
only Pierre can do. Re-run the manual probe in `docs/TESTING.md` §8 once it
exists.

## 6. After the old path is retired (Task 13, not yet done)

Once `public/ref/*.wav`, the manifest, and the Vercel upload routes are
actually deleted (see CLAUDE.md's pending-Task-13 note): Vercel → Storage →
delete the Blob store; Vercel → Settings → Environment Variables → remove
`BLOB_READ_WRITE_TOKEN` and the booth's Vercel-side `RECORD_PASSCODE` (the
Worker has its own copy as a `wrangler secret`, independent of Vercel's).

## 7. Account hygiene

Turn on 2FA on the Cloudflare account if it isn't already — it also controls
the domain's DNS and the Worker's route, worth protecting beyond just these
two buckets.
