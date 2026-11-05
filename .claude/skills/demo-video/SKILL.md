---
name: demo-video
description: Use when Pierre wants a FlappyTone gameplay clip, demo video, social media video, reel, TikTok/Short, or marketing animation rendered from the game itself — scripted words, flight quality and format.
---

# Demo video

Renders an MP4 of the real game with a **scripted voice** in place of the mic: a real `Run` (corridors, scoring, combo, hearts, bird), drawn by `drawWorld`, with the game's own HUD component (`src/ui/GameHud.tsx`) and CSS. Jane's real clips play at each gate's listen cue. One JSON scenario in, one video out. No UI.

## Workflow

1. **Get the scenario.** Take what Pierre gave. Ask in ONE message only for what is missing, with defaults he can accept:
   - format: `9:16` (default) / `1:1` / `16:9`
   - words, in order, how each is flown (flights below), and whether Jane's clip plays for it
   - intro / outro card text, caption
   - listen cue on or off, gap between gates, music file
   - results screens after the run, if any (below)
2. **Write** `demo/scenarios/<short-name>.json` (committed; schema in `src/dev/demoVideo/scenario.ts`).
3. **Preview stills first:** `npm run render-demo -- demo/scenarios/<name>.json --stills 60,300,600` and Read the PNGs. Fix overlaps or bad words before the full render.
4. **Render:** `npm run render-demo -- demo/scenarios/<name>.json` → `demo/out/<name>.mp4` (gitignored). Takes about real time.
5. **Check the printed summary** (each gate's outcome) against what was asked.
6. **Edit in Remotion** when Pierre wants a finished promo (hook, captions, zooms, end card, music) — see below. Otherwise send the raw MP4 with SendUserFile.

## Promo edit (Remotion)

Two layers: `render-demo` films the real game; Remotion (`video/`, composition `Promo`) edits it. For a promo:

1. Render the gameplay **into Remotion's public dir**, usually without the scenario's own `intro`/`outro`/`caption` (Remotion does those better):
   `npm run render-demo -- demo/scenarios/<name>.json --out video/public/clips/<name>.mp4`
   This also writes `video/public/clips/<name>.timing.json`: each gate's `cueAt` (Jane starts) and `resolvedAt` + `outcome` + `points`, `gameEndAt`, end screens' `from` — all in clip seconds.
2. **Write `video/props/<name>.json`** (committed). Time captions and zooms off the timing file, never by guessing: e.g. a "listen…" caption at a gate's `cueAt`, a payoff on its `resolvedAt`.
   ```json
   {
     "format": "9:16",
     "clip": "clips/<name>.mp4",
     "clipSeconds": 21.5,
     "clipStart": 0.5,
     "hook": { "text": "Same syllable. Four meanings.", "sub": "mā · má · mǎ · mà" },
     "captions": [
       { "text": "Listen…", "from": 0.9, "to": 2.6 },
       { "text": "4 for 4. Perfect.", "from": 18.3, "to": 21.3, "tone": "highlight", "position": "bottom" }
     ],
     "zooms": [{ "from": 12.2, "to": 14.4, "scale": 1.1, "originY": 0.55 }],
     "endCard": { "title": "FlappyTone", "subtitle": "Learn Mandarin tones with your voice", "cta": "flappytone.com" }
   }
   ```
   Fields are typed in `video/src/Promo.tsx` (`PromoProps`): `clipStart`/`clipEnd` trim; caption `position` `top|middle|bottom`, `tone` `ink|accent|highlight`; `music` (path under `video/public`), `musicVolume` (0.35), `clipVolume` (1). `format` must match the clip's.
3. **Check stills** before the full render: `npx remotion still Promo video/out/<name>-f.png --props=video/props/<name>.json --frame=<n>` (30 fps) and Read them — captions must not cover the word card at the top or the bird.
4. **Render:** `npm run video:render -- video/out/<name>.mp4 --props=video/props/<name>.json` (≈5× clip length). Send it.

For Pierre talking to camera, see "Founder talking-head video" below.

`npm run video:studio` opens Remotion Studio for Pierre to scrub and tweak props himself. Need a new kind of shot (split screen, side-by-side tones)? Add a composition in `video/src/` rather than bending `Promo`; the remotion-dev skills (`npx skills add remotion-dev/skills`) cover the API.

## Founder talking-head video

Pierre on camera, with jump cuts, B-roll over his face while his voice runs, burned-in captions, a title, zooms and a "Comment X 👇" CTA. Composition `TalkingHead` (`video/src/TalkingHead.tsx`), props `video/props/<name>.json`. The reference is `origin.json` ("I built a music visualizer. It became a Mandarin game."). Pierre liked the result, so copy its choices. Helper scripts are in `.claude/skills/demo-video/founder/`. Run them with `python3 -I`; numpy is installed.

**Files.** Footage goes in `video/public/aroll/<name>/` and `video/public/broll/<name>/`. Both are gitignored: nothing in `video/public/` except `brand/` is committed, and neither is `video/out/`. Pierre keeps the final MP4 outside the repo. The app cannot read `~/Desktop` ("Operation not permitted", even without the sandbox), so ask him to move files into the repo. Commit only code, the props file and the scenario.

1. **Takes.** iPhone `.MOV` files are rotated HEVC HDR (HLG). Pierre often records his voice on a second phone at the same time. Those `.m4a` files have creation times 1–2 s after their `.MOV`, so pair them by timestamp. List both with `ffprobe ... format_tags=creation_time`.
   `python3 -I founder/prep.py video/public/aroll/<name> IMG_1.MOV=mic1.m4a IMG_2.MOV ...` → `shot<i>.mp4` + `shot<i>.wav`.
   It converts to SDR with `avconvert` (this ffmpeg cannot tonemap) and syncs each mic by cross-correlation (a match above 0.5 is good; origin's were about 0.7). A take without a mic, such as a re-take, uses camera audio, gain-matched to shot 1.
2. **Whisper.** Ask before adding it. It is already a dev dependency: `@remotion/install-whisper-cpp`. Build it once into the scratchpad with `node --experimental-strip-types video/transcribe.ts <whisperDir> <out.json> <wav>`. If `make` fails with `'atomic' file not found`, run `cd <whisperDir> && make CXX="clang++ -isysroot $(xcrun --show-sdk-path) -I$(xcrun --show-sdk-path)/usr/include/c++/v1" CC="clang -isysroot $(xcrun --show-sdk-path)"`. The model is `medium.en` (about 1.5 GB).
3. **Islands.** Run `python3 -I founder/islands.py <whisperDir> video/public/aroll/<name>/shot*.wav`. It prints `[shot, from, to] text` for each stretch of speech. Do **not** cut on Whisper's word times: they drift by up to 4 s. Islands come from loudness, so a gap of 0.3 s or more between islands is a pause that the edit removes. Drop `[BLANK_AUDIO]`, `[footsteps]`, laughs and the stray "You" Whisper adds after a take ends.
4. **Cut.** Copy the islands into `segments`, in order, and add each segment's caption chunks as `say` (1–4 words each, Traditional hanzi if any). To cut inside an island, find the loudness dip between the words (10 ms RMS around the spot) and cut there.
   **Editing rules from origin:** Pierre ad-libs past the script, so captions follow what he *said*. Script wording wins only for spelling and names. Never cut the setup of the hook for length. In origin, "my ear… was just too low" set up "see the tones instead of hearing them", and he noticed when it was gone. A target length is a guide: origin aimed for 35–40 s and shipped at 61 s. Before dropping a sentence to save time, list the candidates and let him choose. Cut brand names that aren't ours ("like Flappy Bird").
5. **Check every join.** `python3 -I founder/splice.py <whisperDir> video/props/<name>.json` rebuilds `captions` from `say`, splices the voice and prints Whisper's transcript. A swallowed word ("fly … through") or a leftover one ("I" after "understand") means a cut point is wrong. Whisper can also invent a joining word ("just", "I was"), so re-check a suspect join on its own (`splice.py … <i> <j>`).
6. **B-roll** (`overlays`). Times are `{ shot, t }` in the source take, so re-cutting never moves them. The overlay's audio is always muted, so his voice carries on underneath.
   - Stills: `push` (slow zoom, default 1.08). A landscape screenshot that loses its meaning when cropped (the Windows Media Player shot) takes `"fit": "contain"` (a blurred copy fills the frame).
   - Landscape screen recordings: `"fit": "contain"` plus `scale` (about 1.4) and `brightness` (about 1.6 for a dark UI), so captions land on the picture, not on the app's button bar.
   - Gameplay clip: `"sync": { "at": {shot,t}, "clipT": <gate resolvedAt> }` lands a gate passing on a word (origin: 麻 Perfect on "shaped like"). With the listen cue on, a 4-gate clip runs about 17 s and the bird is frozen for about 2 s per cue. Make a contact sheet (`ffmpeg -i clip.mp4 -vf "fps=2,scale=180:-2,tile=12x3" -frames:v 1 sheet.jpg`), Read it, and keep frozen frames away from lines about movement.
   - Show what he names when he names it: in origin, the typhoon map on "typhoon", the Media Player shot on "Windows Media Player", his visualiser app on "reacts to my voice… with my pitch". Don't use third-party charts or watermarked images (e.g. AllSet's `assets/Textbooktones.png`).
7. **Title, zoom, CTA.** `title` is the top card for its first `seconds` (3). Use `zooms` (1.0→1.1) on the payoff line, on his face, not under B-roll. `cta` is a big top card over the last shot ("Comment TONES 👇"); there is no separate end card.
8. **Stills, then render.** Work out output frames from the cut list (30 fps; the sum of segment lengths before a moment). Render stills with `npx remotion still TalkingHead <png> --props=… --frame=<n>`, tile them with `ffmpeg … hstack`, Read them and send them to Pierre before the full render: 1 s, every shot change, each B-roll, the last second. Then `npx remotion render TalkingHead video/out/<name>.mp4 --props=video/props/<name>.json` (about 1 min per 10 s). Transcribe the render's audio once more and send it.

## Scenario

```json
{
  "format": "9:16",
  "caption": "Your voice flies the bird",
  "intro": { "title": "FlappyTone", "subtitle": "Learn Mandarin tones with your voice", "seconds": 1.6 },
  "gates": [
    { "word": "ma1b", "flight": "perfect" },
    { "word": "馬", "flight": "wobble" },
    { "word": "ma4b", "flight": "wall", "audio": false },
    { "word": "haowan32", "flight": "perfect" }
  ],
  "end": [
    { "screen": "gameover", "seconds": 3.5 },
    { "screen": "share", "seconds": 3, "name": "Pierre" }
  ],
  "outro": { "title": "flappytone.com", "subtitle": "Play free in your browser" }
}
```

Other fields: `audio` (true — Jane's clip at every cue; a gate's own `audio` wins), `fps` (60), `demo` (true — the listen-then-fly cue; with it off no clips play either), `hud` (true), `corridor` (`narrow|normal|wide`), `gap` (0.5 × the game's rest gap; 1 = as played), `tailSeconds` (0.8), `music` (path; looped and cut to length), `musicVolume` (0.35 under clips, else 1).

Per gate: `listen: false` keeps the bird flying while Jane's clip plays (no freeze; `audio` still decides if the clip plays), and `gap` overrides the scenario's `gap` for the space before that gate.

## Results screens (`end`)

Shown after the run, in order, before the outro. Each is the game's own component fed this run's real stats — nothing is made up. To change the numbers, change the flights. Map Pierre's words:

| he says | `screen` | what it is |
|---|---|---|
| score card, share card, "can you beat me" | `share` | the share image the game exports; `name` puts "PIERRE SCORED" on it |
| results, game over, end screen, final score | `gameover` | game-over screen: score, best, combo, tone-accuracy tiles |
| stats mid-run, pause, accuracy breakdown | `pause` | pause menu over the frozen last frame, with the breakdown |

`seconds` defaults to 3. Game-over's coach card ("Tone 3 gates are landing like Tone 2") only appears once a tone has 2+ scored gates (`MIN_SCORED_GATES_FOR_TAKEAWAY`) — give that tone enough gates if he wants it. Progress-screen history (trends, streaks) is not available: it would need invented runs.

## Flights

| flight | what it shows | usual result |
|---|---|---|
| `perfect` | on the centreline | Perfect |
| `good` / `ok` | offset / loose but inside | Good–Perfect (the classifier boost can lift it) |
| `wobble` | wave inside the walls | varies |
| `early` / `late` | right shape, shifted | varies |
| `wall` | breaks through a wall | heart lost |
| `silent` | no voice | "Couldn't hear that" |

Outcomes are scored by the real game, so read the summary; do not promise an outcome the summary did not show. Three `wall`s end the run early.

## Words

`word` is a catalog id or hanzi from `src/data/wordsFallback.json` (textbook, default speaker). List ids:
`python3 -c "import json;[print(r['id'],r['hanzi'],r['pinyin']) for r in json.load(open('src/data/wordsFallback.json'))['rows']]"`
Pairs (two syllables) work too, e.g. `haowan32` 好玩. Hanzi is Traditional (hard rule 9).

## Limits

- Clips come from the live clips Worker (`VITE_CLIPS_BASE_URL` in `.env.local`) on a guest ticket, like a guest player. A clip that fails is skipped with a warning — check the "N clips" count in the output.
- The scenario's intro/outro cards and caption are demo-only overlays (`demo-video.html`), not game UI; for promos prefer the Remotion hook/end card.
- Remotion is free for individuals and companies up to 3 people; past that it needs a company license.
- Natural speech style is not supported (fallback catalog is textbook only).
- Dev-only: `demo-video.html` is not a build input. After touching `src/dev/demoVideo/`, run `npm run build` and the rule-7 grep.
