# FlappyTone — R2 Setup (Cloudflare Dashboard)

One-time setup, done manually in the Cloudflare dashboard, before the coding agent
touches anything. ~15 minutes. Pairs with `docs/flappytone-SPEC-r2-clip-storage.md`,
which is what your coding agent implements once this is done.

## 1. Create the bucket
Cloudflare dashboard → R2 Object Storage → Create bucket.
- Name: `flappytone-clips` (internal only, never user-facing)
- Location: Automatic

## 2. Public access — custom subdomain (recommended)
Bucket → Settings → Public access → Connect Domain.
- Use a subdomain of your existing domain, e.g. `clips.pierrebuilds.dev`
- DNS record is created automatically since the domain's already on this account
- Wait for the certificate to provision (a few minutes)

Quick-start alternative: enable the `r2.dev` public URL instead — instant, no DNS
wait, fine for testing. Switch to the custom domain before relying on it, since
some aggressive ad/privacy blocklists are more likely to flag generic
`*.r2.dev`/cloud-storage hostnames than a subdomain of your own site.

## 3. CORS
Bucket → Settings → CORS Policy → add:

```json
[
  {
    "AllowedOrigins": [
      "https://flappytone.com",
      "https://*.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

The `*.vercel.app` entry matters because a Vercel preview deploy is a production
build (per CLAUDE.md) and needs to fetch clips too.

## 4. API token — for the upload script only, never shipped to the browser
R2 → Manage API Tokens → Create API Token.
- Permissions: Object Read & Write
- Scope: **this bucket only**, not account-wide — least privilege
- No expiry is fine for now; note the creation date so you know when to consider
  rotating it
- The secret is shown once — save Access Key ID + Secret Access Key in a
  password manager immediately

## 5. Note down five values
You'll need these for env vars in the spec below — keep them somewhere safe,
you don't need to send them to anyone:
- Account ID (R2 dashboard sidebar)
- Bucket name
- Access Key ID
- Secret Access Key
- Public URL (your custom domain or the r2.dev URL)

## 6. Account hygiene
Turn on 2FA on your Cloudflare account if it isn't already — it also controls
your domain's DNS, worth protecting beyond just this one bucket.

## 7. Where the values go (this is for your coding agent, not you to build)
- Local dev: `.env.local` (already gitignored)
- Production: Vercel dashboard → Project → Settings → Environment Variables
- Exact variable names are fixed in `docs/flappytone-SPEC-r2-clip-storage.md` so
  both sides agree on naming without you having to relay them by hand.
