import { PipCta } from "../Pip.tsx";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { OG_IMAGE } from "../siteFiles.ts";
import { ToneChart } from "../ToneChart.tsx";
import { PlayButton, SeeButton } from "../WordButtons.tsx";
import { markSyllable, parsePinyin, toZhuyin } from "../zhuyin.ts";

const PATH = "/chinese-tones";
const TOOL = "/tools/tone-marks";

/** An example word: Traditional hanzi, marked pinyin, English. 注音 is derived. */
/** Catalog id (for its clip), hanzi, marked pinyin, English. */
type Example = [
  id: string,
  hanzi: string,
  pinyin: string,
  english: string,
  /** How it is said, when sandhi makes it differ from the written pinyin. */
  said?: string,
];

/** Live two-syllable examples for the sandhi and Taiwan sections (guest-playable clips). */
const SANDHI_33: Example[] = [["keyi33", "可以", "kě yǐ", "can, may", "ké yǐ"]];
const SANDHI_HALF3: Example[] = [
  ["xihuan31", "喜歡", "xǐ huān", "to like"],
  ["meiguo32", "美國", "měi guó", "America"],
];
const SANDHI_YI: Example[] = [
  ["yixia24", "一下", "yī xià", "a bit", "yí xià"],
  ["yiqi13", "一起", "yī qǐ", "together", "yì qǐ"],
];
const SANDHI_BU: Example[] = [
  ["bucuo44", "不錯", "bù cuò", "not bad", "bú cuò"],
];
const TAIWAN_FULL: Example[] = [["pengyou23", "朋友", "péng yǒu", "friend"]];

interface ToneSection {
  id: string;
  tone: 0 | 1 | 2 | 3 | 4;
  title: string;
  shape: string;
  mistake: string;
  /** What the measured recordings show, against the textbook number. */
  real?: string;
  examples: Example[];
}

// Every example is a word in the shipped catalog (src/data/wordsFallback.json),
// in Traditional characters (CLAUDE.md hard rule 9).
const SECTIONS: ToneSection[] = [
  {
    id: "tone-1",
    tone: 1,
    title: "Tone 1: high and level (ˉ)",
    shape:
      "Start high in your voice and hold it flat, like singing one long note. Chao numbers write it 55: it starts at 5 and stays at 5. It is not louder than the other tones, only higher and steadier.",
    mistake:
      "Starting at a normal speaking pitch, so it sounds flat but low, or letting it sag at the end as if finishing an English sentence. Keep it up to the last moment.",
    real: "In our native speaker's recordings, tone 1 sits at about 4.6, between 4 and 5, not at the very top. It stays there at everyday speed too. Aim for high and steady, not for your highest note.",
    examples: [
      ["ma1b", "媽", "mā", "mother"],
      ["shu1", "書", "shū", "book"],
      ["hua1", "花", "huā", "flower"],
    ],
  },
  {
    id: "tone-2",
    tone: 2,
    title: "Tone 2: rising (ˊ)",
    shape:
      "Start in the middle of your range and rise to the top, like a surprised “what?” in English. Chao 35. Native speakers often hold the start for a moment and then rise smoothly through the rest of the syllable.",
    mistake:
      "Dipping too deep before the rise, which makes it sound like tone 3, or rising too little, which makes it sound like tone 1. The turn should be early and shallow.",
    real: "Real tone 2 is not a straight line from 3 to 5. Our speaker starts near 2.8, dips a little to about 2.3 in the first third, then climbs to near 5. At everyday speed it often stops around 4.5.",
    examples: [
      ["ren2", "人", "rén", "person"],
      ["qian2", "錢", "qián", "money"],
      ["xue2", "學", "xué", "to study"],
    ],
  },
  {
    id: "tone-3",
    tone: 3,
    title: "Tone 3: low, dipping (ˇ)",
    shape:
      "Drop to the bottom of your range and stay low. Said alone or at the end of a phrase it comes back up, so the full shape is a dip: chao 214. Inside a phrase it usually stays low and never rises (the “half third tone”).",
    mistake:
      "Treating it as a rising tone with a small dip. The low part is what makes it tone 3; the rise is optional. Many learners also do the full dip-and-rise on every third tone, which sounds slow and exaggerated in normal speech.",
    real: "The textbook 214 ends at 4. In our speaker's careful recordings the dip reaches about 1.6 halfway through and the rise goes almost to 5. At everyday speed the dip is shallower (about 1.9) and the rise stops near 4, and inside a phrase there is often no rise at all.",
    examples: [
      ["ma3b", "馬", "mǎ", "horse"],
      ["hao3", "好", "hǎo", "good"],
      ["ni3", "你", "nǐ", "you"],
    ],
  },
  {
    id: "tone-4",
    tone: 4,
    title: "Tone 4: falling (ˋ)",
    shape:
      "Start high and fall fast to the bottom, like a firm “no!” or “stop!”. Chao 51. It is usually the shortest of the four tones.",
    mistake:
      "Not falling far enough, so it sounds like a soft tone 1, or starting too low, so there is no room to fall. Start at the top and commit to the drop.",
    real: "The textbook 51 starts at the top. Our speaker's tone 4 peaks a little later, at about 4.5, then falls to about 1.4. At everyday speed it falls less, to about 1.9, so the speed of the drop matters more than how far it goes.",
    examples: [
      ["ma4b", "罵", "mà", "to scold"],
      ["da4", "大", "dà", "big"],
      ["kuai4", "快", "kuài", "fast"],
    ],
  },
  {
    id: "neutral-tone",
    tone: 0,
    title: "The neutral tone (˙)",
    shape:
      "Some syllables, mostly grammar words and the second half of some words, are short and light with no shape of their own. Pinyin writes them with no mark; 注音 puts a dot (˙) in front. Their pitch depends on the tone before them: higher after tone 3, lower after tone 1, 2 or 4.",
    mistake:
      "Giving a neutral syllable a full tone. 什麼 is “shén me”, not “shén mè”. Keep it short and let it follow the syllable before it.",
    examples: [
      ["shenme20", "什麼", "shén me", "what"],
      ["nimen30", "你們", "nǐ men", "you (plural)"],
      ["baozi10", "包子", "bāo zi", "steamed bun"],
    ],
  },
];

export interface Faq {
  q: string;
  a: string;
}

/** Section 6 of the page, and the FAQPage JSON-LD. */
export const FAQ: Faq[] = [
  {
    q: "Why can't I hear the difference between Chinese tones?",
    a: "Because English uses pitch for emotion and questions, not for word meaning, so your ear has learned to ignore it inside a word. That is a habit, not a lack of talent. Tones become easier to hear once you know what shape to listen for, so start by learning the four shapes, then listen for them one pair at a time.",
  },
  {
    q: "Am I tone deaf if I can't hear Mandarin tones?",
    a: "Almost certainly not. Real tone deafness (amusia) is rare. Most learners who struggle with tones can tell a question from a statement in their own language, which uses the same pitch movement. What is missing is practice with pitch as a part of the word.",
  },
  {
    q: "Which tones are hardest to tell apart?",
    a: "Tone 2 and tone 3. Both go down and then up, so the difference is how low the dip goes and when the rise starts: tone 2 turns early and rises over most of the syllable, tone 3 drops low first. Tones 1 and 4 are usually the easiest pair.",
  },
  {
    q: "How do I practise hearing tones?",
    a: "Listen to a native speaker say minimal sets like mā, má, mǎ, mà, and say what you hear before you check. Then say them yourself and record or watch your own pitch. Seeing the shape of your voice makes it much easier to notice what your ear is not yet catching.",
  },
  {
    q: "Do I need to learn tones if people understand me from context?",
    a: "Context helps, but many common words differ only by tone, and wrong tones make you much harder to understand, especially in short answers with little context. Getting tones right early is also easier than fixing a habit later.",
  },
  {
    q: "How long does it take to get Chinese tones right?",
    a: "Most learners can produce the four tones in single words within a few weeks of regular practice. Keeping them right in fast, connected speech takes longer. Short, frequent practice out loud works better than long sessions.",
  },
];

/** Every example's catalog id: each has a published recording (exampleClips.test.ts). */
export const HUB_EXAMPLE_IDS = [
  ...SECTIONS.flatMap((s) => s.examples),
  ...SANDHI_33,
  ...SANDHI_HALF3,
  ...SANDHI_YI,
  ...SANDHI_BU,
  ...TAIWAN_FULL,
].map(([id]) => id);

function ExampleList({
  examples,
  tone,
}: {
  examples: Example[];
  tone: ToneSection["tone"];
}) {
  return (
    <ul className="site-examples">
      {examples.map(([id, hanzi, pinyin, english, said]) => (
        <li key={id}>
          <span className="hanzi" lang="zh-Hant-TW">
            {hanzi}
          </span>
          <span className="pinyin">
            {parsePinyin(pinyin).map((p, i) =>
              "syllable" in p ? (
                <span
                  key={i}
                  style={{ color: TONE_LINE_COLOR[p.syllable.tone] }}
                >
                  {markSyllable(p.syllable)}
                </span>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </span>
          <span className="zhuyin" lang="zh-Hant-TW">
            {toZhuyin(pinyin)}
          </span>
          <span className="english">{english}</span>
          {said && (
            <span className="said">
              said <strong>{said}</strong>
            </span>
          )}
          <span className="site-example-actions">
            <PlayButton id={id} label={`${hanzi} ${pinyin}`} />
            <SeeButton word={{ id, hanzi, pinyin, english, tone }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ChineseTones() {
  return (
    <div className="screen legal-screen site-page">
      <article className="legal-body">
        <h1>Chinese tones: the 4 Mandarin tones, explained</h1>
        <p className="site-answer">
          <strong>
            Mandarin Chinese has four tones plus a light neutral tone. Each tone
            is a pitch shape (high and level, rising, dipping, or falling), and
            changing the shape changes the word: mā (媽, mother), má (麻, hemp),
            mǎ (馬, horse) and mà (罵, to scold) are four different words.
          </strong>
        </p>
        <p>
          This page shows what each tone looks like, the mistake learners make
          most often with it, and how tones change when two of them meet. The
          examples use Traditional characters, with pinyin and 注音 (Zhuyin), as
          they are taught in Taiwan.
        </p>
        <p>
          Looking for one word? See{" "}
          <a href="/say">how to say hello, thank you and other common words</a>
          , each with a recording.
        </p>

        <h2>The four tones on one chart</h2>
        <p>
          Linguists describe tone height on a scale from 1 (the bottom of your
          voice) to 5 (the top). This chart is not drawn by hand: each line is
          the average pitch of many real words recorded by a native Taiwan
          Mandarin speaker, sampled across the length of the syllable.
        </p>
        <ToneChart />
        <p>
          Textbooks give each tone a fixed number (tone 1 = 55, tone 2 = 35,
          tone 3 = 214, tone 4 = 51). Real speech is close to that, but not the
          same, and FlappyTone's tunnels follow real speech. Each tone below
          says what the textbook teaches and what the recordings show. Two
          things stand out on the chart. First, the tones are relative to your
          own voice, so a deep voice and a high voice draw the same shapes at
          different pitches. Second, tones 2 and 3 both dip and rise in a
          careful citation form; what separates them is how low the dip goes and
          how early the rise starts.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id}>
            <h2 style={{ color: TONE_LINE_COLOR[s.tone] }}>{s.title}</h2>
            <p>{s.shape}</p>
            <p>
              <strong>Common mistake:</strong> {s.mistake}
            </p>
            {s.real && (
              <div className="site-real">
                <h3>In real speech</h3>
                <p>{s.real}</p>
              </div>
            )}
            <ExampleList examples={s.examples} tone={s.tone} />
          </section>
        ))}

        <section id="tone-sandhi">
          <h2>Tone sandhi: how tones change next to each other</h2>
          <p>
            Dictionaries and pinyin always write a word's own tone. In speech,
            some tones change when another tone follows them. This is called
            tone sandhi (變調). Four rules cover almost everything a learner
            meets, and every example below is a real recording: tap “See it” to
            watch the pitch the speaker actually made.
          </p>

          <h3>1. Third tone + third tone → second tone + third tone</h3>
          <p>
            When two third tones meet, the first one rises like a tone 2. 你好
            is written nǐ hǎo and said ní hǎo. In our recording of 可以, the
            first syllable climbs to about 4.3 before the second one dips to the
            floor. Studies of everyday Taiwan Mandarin find the changed tone is
            very close to a real tone 2, though not always identical, so saying
            it as a tone 2 is the right target.
          </p>
          <ExampleList examples={SANDHI_33} tone={2} />

          <h3>2. Third tone before any other tone stays low (半三聲)</h3>
          <p>
            Before a tone 1, 2, 4 or a neutral syllable, a third tone drops low
            and stays there. It never makes the full dip-and-rise you learn for
            a single syllable. Chao numbers write this “half third tone” as 21
            instead of 214. In 喜歡, the first syllable sinks to about 1.5 and
            holds; the jump up you hear is 歡 starting high and level.
          </p>
          <ExampleList examples={SANDHI_HALF3} tone={3} />

          <h3>3. 一 (yī, one) changes with the next tone</h3>
          <p>
            Alone, at the end of a word, when counting and in ordinals (第一),
            一 keeps tone 1. Before a tone 4 it becomes tone 2: 一下 is said yí
            xià, and the recording rises before it falls. Before tones 1, 2 and
            3 it becomes tone 4: 一起 is said yì qǐ, a fall from the top.
          </p>
          <ExampleList examples={SANDHI_YI} tone={4} />

          <h3>4. 不 (bù, not) becomes tone 2 before tone 4</h3>
          <p>
            不 is tone 4, except before another tone 4, where it becomes tone 2:
            不錯 is said bú cuò, 不是 bú shì, 不要 bú yào. Before any other tone
            it stays bù: 不好 bù hǎo, 不來 bù lái. In our recording of 不錯, 不
            rises from about 2 to the top before 錯 falls.
          </p>
          <ExampleList examples={SANDHI_BU} tone={4} />

          <p>
            FlappyTone's tunnels are measured from these recordings, so a tone
            pair's tunnel already has the change built in. Fly 可以 as ké yǐ and
            you stay inside it. The game shows the spoken tones above each word,
            next to the written pinyin.
          </p>
        </section>

        <section id="taiwan-vs-mainland">
          <h2>Taiwan vs mainland Mandarin tones</h2>
          <p>
            Taiwan's 國語 and mainland China's 普通話 use the same four tones
            and the same sandhi rules. The differences are in which words get
            which tone, and in how some tones are usually said:
          </p>
          <ul className="site-rules">
            <li>
              <strong>Fewer neutral tones in Taiwan.</strong> Many two-syllable
              words that end light on the mainland keep a full tone in Taiwan:
              朋友 péngyǒu, 學生 xuéshēng, 先生 xiānshēng. In our recording of
              朋友, 友 makes a full third-tone dip, not a short light syllable.
            </li>
            <li>
              <strong>Some words have a different standard tone.</strong> 星期
              (week) is xīngqí in Taiwan and xīngqī on the mainland. 垃圾
              (garbage) is lèsè in Taiwan and lājī on the mainland. 和 (and) is
              often said hàn in Taiwan.
            </li>
            <li>
              <strong>The third tone is usually low.</strong> Taiwan speakers
              use the low 21 form in most positions, keeping the rise mostly for
              a word said alone or with emphasis.
            </li>
            <li>
              <strong>Writing.</strong> Taiwan uses Traditional characters and
              teaches pronunciation with 注音 (Bopomofo); the mainland uses
              Simplified characters and pinyin.
            </li>
          </ul>
          <ExampleList examples={TAIWAN_FULL} tone={3} />
          <p>
            Both are standard, and speakers of each understand the other without
            trouble. FlappyTone's recordings are Taiwan Mandarin, so the tunnels
            follow Taiwan's tones and Taiwan's rhythm.
          </p>
        </section>

        <section id="faq">
          <h2>Can't hear the tones? Common questions</h2>
          <p>
            Test your ear first: the free{" "}
            <a href="/tools/tone-test">Chinese tones test</a> plays ten words and
            shows which tones you mix up.
          </p>
          {FAQ.map((f) => (
            <details key={f.q} className="site-faq" open>
              <summary>
                <h3>{f.q}</h3>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <PipCta
          path={PATH}
          title="Practise the tones out loud"
          body="Reading about tones helps, but you learn them by saying them. In FlappyTone your voice flies the bird through a tunnel shaped like the tone, so you see right away if your pitch made the right shape. It checks the pitch shape, not the syllable, and your microphone audio stays on your device."
          secondary={{ href: TOOL, label: "Type tone marks: ni3 → nǐ" }}
        />
      </article>
    </div>
  );
}

export function chineseTonesJsonLd(route: SiteRoute): object[] {
  const url = absoluteUrl(route.path);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: route.title,
      description: route.description,
      url,
      mainEntityOfPage: url,
      inLanguage: "en",
      datePublished: "2026-10-19",
      dateModified: route.lastmod,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "FlappyTone", url: absoluteUrl("/") },
      about: { "@type": "Thing", name: "Mandarin Chinese tones" },
      publisher: {
        "@type": "Organization",
        name: "FlappyTone",
        url: absoluteUrl("/"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}
