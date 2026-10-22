# src/record — the recording booth (`/record`)

Read `docs/ARCHITECTURE.md` → "The clip catalog and its Worker" before you change the booth. The rules that bite most (each one comes from a real overwrite incident, see `docs/DECISIONS.md`):
- The booth talks only to the clips Worker (`/raw`, `/booth/words`), never to Vercel `api/`.
- `boothArming.ts`: only the bulk "Start recording" pass arms the mic on arrival. Every other route lands paused, and a `published` take (per word × style) asks before a redo.
- Do not tie `stopMic()` to a mount effect. React StrictMode in dev runs the cleanup once and kills the mic.
