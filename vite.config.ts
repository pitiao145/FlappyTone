import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { prerenderLanding } from './src/dev/prerender.ts'
import { prettyUrls } from './src/dev/prettyUrls.ts'

// https://vite.dev/config/
// basic-ssl serves the dev server over HTTPS (self-signed cert) so
// getUserMedia works when testing on a phone over the LAN — browsers
// only allow mic access in a secure context.
//
// Except under `vercel dev` (npm run dev:api), which runs Vite as a child and
// proxies it over plain HTTP: an HTTPS upstream behind that proxy fails with
// ERR_SSL_PROTOCOL_ERROR before anything renders. Dropping the cert there
// costs nothing on desktop, because `localhost` is already a secure context
// and the mic works without TLS. The tradeoff is real but narrow: testing the
// api/ functions *from a phone* is the one thing this cannot do.
const underVercelDev = process.env.FT_NO_SSL === "1"

export default defineConfig({
  // prerenderLanding writes the landing copy into index.html so a crawler (and
  // every link-preview bot, none of which run JS) sees more than an empty root.
  // prettyUrls gives dev and preview the /app and /record URLs vercel.json
  // rewrites in production, so a link never has to spell the .html filename.
  plugins: [
    react(),
    ...(underVercelDev ? [] : [basicSsl()]),
    prerenderLanding(),
    prettyUrls(),
  ],
  // Reachable from the phone on the LAN, for on-device testing.
  server: { host: true },
  build: {
    rollupOptions: {
      input: {
        // The marketing site. The only prerendered entry.
        main: resolve(import.meta.dirname, 'index.html'),
        // The game. A separate entry so the marketing page does not carry the
        // audio/pitch/game engine. Reached at /app via the rewrite in
        // vercel.json.
        app: resolve(import.meta.dirname, 'app.html'),
        // Jane's recording booth — a separate entry so neither page carries
        // the other's code. Reached at /record via the rewrite in vercel.json.
        record: resolve(import.meta.dirname, 'record.html'),
        // Legal pages: prerendered, indexable, content from docs/legal/*.md.
        // Separate entries (not routes on `main`) so they carry no game code
        // either, same reasoning as `app`/`record`.
        'terms-of-service': resolve(import.meta.dirname, 'terms-of-service.html'),
        'privacy-policy': resolve(import.meta.dirname, 'privacy-policy.html'),
      },
    },
  },
})
