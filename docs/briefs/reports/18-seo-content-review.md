# Report: 18 Run the SEO content review on every public page (report only)

- Result: done (report only, no copy or code changed)
- What changed: this report; brief 18 status line. Nothing in `src/`, routes or the agent.
- Agent: `seo-content-reviewer` was loaded in this session and ran once per page (13 runs, in parallel).

## Checks run
- `npm run seo:check-pinyin -- --notes`: exit 1. "8 files, 173 hanzi/pinyin pairs, 7 注音 claims, 2 mismatches, 18 accepted by a sandhi/neutral rule." Mismatches: `sayWords.ts:248` 拜拜 bāi bāi; `sayWords.ts:336` 對不起 注音 vs duìbuqǐ. Notes: 14 不 sandhi, 3 neutral (謝 ×3, 係), 1 一 sandhi — all on pages below.
- All 13 pages reviewed (table below). Every finding has page, quote, issue, severity, source, label.
- Spot-check (3 Confirmed findings, re-opened by me): **3/3 hold.**
  1. Sorry #1 (對不起 注音): MOE shows ㄉㄨㄟˋ ˙ㄅㄨ ㄑㄧˇ (neutral 不). CC-CEDICT `dui4 bu5 qi3`. Holds.
  2. No-problem #1 (沒關係): MOE shows ㄇㄟˊ ㄍㄨㄢ ˙ㄒㄧ (neutral 係). CC-CEDICT `mei2 guan1 xi5`. Holds.
  3. Goodbye #2 (duplicate clause): `sayWords.ts:221` really repeats "the second fall starts (a little) lower than the first". Holds.
  Also re-read CC-CEDICT 拜拜: two entries, `bai2 bai2` (bye-bye, "also pr. bai1 bai1") and `bai4 bai5` (worship). Goodbye #1 holds.

**Important correction to brief 17:** brief 17 said MOE gives 對不起 a full-tone 不 (ㄅㄨˋ). That is wrong: MOE gives a neutral ˙ㄅㄨ. So the 注音 is the wrong half of the mismatch, not the pinyin.

## Summary counts (after merge: 54 raw → 47)

| Severity | Confirmed | Plausible | Needs native speaker | Total |
|---|---|---|---|---|
| high | 6 | 0 | 0 | 6 |
| med | 10 | 1 | 5 | 16 |
| low | 12 | 5 | 8 | 25 |
| **total** | 28 | 6 | 13 | 47 |

Merged/dropped: /say index #1–#2 merged into sorry (same 對不起 error); template "free with an account" (hello, please, sorry) = one pattern; index #3 (沒關係 Taiwan tone 4) dropped — MOE contradicts it, folded into no-problem #1; yuan #3 (`PipCta` name) and tone-marks #4 (self-contradictory) dropped as false positives.

| Page | Raw findings | After merge (H/M/L) |
|---|---|---|
| /chinese-tones | 4 | 0/0/4 |
| /tools/tone-marks | 4 | 0/2/1 |
| /tools/tone-visualizer | 4 | 0/2/2 |
| /tools/tone-test | 4 | 0/0/4 |
| /say | 4 | 0/0/1 |
| /say/thank-you | 3 | 0/1/2 |
| /say/hello | 3 | 0/2/1 (incl. template pattern) |
| /say/goodbye | 6 | 2/3/1 |
| /say/please | 5 | 0/3/1 |
| /say/sorry | 7 | 3/1/2 |
| /say/youre-welcome | 3 | 0/1/2 |
| /say/no-problem | 4 | 1/1/2 |
| /say/yuan | 3 | 0/0/2 |

## High

1. **對不起 注音 has full-tone 不** — /say/sorry `sayWords.ts:336`. "ㄉㄨㄟˋ ㄅㄨˋ ㄑㄧˇ". MOE: ㄉㄨㄟˋ ˙ㄅㄨ ㄑㄧˇ. Fix: use ˙ㄅㄨ. Confirmed (spot-checked). *Known mismatch #2.*
2. **"Taiwan dictionaries write 不 … with a full tone 4"** — /say/sorry `sayWords.ts:375`. The opposite of MOE. Fix: say MOE writes a neutral 不; careful speech may keep tone 4. Confirmed.
3. **Same error in FAQ answer, also in FAQPage JSON-LD** — /say/sorry `sayWords.ts:383` "…and in Taiwan dictionaries". Fix: drop that clause. Confirmed.
4. **沒關係: "Taiwan dictionaries give 係 … a full tone 4"** — /say/no-problem `sayWords.ts:471`, FAQ `:478`. MOE gives 關係 alone ㄍㄨㄢ ㄒㄧˋ but 沒關係 ㄇㄟˊ ㄍㄨㄢ ˙ㄒㄧ. Fix: say tone 4 in 關係 alone, neutral in 沒關係. Confirmed (spot-checked).
5. **拜拜 given only as bāi bāi** — /say/goodbye `sayWords.ts:248`, FAQ ~`:262`. CC-CEDICT: bái bái, "also pr. bāi bāi"; MOE only has the worship sense ㄅㄞˋ ˙ㄅㄞ. Fix: give bái bái + the colloquial bāi bāi (Jane picks which leads). Confirmed / Needs native speaker for the lead form. *Known mismatch #1.*
6. **Snippet answer repeats a clause** — /say/goodbye `sayWords.ts:221`. Fix: delete the second clause. Confirmed (spot-checked).

## Med

7. **Template: "free with an account"** — all /say/* (`SayWord.tsx:347-349`); seen on hello, please, sorry. Guests get 0 words, free gets 5 per tone (`tiers.ts:54,67`). Fix: "some words free with an account", or assert each page's word is in the free 5. thank-you (xiexie40) and youre-welcome (bukeqi444) were verified `min_tier: free`. Confirmed.
8. **Visualizer CTAs promise word practice a guest cannot get** — /tools/tone-visualizer `ToneVisualizer.tsx:319,414,557`. Fix: "With a free account, practise 5 words per tone". Confirmed.
9. **Visualizer H1 lacks the target keyword** — `ToneVisualizer.tsx:502` "Mandarin tone visualizer". Fix: "Chinese tone checker: Mandarin tone visualizer". Confirmed.
10. **Tone-marks links only to the hub** — `ToneMarks.tsx:283,336`. Fix: add links to visualizer, tone test, /say. Confirmed.
11. **Tone-marks neutral-tone FAQ gives only the mainland norm** — `ToneMarks.tsx:223`. Fix: one sentence on Taiwan full tones. Needs native speaker.
12. **對不起 headline pinyin "duì bù qǐ"** — /say/sorry `sayWords.ts:332,338`, also shown on /say index. Fix: duì bu qǐ as the main form; bù only as careful speech. Confirmed.
13. **"No problem" page targets 沒關係 ("it doesn't matter")** — /say/no-problem `routes.ts:169`. Searchers want 沒問題. Fix: put 沒問題 in title/H1/answer, or retarget. Confirmed.
14. **Thank-you: "spoken recording … about half a second"** — `sayWords.ts:94`. It is 0.71 s vs 0.75 s (`sayClips.ts`), and the page prints 0.71 s. Fix: "about 0.7 s, about the same length". Confirmed.
15. **Hello: "coming soon" whole-word clip vs "spoken recording" lines** — `sayWords.ts:159,163,206`. Fix: add the 你好 clip or reword. Plausible.
16. **Goodbye: northern speech makes 見 lighter** — `sayWords.ts:254`. No source. Needs native speaker.
17. **Goodbye: 拜拜 "far more common" than 再見** — `sayWords.ts:254`. Needs native speaker.
18. **Goodbye: no note on 拜拜 = worship / temple festival** — `sayWords.ts:248`. MOE's main sense. Fix: one line. Confirmed.
19. **Please: "In Taiwan, 請 also means to treat someone"** — `sayWords.ts:308`. It is general Mandarin. Fix: drop "In Taiwan". Confirmed.
20. **Please: 麻煩你 má fán nǐ** — `sayWords.ts:305`. MOE ㄇㄚˊ ˙ㄈㄢ. Needs native speaker.
21. **Please: 我請你 "said wó qǐng nǐ"** — `sayWords.ts:308`. Common reading wǒ qíng nǐ / wó qíng nǐ. Needs native speaker.
22. **You're-welcome: mainland neutral kèqi not mentioned** — `sayWords.ts:385-418`. MOE ㄅㄨˋ ㄎㄜˋ ㄑㄧˋ; CC-CEDICT qi5. Fix: one line in the Taiwan note. Confirmed.

## Low (one-line fixes)

- /chinese-tones `:306` "the rise you hear belongs to 歡" (歡 is level) → "the jump up is 歡 starting high". C
- /chinese-tones `:75` sentence starts "our" → "Our". C
- /chinese-tones `:354` 和 "often said hàn in Taiwan" → say textbook hé. NNS
- /chinese-tones `:348` 學生, 先生 neutral not MOE-checked → check before adding more. P
- /tools/tone-marks `routes.ts:112` meta ~158 chars → cut "Then practise them out loud." C
- /tools/tone-visualizer `routes.ts:123` title lacks "Chinese" → "Chinese Tone Checker & …". C
- /tools/tone-visualizer `Pip.tsx:112` aria-label "visualiser" → "visualizer". C
- /tools/tone-test `ToneTest.tsx:694` "Tone 1 ˉ" mixed with 注音 marks → tone 1 has no 注音 mark. C
- /tools/tone-test `ToneTest.tsx:77` tone 2 "go low and then up" (also JSON-LD) → tone 2 starts mid. P
- /tools/tone-test `ToneTest.tsx:48` tone 3 "low, dipping" in Spoken mode → "low (dips when said alone)". NNS
- /tools/tone-test `routes.ts:137` meta 156 chars → drop "Try it now." C
- /say `SayWord.tsx:~548` JSON-LD headline "How to say yuan" ≠ page title → use SAY_META title. C
- /say/thank-you `sayWords.ts:117` 多謝 "common in Taiwan" → "short and friendly". NNS
- /say/thank-you template h2 "Taiwan and mainland" with no mainland contrast → per-word heading. C
- /say/hello `sayWords.ts:190` friends "rarely say" 你好. NNS
- /say/goodbye `sayWords.ts:251` 慢走 gloss: style only, no change. C
- /say/please `routes.ts:165` meta ~160 chars → trim. P
- /say/sorry `sayWords.ts:342` "standard recording" describes full-tone 不 → mark it as careful speech; Jane listens. NNS
- /say/sorry `sayWords.ts:336/344` "ends low" vs 起 rising → say it once. P
- /say/youre-welcome `sayWords.ts:385` H1 "(bú kèqì)" looks like the spelling → "(bù kèqì, said bú kèqì)". C
- /say/youre-welcome `sayWords.ts:397` spoken "about 0.7 seconds" not checked against clip data. NNS
- /say/no-problem `sayWords.ts:450/460` two start points for tone 2 → one description. NNS
- /say/no-problem `sayWords.ts:451` falling 係 "can sound unfriendly". NNS
- /say/yuan `sayWords.ts:496` gloss "first" never explained → add 元旦 row or drop. C
- /say/yuan `sayWords.ts:530` banknotes print 圓: no MOE support. P

## For Jane (paste-ready)

1. 拜拜 for "bye": on the page, **bāi bāi** or **bái bái** first? And is 拜拜 really far more common than 再見 day to day?
2. 對不起: in normal speech, is 不 **light (duì bu qǐ)** or do you keep **bù (duì bù qǐ)**? Does the standard recording have a full-tone 不?
3. 沒關係: do you say 係 **light (guān xi)** or **tone 4 (guān xì)**?
4. 麻煩你: **má fán nǐ** or **má fan nǐ**?
5. 我請你: **wó qǐng nǐ**, **wǒ qíng nǐ** or **wó qíng nǐ**?
6. 再見: do you ever make 見 light, or is that only northern mainland?
7. 和 "and": do you say **hàn** or **hé** in everyday speech? Is hàn common?
8. 你好: do friends in Taiwan rarely say it to each other — yes or no?
9. 多謝: common in Taiwan, or rarer than 謝謝 / 謝啦? And 謝啦: **xiè la** (light) — right?
10. 沒事 as a reply to 謝謝: normal in Taiwan, or only for apologies?
11. 沒: does tone 2 start **low** or **in the middle**?
12. 沒關係 with a falling 係: does it sound unfriendly — yes or no?
13. Tone 3 alone in casual speech: does it dip and rise, or mostly stay low?
14. Neutral tone in Taiwan: do you say 朋友 **péng yǒu** or **péng you**; 學生, 先生 light or full?
15. 不客氣: do you keep **qì** (tone 4), and is "bú kèqì" said in 0.7 s on the spoken take?

## Cross-page patterns
- **"Taiwan dictionaries" claims written from memory, against MOE**: 對不起 (sorry ×3), 沒關係 (no-problem ×2). Both say MOE has a full tone where MOE has a neutral tone. Every "Taiwan dictionary" sentence should cite MOE.
- **Neutral tone vs Taiwan full tone, presented inconsistently**: 對不起, 沒關係, 麻煩, 不客氣, tone-marks FAQ. Pick one convention (MOE form first, Taiwan spoken variant second) and apply it on every page.
- **Template "free with an account"** on every /say page; tiers cap free at 5 words per tone.
- **Guest vs account not said at the CTA**: visualizer CTAs, /say template.
- **Meta descriptions at 156–160 chars**: tone-marks, tone-test, please.
- **Weak internal link mesh**: tone-marks and tone-visualizer do not link to sibling tools or /say.
- **Unsourced usage/frequency claims** in "Taiwan" notes (多謝, 拜拜, 你好, 沒事, 和): all go to Jane.

## Agent / prompt problems (for a later reviewer tweak)
- Several runs skipped the rubric/conventions/sources docs (hello, please, sorry, /say, partial yuan) and said so. Make reading them a hard first step.
- /say index reviewer flagged 沒關係 as "Taiwan says guānxì", which MOE contradicts — from memory, not a source. Label rules are not enforced for "Needs native speaker".
- tone-marks #4 had a title that its own body contradicted.
- yuan #3 flagged `PipCta` (a code name) despite the rule being about visible copy.
- Each run re-reported the two site-wide script mismatches; tell the agent to ignore mismatches outside its page.
- No run sampled clip data to check "real" pitch descriptions; one run (thank-you) did check durations and found a real bug. Add "check durations/claims against sayClips.ts".
- **Check script bug**: for 拜拜 it matched the worship entry (bai4) instead of the loanword entry (bai2 bai2 / bai1 bai1); and brief 17 recorded MOE for 對不起 wrongly. Script should try every CC-CEDICT entry for a headword.

## Proposed brief 19 scope
**Safe without Jane (source-backed):** high #1–#4 and #6; med #7–#10, #12–#14, #18, #19, #22; all Confirmed lows. For 對不起 and 沒關係, apply the MOE form (neutral) in 注音, pinyin and notes now; Jane's answers only adjust the "spoken variant" line. Also fix the check script's multi-entry lookup.
**Wait for Jane:** #5 拜拜 lead form, #11, #15–#17, #20, #21, all NNS lows, and every frequency/usage claim in the list above.

## Needs Pierre's eyes
- The brief 17 report has the 對不起 MOE reading backwards; the fix direction is now "neutral 不".
- Brief 19 scope split above.
