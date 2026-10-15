---
name: demo-video
description: Use when Pierre wants a FlappyTone gameplay clip, demo video, social media video, reel, TikTok/Short, or marketing animation rendered from the game itself — scripted words, flight quality and format.
---

# Demo video

Renders an MP4 of the real game (real `Run`, real corridors, scoring, combo, hearts, bird reactions) with a **scripted voice** in place of the mic. One JSON scenario in, one video out. No UI.

## Workflow

1. **Get the scenario.** Take what Pierre gave. Ask in ONE message only for what is missing, with defaults he can accept:
   - format: `9:16` (default) / `1:1` / `16:9`
   - words, in order, and how each is flown (flights below)
   - intro / outro card text, caption
   - demo cue on or off, gap between gates, music file
2. **Write** `demo/scenarios/<short-name>.json` (committed; schema in `src/dev/demoVideo/scenario.ts`).
3. **Preview stills first:** `npm run render-demo -- demo/scenarios/<name>.json --stills 60,300,600` and Read the PNGs. Fix overlaps or bad words before the full render.
4. **Render:** `npm run render-demo -- demo/scenarios/<name>.json` → `demo/out/<name>.mp4` (gitignored). Takes about real time.
5. **Check the printed summary** (each gate's outcome) against what was asked, then send the MP4 with SendUserFile.

## Scenario

```json
{
  "format": "9:16",
  "caption": "Your voice flies the bird",
  "intro": { "title": "FlappyTone", "subtitle": "Learn Mandarin tones with your voice", "seconds": 1.6 },
  "gates": [
    { "word": "ma1b", "flight": "perfect" },
    { "word": "馬", "flight": "wobble" },
    { "word": "ma4b", "flight": "wall" },
    { "word": "haowan32", "flight": "perfect" }
  ],
  "outro": { "title": "flappytone.com", "subtitle": "Play free in your browser" }
}
```

Other fields: `fps` (60), `demo` (true — the listen-then-fly cue), `hud` (true), `corridor` (`narrow|normal|wide`), `gap` (0.5 × the game's rest gap; 1 = as played), `tailSeconds` (0.8), `music` (path; looped and cut to length).

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

- Silent video. Jane's clips are behind the clips Worker's play ticket; not wired in. Use `music`.
- Natural speech style is not supported (fallback catalog is textbook only).
- Dev-only: `demo-video.html` is not a build input. After touching `src/dev/demoVideo/`, run `npm run build` and the rule-7 grep.
