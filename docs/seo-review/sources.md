# Sources and their order

A finding is only **Confirmed** when a source at level 1 or 2 supports it.
Model memory never confirms anything.

1. **教育部《重編國語辭典修訂本》 (MOE Revised Dictionary)** — https://dict.revised.moe.edu.tw/
   The Taiwan standard for readings, 注音 and tone marks. Search URL:
   `https://dict.revised.moe.edu.tw/search.jsp?md=1&word=<詞>` (URL-encode the word).
   Related: 教育部《國語辭典簡編本》 https://dict.concised.moe.edu.tw/ (learner-level),
   教育部《國語一字多音審訂表》 for characters with several readings.
2. **CC-CEDICT** — local copy in `data/` (see `data/LICENSE.md`), checked by
   `npm run seo:check-pinyin`. Also **Unihan** (https://www.unicode.org/charts/unihan.html)
   for single characters. Mainland-leaning: where it and MOE differ, MOE wins
   and the page should follow Taiwan.
3. **Project ground truth** — `src/data/wordsFallback.json` (the published catalog,
   what Jane recorded), `docs/ARCHITECTURE.md`, `src/game/tiers.ts`,
   `docs/DECISIONS.md` for product claims.
4. **Competitor facts** — Pierre's TonePerfect report (Notion, 13 Oct 2026),
   summarised in `rubric.md` → "Competitor claims".
5. **Model memory** — a lead only. A finding that rests on it is labelled
   **Needs native speaker** or **Plausible**, never Confirmed.

## MOE web access (tested 2026-10-21)

**Works.** WebFetch on the search URL returned the entry for 謝謝
(注音 `ㄒㄧㄝˋ ˙ㄒㄧㄝ`) and 不客氣 (注音 `ㄅㄨˋ ㄎㄜˋ ㄑㄧˋ`, pinyin `bù kè qì`).
Caveats: the summary sometimes omits the 漢語拼音 column (it did for 謝謝), so
ask for the 注音 and convert, and the site may rate-limit: fetch only the words
a finding needs. If a fetch fails, fall back to CC-CEDICT and label the
finding **Plausible** (not Confirmed), stating that MOE was unreachable.

Note MOE lists base tones (不 = bù); the pages write 不/一 with the spoken
tone change (bú kè qì). That is a page convention, not an error (see
`taiwan-conventions.md`).
