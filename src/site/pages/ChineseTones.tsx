import { PipCta } from "../Pip.tsx";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { ToneChart } from "../ToneChart.tsx";
import { toZhuyin } from "../zhuyin.ts";

const PATH = "/chinese-tones";
const TOOL = "/tools/tone-marks";

/** An example word: Traditional hanzi, marked pinyin, English. 注音 is derived. */
type Example = [hanzi: string, pinyin: string, english: string];

interface ToneSection {
  id: string;
  tone: 0 | 1 | 2 | 3 | 4;
  title: string;
  shape: string;
  mistake: string;
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
    examples: [
      ["媽", "mā", "mother"],
      ["書", "shū", "book"],
      ["山", "shān", "mountain"],
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
    examples: [
      ["茶", "chá", "tea"],
      ["錢", "qián", "money"],
      ["學", "xué", "to study"],
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
    examples: [
      ["馬", "mǎ", "horse"],
      ["好", "hǎo", "good"],
      ["水", "shuǐ", "water"],
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
    examples: [
      ["罵", "mà", "to scold"],
      ["大", "dà", "big"],
      ["看", "kàn", "to look"],
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
      ["什麼", "shén me", "what"],
      ["你們", "nǐ men", "you (plural)"],
      ["包子", "bāo zi", "steamed bun"],
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

function ExampleList({ tone, examples }: { tone: number; examples: Example[] }) {
  return (
    <ul className="site-examples">
      {examples.map(([hanzi, pinyin, english]) => (
        <li key={hanzi}>
          <span className="hanzi" lang="zh-Hant-TW">
            {hanzi}
          </span>
          <span className="pinyin" style={{ color: TONE_LINE_COLOR[tone as 0 | 1 | 2 | 3 | 4] }}>
            {pinyin}
          </span>
          <span className="zhuyin" lang="zh-Hant-TW">
            {toZhuyin(pinyin)}
          </span>
          <span className="english">{english}</span>
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
            Mandarin Chinese has four tones plus a light neutral tone. Each tone is a pitch shape
            (high and level, rising, dipping, or falling), and changing the shape changes the word:
            mā (媽, mother), má (麻, hemp), mǎ (馬, horse) and mà (罵, to scold) are four different
            words.
          </strong>
        </p>
        <p>
          This page shows what each tone looks like, the mistake learners make most often with it,
          and how tones change when two of them meet. The examples use Traditional characters, with
          pinyin and 注音 (Zhuyin), as they are taught in Taiwan.
        </p>

        <h2>The four tones on one chart</h2>
        <p>
          Linguists describe tone height on a scale from 1 (the bottom of your voice) to 5 (the
          top). This chart is not drawn by hand: each line is the average pitch of many real words
          recorded by a native Taiwan Mandarin speaker, sampled across the length of the syllable.
        </p>
        <ToneChart />
        <p>
          Two things stand out. First, the tones are relative to your own voice, so a deep voice and
          a high voice draw the same shapes at different pitches. Second, tones 2 and 3 both dip and
          rise in a careful citation form; what separates them is how low the dip goes and how early
          the rise starts.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id}>
            <h2 style={{ color: TONE_LINE_COLOR[s.tone] }}>{s.title}</h2>
            <p>{s.shape}</p>
            <p>
              <strong>Common mistake:</strong> {s.mistake}
            </p>
            <ExampleList tone={s.tone} examples={s.examples} />
          </section>
        ))}

        <section id="tone-sandhi">
          <h2>Tone pairs and tone sandhi</h2>
          <p>
            In real speech, tones change when they meet. This is called tone sandhi. Dictionaries
            and pinyin keep the original tone, so you have to know the rules to say a word the way
            native speakers do. Three rules cover almost every case a beginner meets:
          </p>
          <ul className="site-rules">
            <li>
              <strong>Tone 3 + tone 3 → tone 2 + tone 3.</strong> 你好 is written nǐ hǎo but said
              ní hǎo. Before any other tone, a third tone stays low and does not rise: 美國 měi guó,
              小時 xiǎo shí.
            </li>
            <li>
              <strong>一 (yī, one).</strong> Alone it is tone 1. Before a tone 4 it becomes tone 2:
              一定 is said yí dìng, 一樣 yí yàng. Before tones 1, 2 and 3 it becomes tone 4: 一起
              yì qǐ, 一些 yì xiē.
            </li>
            <li>
              <strong>不 (bù, not).</strong> Normally tone 4. Before another tone 4 it becomes tone
              2: 不錯 is said bú cuò, 不要 bú yào.
            </li>
          </ul>
          <p>
            Two-syllable words are where these rules matter most, and where learners who are fine
            with single syllables start to slip. Practise them as whole words, not as two separate
            tones.
          </p>
        </section>

        <section id="taiwan-vs-mainland">
          <h2>Taiwan vs mainland Mandarin tones</h2>
          <p>
            The four tones are the same system in Taiwan and in mainland China, but there are small
            differences. Taiwan Mandarin uses the neutral tone less, so some words keep a full tone
            in Taiwan where the mainland makes them light. A few words have a different standard
            tone, and the third tone is more often said low without a rise. Taiwan writes Traditional
            characters and teaches pronunciation with 注音 (Bopomofo) rather than only pinyin. The
            recordings and examples on FlappyTone are Taiwan Mandarin.
          </p>
        </section>

        <section id="faq">
          <h2>Can't hear the tones? Common questions</h2>
          {FAQ.map((f) => (
            <div key={f.q} className="site-faq">
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </section>

        <PipCta
          path={PATH}
          title="Practise the tones out loud"
          body="Reading about tones helps, but you learn them by saying them. In FlappyTone your voice flies Pip through a tunnel shaped like the tone, so you see right away if your pitch made the right shape. It checks the pitch shape, not the syllable, and your microphone audio stays on your device."
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
      dateModified: route.lastmod,
      about: { "@type": "Thing", name: "Mandarin Chinese tones" },
      publisher: { "@type": "Organization", name: "FlappyTone", url: absoluteUrl("/") },
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
