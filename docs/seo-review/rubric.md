# SEO content review rubric

Derived from the Notion "Final SEO plan: learners (EN) + teachers (ZH)" (19 Oct 2026)
and the TonePerfect research report (13 Oct 2026). Used by the
`seo-content-reviewer` agent (`.claude/agents/seo-content-reviewer.md`).

## What "valuable" means for these pages

- **Two audiences.** EN pages serve learners fixing tones and pronunciation.
  `/zh-tw/` pages (S7+) serve Taiwan native speakers who teach: 華語老師,
  teacher trainees, parents teaching 注音. ZH copy is written for the teacher,
  not the learner.
- **Free tools first, articles second.** Each page should give the searcher the
  answer in about 30 seconds, then a tool to try, then "now fly it" into /app.
- **Direct answer at the top**: the first one or two sentences answer the
  target query plainly (also what AI answers quote).
- **Unique value per page**: something a dictionary page does not have — the
  native speaker's real recordings (textbook and natural), the tone shape, how
  it is really said in Taiwan, the common mistake and its fix, a try-it tool.
  A page that only restates dictionary data is thin.
- **Taiwan / Traditional / 注音 is the edge.** Competitors (TonePerfect) are
  HSK + pinyin, mainland. Taiwan usage, 注音 and TOCFL earn their place.
- **Facts stated plainly**: free, no signup (for the public tools), audio stays
  on the device, a native Taiwan speaker.

## Target keyword per page (from the plan)

| Page | Target | Secondary |
|---|---|---|
| `/chinese-tones` | chinese tones (10k–100k) | 4 chinese tones, mandarin tones, tone sandhi, can't hear tones (FAQ) |
| `/tools/tone-marks` | pinyin tone marks, chinese tone marks | ni3 hao3 → nǐ hǎo |
| `/tools/tone-visualizer` (tone checker) | chinese pronunciation tool / checker | chinese tone checker |
| `/tools/tone-test` | chinese tones test | tone deaf chinese, can't hear tones |
| `/say/<slug>` | how to say / pronounce <X> in chinese (hello, thank you: 10k–100k) | the hanzi + pinyin |
| `/say` index | how to say … in chinese | chinese pronunciation |
| `/zh-tw/*` (S7+) | 華語教學, 華語老師, 聲調教學, 注音教學, 發音練習, 四聲 | — |

Word pages are EN only (no ZH version: no searcher).

## Checklist

### Language (highest stakes)
1. Pinyin tone marks correct and on the right vowel; matches the catalog
   (`src/data/wordsFallback.json`) and MOE. Run `npm run seo:check-pinyin` first.
2. Sandhi stated correctly: 3+3 → 2+3, 不 before tone 4, 一 before 1/2/3 vs 4,
   half-third tone. Written vs said kept apart (`pinyin` vs `said`).
3. Neutral tone: where it is, how it is described; Taiwan often has no neutral
   tone where mainland does — flag the difference.
4. 注音 agrees with the pinyin on the page and with MOE.
5. Per-device typing instructions (if any) match the vendor's current UI.
6. **Traditional only** (hard rule 9). Any Simplified character is High.
7. Taiwan terms (華語, 聲調, 注音, 輕聲) and Taiwan usage notes are accurate.

### Product truth
8. Claims about FlappyTone match `docs/ARCHITECTURE.md`, `src/game/tiers.ts`
   and the guest rules: guest = 3 runs/day, no visualiser words, local progress;
   free = 10 runs/day, 5 words/tone in the visualiser; pro = unlimited. Public
   tools have their own word list (not the tier cap). Mic only on tap; voice
   audio never uploaded.
9. Copy says "the bird" or FlappyTone, never "Pip"; never names Jane ("our
   native speaker"). Recording claims describe what the recordings really show.
10. Competitor claims match the TonePerfect report (below) and are dated/fair.

### SEO and page quality
11. Unique value vs the target keyword (see above); not thin.
12. Exactly one H1, containing the target phrase.
13. JSON-LD matches the visible page: FAQPage questions/answers equal the
    visible FAQ word for word; no claims only in JSON-LD.
14. Title ≤ ~60 chars with the keyword; meta description ≤ ~155 chars, a real
    summary (`src/site/routes.ts`).
15. Internal links: hub ↔ tools ↔ word pages; siblings exist; no dead links.
16. CTA targets exist (`/app?src=…`, tool routes) and match the page's offer.

## Competitor claims (TonePerfect report, 13 Oct 2026)

- Solo dev, launched Jan 2026, AI pronunciation scorer, Mandarin-first, 8
  languages, ~50K learners claimed (their claim).
- Scores each syllable on initial, final, tone; HSK path; drills for tones,
  pairs, sandhi; pinyin chart with audio; needs internet; reviews mention
  unstable recognition; privacy label includes cross-app tracking.
- Premium ~$9.99–14.99/month, $69.99–149.99/year, lifetime ~$199 (prices vary
  and change often).
- Content is HSK + pinyin (mainland); no Chinese-language blog posts.
Any page claim about a competitor must fit these facts or cite a newer source.
