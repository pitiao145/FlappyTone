# CC-CEDICT data file

`cedict_1_0_ts_utf-8_mdbg.txt.gz` is CC-CEDICT, downloaded 2026-10-21 from
https://www.mdbg.net/chinese/dictionary?page=cc-cedict (file date 2026-10-19,
125,303 entries).

Licence: Creative Commons Attribution-ShareAlike 4.0 International
(https://creativecommons.org/licenses/by-sa/4.0/). Published by MDBG; based on
CEDICT, (C) 1997, 1998 Paul Andrew Denisowski.

It is a data file read by `npm run seo:check-pinyin` (`src/dev/seo-check-pinyin.ts`),
not a code dependency, and it never ships in `dist/`. Re-download the same URL
to update it. CC-CEDICT follows mainland readings in places; for Taiwan
readings the MOE dictionary wins (see `../sources.md`).
