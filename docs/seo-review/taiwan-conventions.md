# Taiwan conventions the pages follow

## Characters and terms
- **Traditional only** (CLAUDE.md hard rule 9). Check any doubtful character
  against MOE, never by eye. Common slips: 说/說, 们/們, 对/對, 见/見, 气/氣, 谢/謝, 体/體, 台/臺 (台 is accepted in Taiwan everyday use).
- Preferred Taiwan words: 華語 (teaching Chinese as a foreign language) rather
  than 汉语/漢語 in teacher copy; 聲調 for tones; 注音 / 注音符號 (Bopomofo);
  輕聲 for neutral tone; 變調 for tone sandhi; 繁體 for Traditional.
- Taiwan everyday usage the pages may cite: 不會 as a reply to 謝謝, 拜拜 for
  bye, 不好意思 for small apologies.

## Tone marks (pinyin)
- Mark rule (the standard Hanyu Pinyin rule, which Taiwan adopted in 2009;
  confirm a doubtful case against the MOE dictionary's pinyin column):
  mark a, else o or e; in iu mark u, in ui mark i (liù, duì). ü keeps its dots
  after n/l (nǚ, lǜ) and drops them after j q x y (qù).
- Neutral tone: no mark (xièxie, duìbuqǐ in some dictionaries).
- Taiwan reads many words without a neutral tone where mainland dictionaries
  have one (e.g. MOE gives 對不起 as ㄉㄨㄟˋ ㄅㄨˋ ㄑㄧˇ, mainland duìbuqǐ).
  When a page states 注音 for such a word, the 注音 and pinyin on the page must
  agree with each other, and should follow MOE.
- Some characters have different Taiwan readings: 垃圾 lè sè (TW) vs lā jī;
  和 hàn (TW, "and") vs hé; 星期 xīng qí (TW) vs xīng qī; 拜拜 bāi bāi in speech
  but MOE lists bài bài. Flag these as **Needs native speaker** with both
  readings.

## Tone sandhi (spoken, not written in dictionaries)
- **3 + 3 → 2 + 3**: 你好 nǐ hǎo is said ní hǎo. Pages write the base tones
  and show the spoken form in `said`.
- **不**: bù, but bú before a tone 4 (不要 bú yào, 不客氣 bú kè qì). The pages
  write the changed tone for 不 (TOCFL convention); either is acceptable if
  consistent on the page.
- **一**: yī alone, in counting and as an ordinal; yí before tone 4 (一個 yí ge);
  yì before tones 1, 2, 3 (一百 yì bǎi).
- Half-third tone: a tone 3 before tones 1, 2, 4 or neutral is low and does not rise.

## 注音 pairs
- `src/site/zhuyin.ts` derives 注音 from pinyin; every hand-typed 注音 in prose
  must equal that output (the check script tests "X in pinyin and Z in 注音").
- Neutral tone in 注音 is ˙ before the syllable (˙ㄒㄧㄝ); tone 1 has no mark.

## Typing instructions (per device)
- Taiwan users type 注音 with the 注音 (Bopomofo) keyboard: macOS "Zhuyin –
  Traditional", iOS "Zhuyin", Android Gboard "注音", Windows "Microsoft
  Bopomofo". Pinyin users: macOS/iOS "Pinyin – Traditional", Windows
  "Microsoft Pinyin" set to Traditional output, Gboard "Pinyin" with
  Traditional. Check any typing step against the vendor's help page before
  marking it Confirmed.
