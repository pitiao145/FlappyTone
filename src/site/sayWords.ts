/**
 * The /say/* word pages: one record per page, rendered by
 * `src/site/pages/SayWord.tsx`. Every `id` is a published catalog word whose
 * clip a guest ticket may play (sampler list or no TOCFL level), and whose
 * geometry is copied into `sayClips.ts`; `sayWords.test.ts` checks all of it.
 *
 * Hanzi are Traditional (CLAUDE.md hard rule 9). Pinyin is WRITTEN (TOCFL base
 * tones); `said` is how it is spoken when that differs. 注音 is derived from
 * the pinyin by `zhuyin.ts`, never typed. The "real speech" claims describe the
 * measured recordings (textbook and natural takes, default speaker).
 *
 * Route metadata (title, description) lives in `routes.ts`' `SAY_ROUTES`, so
 * /app's bundle never carries this copy.
 */

export type ToneTarget = "1" | "2" | "3" | "4" | "3-3" | "3-4";

export interface SayCard {
  /** Catalog id: Listen and See it play this recording. */
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  /** Colour of the See it line: the first spoken tone. */
  tone: 0 | 1 | 2 | 3 | 4;
}

export interface SayExample {
  hanzi: string;
  pinyin: string;
  english: string;
  note: string;
}

export interface SayFaq {
  q: string;
  a: string;
}

export interface SayWord {
  slug: string;
  /** The English phrase as a heading/card label. */
  phrase: string;
  h1: string;
  hanzi: string;
  pinyin: string;
  /** Spoken pinyin when sandhi or a neutral tone changes it. */
  said?: string;
  english: string;
  /** The answer, in the first two sentences of the page. */
  answer: string;
  /** The recordings shown in the word card. */
  cards: SayCard[];
  /** Shown under the card (e.g. "full recording coming"). */
  cardNote?: string;
  /** "Standard and spoken": what the two recordings show. */
  real: string[];
  /** One line for the /say index card. */
  teaser: string;
  /** "Common mistakes": what learners get wrong, and the fix. */
  mistakes: { wrong: string; fix: string }[];
  /** One line per syllable. */
  syllables: { hanzi: string; pinyin: string; text: string }[];
  uses: SayExample[];
  taiwan?: string;
  faq: SayFaq[];
  /** The /tools/tone-visualizer target for "Practise this tone". */
  toneTarget: ToneTarget;
  toneTargetLabel: string;
  /**
   * The word "Practise this exact word" opens in the app's visualiser
   * (`?word=`). Defaults to the first card.
   */
  practiseWordId?: string;
  /** Slugs of 2–3 sibling pages for "More words". */
  siblings: string[];
}

export const SAY_WORDS: SayWord[] = [
  {
    slug: "thank-you",
    phrase: "Thank you",
    h1: "How to say thank you in Chinese: 謝謝 (xièxie)",
    hanzi: "謝謝",
    pinyin: "xiè xie",
    english: "thank you; thanks",
    answer:
      "Thank you in Chinese is 謝謝, written xièxie in pinyin and ㄒㄧㄝˋ ˙ㄒㄧㄝ in 注音. The first 謝 is a falling fourth tone, and the second is a short, light neutral tone that stays low, so 謝謝 sounds like one fall, with the weight on the first syllable.",
    cards: [
      { id: "xiexie40", hanzi: "謝謝", pinyin: "xiè xie", english: "thank you", tone: 4 },
    ],
    real: [
      "In the standard recording, the first 謝 falls from the top of her voice to the bottom. The second 謝 stays down there, short and almost flat. That matches the dictionary: tone 4, then a neutral tone.",
      "The spoken recording is shorter, about half a second. The fall starts in the middle of her voice, not at the top, and the second syllable is just the end of the same fall. Say 謝謝 as one fall, not as two separate tone 4s.",
    ],
    teaser: "Two syllables, one fall: why the second 謝 is light.",
    mistakes: [
      { wrong: "Saying both syllables as full falls: xiè xiè.", fix: "Fall once on the first 謝, then let the second stay low and short." },
      { wrong: "Lifting the second syllable back up, so it sounds like a question.", fix: "Keep it at the bottom of your voice, where the first one ended." },
      { wrong: "Saying x like the English sh or s.", fix: "Tongue tip behind the lower teeth, lips slightly spread, then a soft sh." },
    ],
    syllables: [
      {
        hanzi: "謝",
        pinyin: "xiè",
        text: "Tone 4. x is a soft sh with the tongue tip behind the lower teeth, ie sounds like ye in yes. Start high and fall all the way down.",
      },
      {
        hanzi: "謝",
        pinyin: "xie",
        text: "Neutral tone. Same syllable, but short, quiet and low, right where the first one ended. Do not lift it back up.",
      },
    ],
    uses: [
      { hanzi: "謝謝你", pinyin: "xiè xie nǐ", english: "thank you (to one person)", note: "Thanks to one person." },
      { hanzi: "謝謝大家", pinyin: "xiè xie dà jiā", english: "thank you, everyone", note: "To a group, at the end of a talk or a class." },
      { hanzi: "多謝", pinyin: "duō xiè", english: "many thanks", note: "Short and friendly; common in Taiwan." },
      { hanzi: "不客氣", pinyin: "bú kè qì", english: "you're welcome", note: "The usual reply, see the page on you're welcome." },
    ],
    taiwan:
      "In Taiwan you will also hear 謝啦 (xiè la), a casual thanks between friends, and people often answer 謝謝 with 不會 (bú huì, not at all) instead of 不客氣. The second 謝 is light in Taiwan too.",
    faq: [
      {
        q: "Is it xièxie or xièxiè?",
        a: "Dictionaries write xièxie: the second syllable is a neutral tone, short and low. Two full tone 4s are understood, but sound slow and stiff.",
      },
      {
        q: "How do you reply to 謝謝?",
        a: "不客氣 (bú kè qì, you're welcome) is the textbook reply. In Taiwan 不會 (bú huì) is just as common in everyday talk, and 沒事 (méi shì, it's nothing) is casual.",
      },
      {
        q: "How do I make the x sound in xie?",
        a: "Put the tip of your tongue behind your lower front teeth, smile slightly and say sh. It is softer and more forward than the English sh, and there is no s-h split.",
      },
      {
        q: "Is 謝謝 polite enough for every situation?",
        a: "Yes. It works with friends, shop staff and teachers. For more weight add 你 or 您 (xiè xie nín), or say 非常感謝 (fēi cháng gǎn xiè, thank you very much).",
      },
    ],
    toneTarget: "4",
    toneTargetLabel: "tone 4",
    siblings: ["youre-welcome", "sorry", "please"],
  },
  {
    slug: "hello",
    phrase: "Hello",
    h1: "How to say hello in Chinese: 你好 (nǐ hǎo)",
    hanzi: "你好",
    pinyin: "nǐ hǎo",
    said: "ní hǎo",
    english: "hello",
    answer:
      "Hello in Chinese is 你好, written nǐ hǎo in pinyin and ㄋㄧˇ ㄏㄠˇ in 注音. Both syllables are written with tone 3, but when two third tones meet, the first one rises like a tone 2, so you actually say ní hǎo: a rise on 你, then a low dip on 好.",
    cards: [
      { id: "ni3", hanzi: "你", pinyin: "nǐ", english: "you", tone: 3 },
      { id: "hao3", hanzi: "好", pinyin: "hǎo", english: "good", tone: 3 },
    ],
    cardNote:
      "These are 你 and 好 recorded on their own. A recording of 你好 as one word is coming soon.",
    real: [
      "Said alone, 你 and 好 are both tone 3. In the standard recordings each one drops to the bottom of her voice and comes back up near the top.",
      "In 你好, two tone 3s meet, so the first one changes to a rise: ní hǎo. This happens to every 3+3 pair in Mandarin.",
      "In the spoken recording, 好 drops low and only comes back to the middle. At the end of 你好, keep 好 low with a short lift, not a big rise.",
    ],
    teaser: "Written nǐ hǎo, said ní hǎo: the most common tone change.",
    mistakes: [
      { wrong: "Saying two full dips: nǐ hǎo with both syllables going down and up.", fix: "Make 你 rise (ní), then dip on 好." },
      { wrong: "Ending 好 with a big rise, so hello sounds like a question.", fix: "Keep 好 low, with only a small lift at the end." },
      { wrong: "Saying hao like the English how with a hard h.", fix: "The h is breathier, from further back in the throat." },
    ],
    syllables: [
      {
        hanzi: "你",
        pinyin: "nǐ → ní",
        text: "Written tone 3, said tone 2 here: start in the middle of your voice and rise. n as in no, i as in see.",
      },
      {
        hanzi: "好",
        pinyin: "hǎo",
        text: "Tone 3: drop low and stay low, with a small lift at the end. h is breathier than English h, ao rhymes with how.",
      },
    ],
    uses: [
      { hanzi: "您好", pinyin: "nín hǎo", english: "hello (polite)", note: "To an older person, a customer or on the phone at work." },
      { hanzi: "大家好", pinyin: "dà jiā hǎo", english: "hello, everyone", note: "Opening a class, a talk or a video." },
      { hanzi: "早安", pinyin: "zǎo ān", english: "good morning", note: "The usual morning greeting in Taiwan." },
      { hanzi: "你好嗎", pinyin: "nǐ hǎo ma", english: "how are you?", note: "A real question, not a greeting; often answered 很好 or 還不錯." },
    ],
    taiwan:
      "你好 is correct everywhere, but friends in Taiwan rarely say it to each other. 嗨 (hāi) and 哈囉 (hā luó) are the casual hellos, 早安 is the morning greeting, and in shops staff greet you with 歡迎光臨 (huān yíng guāng lín, welcome).",
    faq: [
      {
        q: "Why is 你好 said ní hǎo when it is written nǐ hǎo?",
        a: "Two third tones in a row: the first becomes a rising tone. Pinyin keeps the written tone, so you have to know the rule. It applies to every 3+3 pair, like 可以 (kě yǐ, said ké yǐ) and 很好 (hěn hǎo).",
      },
      {
        q: "Is 你好 too formal?",
        a: "No, but it is a bit stiff between friends. It is right for strangers, emails and first meetings. With friends, 嗨 or just their name works better.",
      },
      {
        q: "How do I reply to 你好?",
        a: "Say 你好 back. If someone asks 你好嗎 (how are you?), answer 很好 (hěn hǎo, good), 還不錯 (hái bú cuò, not bad) or 還好 (hái hǎo, okay).",
      },
      {
        q: "Should 好 rise at the end?",
        a: "Only a little. Said alone and slowly it rises back up, but at the end of 你好 in normal speech it stays low and ends in the middle of your voice. A big rise at the end sounds like a question.",
      },
    ],
    toneTarget: "3-3",
    toneTargetLabel: "the 3+3 tone change",
    siblings: ["goodbye", "thank-you", "please"],
  },
  {
    slug: "goodbye",
    phrase: "Goodbye",
    h1: "How to say goodbye in Chinese: 再見 (zàijiàn)",
    hanzi: "再見",
    pinyin: "zài jiàn",
    english: "goodbye; see you",
    answer:
      "Goodbye in Chinese is 再見, written zàijiàn in pinyin and ㄗㄞˋ ㄐㄧㄢˋ in 注音. Both syllables are tone 4, a falling tone, but the second fall starts lower than the first, and the second fall starts a little lower than the first.",
    cards: [
      { id: "zaijian44", hanzi: "再見", pinyin: "zài jiàn", english: "goodbye", tone: 4 },
    ],
    real: [
      "In the standard recording, 再 falls from the top of her voice to the bottom. 見 starts a little lower and falls to the bottom again.",
      "In the spoken recording, 再 hardly falls. It stays level in the upper middle of her voice, and only 見 falls. The whole word takes about 0.6 seconds.",
    ],
    teaser: "Two falling tones, and why the second starts lower.",
    mistakes: [
      { wrong: "Two identical falls from the top of your voice.", fix: "Start 見 a little lower than 再." },
      { wrong: "Saying zai with an English z.", fix: "z is closer to the ds in reads." },
      { wrong: "Saying jian like the English name Jan.", fix: "ian sounds like yen: ji-yen, in one syllable." },
    ],
    syllables: [
      {
        hanzi: "再",
        pinyin: "zài",
        text: "Tone 4. z is like ds in reads, ai like the word eye. Start high and fall.",
      },
      {
        hanzi: "見",
        pinyin: "jiàn",
        text: "Tone 4. j is a soft j with the tongue tip down, ian sounds like yen. Start a little lower than 再 and fall to the bottom.",
      },
    ],
    uses: [
      { hanzi: "拜拜", pinyin: "bāi bāi", english: "bye-bye", note: "The everyday goodbye in Taiwan, used by all ages." },
      { hanzi: "明天見", pinyin: "míng tiān jiàn", english: "see you tomorrow", note: "見 alone means see you; put the time in front." },
      { hanzi: "下次見", pinyin: "xià cì jiàn", english: "see you next time", note: "To a teacher or a shop you come back to." },
      { hanzi: "慢走", pinyin: "màn zǒu", english: "take care (lit. walk slowly)", note: "Said by the host to a leaving guest." },
    ],
    taiwan:
      "In Taiwan 拜拜 is far more common than 再見 in daily life, from friends to shop staff; 再見 sounds a little more formal or final. In northern mainland speech the second 見 is sometimes lighter, while Taiwan speakers tend to keep both syllables full.",
    faq: [
      {
        q: "Does 再見 mean see you again?",
        a: "Literally yes: 再 is again and 見 is to see. In use it is a general goodbye, even to someone you will not see again.",
      },
      {
        q: "Should both syllables fall the same way?",
        a: "No. Let the second fall start a bit lower. Two big falls from the top sound harsh. At normal speed the first one hardly falls.",
      },
      {
        q: "Is 拜拜 Chinese?",
        a: "It comes from English bye-bye, but it is normal Mandarin now, especially in Taiwan. It is written 拜拜 and usually said bāi bāi or bái bai.",
      },
    ],
    toneTarget: "4",
    toneTargetLabel: "tone 4",
    siblings: ["hello", "thank-you", "sorry"],
  },
  {
    slug: "please",
    phrase: "Please",
    h1: "How to say please in Chinese: 請 (qǐng)",
    hanzi: "請",
    pinyin: "qǐng",
    english: "please; to invite",
    answer:
      "Please in Chinese is 請, written qǐng in pinyin and ㄑㄧㄥˇ in 注音. It is a third tone, which dips low before it rises, and it goes in front of a verb (請坐, please sit) rather than at the end of a sentence like English please.",
    cards: [{ id: "qing3", hanzi: "請", pinyin: "qǐng", english: "please", tone: 3 }],
    real: [
      "In the standard recording, 請 starts in the upper middle of her voice, drops to the bottom, then rises to the top. That is the full tone 3.",
      "In the spoken recording, it still drops to the bottom, but the rise only comes back to the middle. The low part matters most; the rise is short.",
      "Before another tone 3, 請 rises instead: 請你 (qǐng nǐ) is said qíng nǐ.",
    ],
    teaser: "A low tone 3 that goes before the verb.",
    mistakes: [
      { wrong: "Putting 請 at the end of the sentence, like English please.", fix: "Put it before the verb: 請坐, 請等一下." },
      { wrong: "Starting low and only rising, which sounds like tone 2.", fix: "Drop first, then lift. The low part matters most." },
      { wrong: "Saying q as an English k or kw.", fix: "q is close to the ch in cheese, with the tongue tip low." },
    ],
    syllables: [
      {
        hanzi: "請",
        pinyin: "qǐng",
        text: "Tone 3. q is like ch in cheese with the tongue tip behind the lower teeth, ing like the end of sing. Go low, then lift.",
      },
    ],
    uses: [
      { hanzi: "請問", pinyin: "qǐng wèn", english: "excuse me, may I ask", note: "The polite way to start a question to a stranger." },
      { hanzi: "請坐", pinyin: "qǐng zuò", english: "please sit down", note: "請 + a verb: please do this." },
      { hanzi: "請進", pinyin: "qǐng jìn", english: "please come in", note: "At a door, an office or a classroom." },
      { hanzi: "麻煩你", pinyin: "má fán nǐ", english: "could you please…", note: "Softer than 請 when you ask a favour." },
    ],
    taiwan:
      "請 is used the same way in Taiwan and the mainland. In Taiwan, 請 also means to treat someone: 我請你 (wǒ qǐng nǐ, said wó qǐng nǐ) means it's on me. For favours, 麻煩你 and 不好意思 are often more natural than 請.",
    faq: [
      {
        q: "Where does 請 go in a sentence?",
        a: "Before the verb: 請說 (please say it), 請等一下 (please wait a moment). Putting it at the end, like English please, sounds wrong.",
      },
      {
        q: "Is the q in qǐng like an English q?",
        a: "No. It is close to the ch in cheese, made with the tongue tip low behind the lower teeth and a puff of air. There is no kw sound.",
      },
      {
        q: "Do I have to say the full dip and rise?",
        a: "Slowly and alone, yes. In normal speech the low part matters most and the rise is short. A 請 that starts low and only rises sounds like a tone 2.",
      },
    ],
    toneTarget: "3",
    toneTargetLabel: "tone 3",
    siblings: ["thank-you", "sorry", "hello"],
  },
  {
    slug: "sorry",
    phrase: "Sorry",
    h1: "How to say sorry in Chinese: 對不起 (duìbuqǐ)",
    hanzi: "對不起",
    pinyin: "duì bù qǐ",
    said: "duì bu qǐ",
    english: "sorry; excuse me",
    answer:
      "Sorry in Chinese is 對不起, written duìbuqǐ in pinyin and ㄉㄨㄟˋ ㄅㄨˋ ㄑㄧˇ in 注音. 對 falls (tone 4), 不 is a quick, light syllable in everyday speech, and 起 dips low (tone 3), so the word ends low.",
    cards: [
      { id: "duibuqi403", hanzi: "對不起", pinyin: "duì bù qǐ", english: "sorry", tone: 4 },
    ],
    real: [
      "In the standard recording, all three syllables are full. 對 falls from the top to the middle, 不 comes back up and falls again, and 起 drops to the bottom of her voice, then lifts to the middle.",
      "In normal speech the middle 不 is short and light, so many dictionaries write duìbuqǐ. Say 對 and 起 clearly and keep 不 quick.",
      "The word ends low, on 起. If you end it high, it sounds like a question.",
    ],
    teaser: "對不起 ends low. When to say 不好意思 instead.",
    mistakes: [
      { wrong: "Ending 起 high, so the apology sounds like a question.", fix: "Let 起 drop low at the end." },
      { wrong: "Stressing 不 as much as 對 and 起.", fix: "Keep 不 short and light in normal speech." },
      { wrong: "Using 對不起 for every small thing.", fix: "For small things, 不好意思 is more natural in Taiwan." },
    ],
    syllables: [
      { hanzi: "對", pinyin: "duì", text: "Tone 4: a fall from high. ui sounds like way." },
      { hanzi: "不", pinyin: "bù / bu", text: "Tone 4 in careful speech, light and quick in normal speech. u as in boo." },
      { hanzi: "起", pinyin: "qǐ", text: "Tone 3: drop low. q like ch in cheese, i as in see." },
    ],
    uses: [
      { hanzi: "不好意思", pinyin: "bù hǎo yì si", english: "excuse me; sorry (small things)", note: "The everyday sorry in Taiwan: bumping someone, asking for help." },
      { hanzi: "抱歉", pinyin: "bào qiàn", english: "I apologise", note: "More formal; in writing and announcements." },
      { hanzi: "對不起，我來晚了", pinyin: "duì bu qǐ, wǒ lái wǎn le", english: "sorry, I'm late", note: "對不起 for a real mistake." },
      { hanzi: "沒關係", pinyin: "méi guān xi", english: "it's okay", note: "The usual reply to 對不起." },
    ],
    taiwan:
      "Taiwan speakers use 不好意思 for most small apologies and save 對不起 for real ones. Taiwan dictionaries write 不 in 對不起 with a full tone 4, and careful Taiwan speech keeps more of it than northern mainland speech does.",
    faq: [
      {
        q: "What is the difference between 對不起 and 不好意思?",
        a: "對不起 is a real apology for something you did wrong. 不好意思 is lighter: excuse me, sorry to bother you, a bit embarrassing. In Taiwan you will hear 不好意思 many times a day.",
      },
      {
        q: "Is it duìbùqǐ or duìbuqǐ?",
        a: "Both appear. The 不 is a fourth tone in careful speech and in Taiwan dictionaries, and light in fast speech. Either way, keep it short.",
      },
      {
        q: "How do I answer 對不起?",
        a: "沒關係 (méi guān xi, it's okay) or 沒事 (méi shì, no problem). 不會 (bú huì) also works in Taiwan.",
      },
    ],
    toneTarget: "3",
    toneTargetLabel: "tone 3 (the final 起)",
        siblings: ["no-problem", "thank-you", "please"],
  },
  {
    slug: "youre-welcome",
    phrase: "You're welcome",
    h1: "How to say you're welcome in Chinese: 不客氣 (bú kèqì)",
    hanzi: "不客氣",
    pinyin: "bù kè qì",
    said: "bú kè qì",
    english: "you're welcome",
    answer:
      "You're welcome in Chinese is 不客氣, written bù kèqì in pinyin and ㄅㄨˋ ㄎㄜˋ ㄑㄧˋ in 注音. All three syllables are written with tone 4, but 不 before another fourth tone rises instead, so you say bú kè qì: a rise, then two falls.",
    cards: [
      { id: "bukeqi444", hanzi: "不客氣", pinyin: "bù kè qì", english: "you're welcome", tone: 2 },
    ],
    real: [
      "不 changes before a tone 4: it rises instead of falling. So 不客氣 is said bú kè qì.",
      "In the standard recording, 不 rises from the middle of her voice, 客 falls from the top to the middle, and 氣 rises a little and falls again.",
      "The spoken recording takes about 0.7 seconds. The whole word stays in the upper middle of her voice, with small bumps instead of three big falls.",
    ],
    teaser: "Written bù kèqì, said bú kèqì: the 不 rule.",
    mistakes: [
      { wrong: "Saying bù with a fall before 客.", fix: "Before a tone 4, 不 rises: bú kè qì." },
      { wrong: "Giving all three syllables the same big fall.", fix: "Keep it light and quick, mostly in the upper part of your voice." },
      { wrong: "Using 不客氣 to answer an apology.", fix: "Answer sorry with 沒關係 or 沒事." },
    ],
    syllables: [
      { hanzi: "不", pinyin: "bù → bú", text: "Written tone 4, said tone 2 because a tone 4 follows. Short and rising." },
      { hanzi: "客", pinyin: "kè", text: "Tone 4: fall from high. k with a puff of air, e like the u in fun said further back." },
      { hanzi: "氣", pinyin: "qì", text: "Tone 4: fall. q like ch in cheese, i as in see." },
    ],
    uses: [
      { hanzi: "不會", pinyin: "bú huì", english: "not at all", note: "The everyday reply to thanks in Taiwan." },
      { hanzi: "不用謝", pinyin: "bú yòng xiè", english: "no need to thank me", note: "Friendly and common everywhere." },
      { hanzi: "沒事", pinyin: "méi shì", english: "it's nothing", note: "Casual, between friends." },
      { hanzi: "別客氣", pinyin: "bié kè qì", english: "don't be so polite", note: "Also used when offering food or help." },
    ],
    taiwan:
      "In Taiwan, 不會 (bú huì) is often the first answer to 謝謝, and 不客氣 sounds a little more formal. Both are fine. 不 is said bú in both, because 會 and 客 are tone 4.",
    faq: [
      {
        q: "Why is 不 said bú here?",
        a: "不 becomes a rising tone before any fourth tone: 不客氣, 不會, 不要, 不錯. Before tones 1, 2 and 3 it stays bù. Pinyin usually keeps the written bù, so you have to know the rule.",
      },
      {
        q: "Does 不客氣 literally mean don't be polite?",
        a: "Yes: 不 is not and 客氣 is polite or formal. The idea is that thanks are not needed between you.",
      },
      {
        q: "Can I use 不客氣 when someone apologises?",
        a: "No. For an apology, say 沒關係 (méi guān xi, it's okay) or 沒事 (méi shì). 不客氣 answers thanks.",
      },
    ],
    toneTarget: "4",
    toneTargetLabel: "tone 4",
        siblings: ["thank-you", "no-problem", "sorry"],
  },
  {
    slug: "no-problem",
    phrase: "No problem",
    h1: "How to say no problem in Chinese: 沒關係 (méi guānxi)",
    hanzi: "沒關係",
    pinyin: "méi guān xi",
    english: "it's okay; it doesn't matter",
    answer:
      "No problem, in the sense of it's okay, is 沒關係 in Chinese: méi guānxi in pinyin and ㄇㄟˊ ㄍㄨㄢ ˙ㄒㄧ in 注音. It is the usual reply to an apology: 沒 rises (tone 2), 關 is high and level (tone 1), and 係 is short and light.",
    cards: [
      { id: "meiguanxi210", hanzi: "沒關係", pinyin: "méi guān xi", english: "it's okay", tone: 2 },
    ],
    real: [
      "In the standard recording, 沒 starts low and rises, 關 stays high, and 係 drops back to the middle, short and light.",
      "In the spoken recording, she rises into 關 and stays up. 係 is quick and does not drop. A heavy drop at the end can sound unfriendly.",
    ],
    teaser: "沒關係 answers sorry; 沒問題 answers a request.",
    mistakes: [
      { wrong: "Using 沒關係 when someone asks you for a favour.", fix: "Say 沒問題 (méi wèn tí) for yes, no problem." },
      { wrong: "Dropping heavily on the last syllable.", fix: "Rise into 關 and stay up; keep 係 short." },
      { wrong: "Saying guan like gwan with a flat a.", fix: "uan sounds like wan; the g is unaspirated, like a soft k." },
    ],
    syllables: [
      { hanzi: "沒", pinyin: "méi", text: "Tone 2: start in the middle and rise. ei like the ay in may." },
      { hanzi: "關", pinyin: "guān", text: "Tone 1: high and level. uan sounds like wan." },
      { hanzi: "係", pinyin: "xi", text: "Light and short in this phrase. x like a soft sh." },
    ],
    uses: [
      { hanzi: "沒問題", pinyin: "méi wèn tí", english: "no problem (I can do it)", note: "Agreeing to a request, not answering an apology." },
      { hanzi: "沒事", pinyin: "méi shì", english: "it's nothing; I'm fine", note: "Casual reply to sorry or to are you okay?" },
      { hanzi: "不要緊", pinyin: "bú yào jǐn", english: "it doesn't matter", note: "Also it's not serious." },
      { hanzi: "沒關係，慢慢來", pinyin: "méi guān xi, màn màn lái", english: "it's okay, take your time", note: "A kind answer to someone who is late or slow." },
    ],
    taiwan:
      "Taiwan dictionaries give 係 in 關係 a full tone 4 (guānxì), and some Taiwan speakers keep it; in normal speech it is short either way. 沒事 and 不會 are very common casual replies in Taiwan.",
    faq: [
      {
        q: "What is the difference between 沒關係 and 沒問題?",
        a: "沒關係 answers an apology: it's okay, never mind. 沒問題 answers a request: no problem, sure, I can do that. Swapping them sounds odd.",
      },
      {
        q: "Is 係 neutral or tone 4?",
        a: "Mainland dictionaries mark it neutral (guānxi); Taiwan's marks it tone 4 (guānxì). In the phrase 沒關係 it is short and unstressed in both places.",
      },
      {
        q: "How do I make it sound friendly?",
        a: "Keep it light and let it end up high on 關. A slow 沒關係 that drops at the end can sound annoyed.",
      },
    ],
    toneTarget: "2",
    toneTargetLabel: "tone 2",
        siblings: ["sorry", "youre-welcome", "thank-you"],
  },
  {
    slug: "yuan",
    phrase: "Yuan",
    h1: "How to pronounce yuan in Chinese: 元 (yuán)",
    hanzi: "元",
    pinyin: "yuán",
    english: "yuan (unit of money); first",
    answer:
      "Yuan is pronounced yuán: one syllable, said like yü-en, with a rising second tone, and written 元 (ㄩㄢˊ in 注音). It is not you-wan or yoo-ann: the yu is the rounded ü vowel, as in German über or French tu.",
    cards: [{ id: "yuan2", hanzi: "元", pinyin: "yuán", english: "yuan", tone: 2 }],
    real: [
      "In the standard recording, 元 starts low, dips a little, then rises to the top of her voice. The small dip at the start is normal for tone 2.",
      "In the spoken recording, it is shorter and the rise ends in the upper middle of her voice, but it is still low first, then up. Said flat, as English speakers often say yuan, the tone is gone.",
    ],
    teaser: "One syllable, a rising tone and the ü vowel.",
    mistakes: [
      { wrong: "Saying you-ahn, in two syllables.", fix: "One syllable: ü (rounded ee), then en." },
      { wrong: "Saying it flat, with no tone.", fix: "Start low, then rise clearly in the second half." },
      { wrong: "Saying yuan for every price.", fix: "In speech, prices use 塊 (kuài): 十塊." },
    ],
    syllables: [
      {
        hanzi: "元",
        pinyin: "yuán",
        text: "Tone 2. Round your lips for ü (say ee with rounded lips), then open to en. The pinyin spelling yu hides the ü.",
      },
    ],
    uses: [
      { hanzi: "一百元", pinyin: "yì bǎi yuán", english: "100 yuan / 100 dollars", note: "元 is the written unit for prices in Taiwan and the mainland." },
      { hanzi: "塊", pinyin: "kuài", english: "dollar, buck (spoken)", note: "In speech people usually say 塊: 十塊 (shí kuài), ten dollars." },
      { hanzi: "人民幣", pinyin: "rén mín bì", english: "renminbi, China's currency", note: "Its unit is the yuan." },
      { hanzi: "新臺幣", pinyin: "xīn tái bì", english: "New Taiwan dollar", note: "Taiwan's currency; its unit is also 元." },
    ],
    taiwan:
      "In Taiwan the unit of the New Taiwan dollar is also 元, and banknotes print the formal 圓. In speech, both Taiwan and the mainland usually say 塊 (kuài) for prices: 五十塊 is fifty dollars.",
    faq: [
      {
        q: "How do you pronounce yuan in English?",
        a: "The closest English is yü-en, one syllable: round your lips as for oo, say ee, then en. Most English speakers say you-ahn, which a Chinese listener may not catch.",
      },
      {
        q: "Is yuan the same as renminbi?",
        a: "Renminbi (人民幣) is the name of China's currency; the yuan (元) is its unit, like pound sterling and pound. Taiwan's dollar is also counted in 元.",
      },
      {
        q: "Why does 元 dip before it rises?",
        a: "Many tone 2 syllables start with a small dip, especially in Taiwan speech. What matters is the clear rise in the second half. A deep, low dip with a late rise would sound like tone 3.",
      },
      {
        q: "What tone is yuan?",
        a: "Tone 2, the rising tone, marked with ˊ: yuán. In 注音 it is ㄩㄢˊ.",
      },
    ],
    toneTarget: "2",
    toneTargetLabel: "tone 2",
    siblings: ["please", "thank-you", "goodbye"],
  },
];

export function sayWordFor(slug: string): SayWord | undefined {
  return SAY_WORDS.find((w) => w.slug === slug);
}
