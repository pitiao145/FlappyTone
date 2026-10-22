# workers/clips — the clips Worker

Separate deploy target and toolchain: `npm -w workers/clips` (`npm run worker:test`, `worker:dev`, `worker:deploy`). Never deploy unless Pierre asks.

Read `docs/ARCHITECTURE.md` → "The clip catalog and its Worker" before you change a route. The rules that bite most:
- The booth's speaker comes from the passcode, server-side. No route takes a speaker from the client.
- `/clip/:speaker/:id?style=`: speaker and style are part of the edge cache key. Deploy the Worker before any client that sends a new param.
- A guest gets real clips. Only `min_tier='pro'` words are gated; a new sampler list needs a Worker deploy.
