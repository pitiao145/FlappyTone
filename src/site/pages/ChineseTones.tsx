import { PipCta } from "../Pip.tsx";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { ToneChart } from "../ToneChart.tsx";
import { useState } from "react";
import { markSyllable, parsePinyin, toZhuyin } from "../zhuyin.ts";

const PATH = "/chinese-tones";
const TOOL = "/tools/tone-marks";

/** An example word: Traditional hanzi, marked pinyin, English. 注音 is derived. */
/** Catalog id (for its clip), hanzi, marked pinyin, English. */
type Example = [id: string, hanzi: string, pinyin: string, english: string];

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
      ["shan1", "山", "shān", "mountain"],
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
    real: "Real tone 2 is not a straight line from 3 to 5. our speaker starts near 2.8, dips a little to about 2.3 in the first third, then climbs to near 5. At everyday speed it often stops around 4.5.",
    examples: [
      ["cha2", "茶", "chá", "tea"],
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
      ["shui3", "水", "shuǐ", "water"],
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
      ["kan4", "看", "kàn", "to look"],
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

function PlayButton({ id, label }: { id: string; label: string }) {
  const [state, setState] = useState<"idle" | "playing" | "failed">("idle");
  return (
    <button
      type="button"
      className="site-play"
      data-state={state}
      aria-label={`Play ${label}`}
      onClick={() => {
        setState("playing");
        // Lazy: no audio code in the page's initial chunk, and never the mic.
        import("../wordAudio.ts")
          .then((m) => m.playWord(id))
          .then((ok) => setState(ok ? "idle" : "failed"))
          .catch(() => setState("failed"));
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {state === "playing" ? (
          <path d="M4 9h3l5-4v14l-5-4H4zM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" />
        ) : (
          <path d="M8 5v14l11-7z" />
        )}
      </svg>
      <span>{state === "failed" ? "No audio" : "Listen"}</span>
    </button>
  );
}

/** Every example's catalog id: each has a published recording (exampleClips.test.ts). */
export const HUB_EXAMPLE_IDS = SECTIONS.flatMap((s) =>
  s.examples.map(([id]) => id),
);

type Viewer = typeof import("../WordViewer.tsx");

function SeeButton({ word }: { word: import("../WordViewer.tsx").ViewerWord }) {
  const [mod, setMod] = useState<Viewer | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="site-play site-see"
        aria-label={`See the pitch of ${word.hanzi} ${word.pinyin}`}
        onClick={() => {
          // Lazy: the viewer (and its audio) loads on this tap only.
          import("../WordViewer.tsx")
            .then((m) => {
              setMod(m);
              setOpen(true);
            })
            .catch(() => {});
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M3 14c3 0 4-6 8-6s4 8 10 8" />
        </svg>
        <span>See it</span>
      </button>
      {open && mod && (
        <mod.WordViewer word={word} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ExampleList({
  examples,
  tone,
}: {
  examples: Example[];
  tone: ToneSection["tone"];
}) {
  return (
    <ul className="site-examples">
      {examples.map(([id, hanzi, pinyin, english]) => (
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
          <h2>Tone pairs and tone sandhi</h2>
          <p>
            In real speech, tones change when they meet. This is called tone
            sandhi. Dictionaries and pinyin keep the original tone, so you have
            to know the rules to say a word the way native speakers do. Three
            rules cover almost every case a beginner meets:
          </p>
          <ul className="site-rules">
            <li>
              <strong>Tone 3 + tone 3 → tone 2 + tone 3.</strong> 你好 is
              written nǐ hǎo but said ní hǎo. Before any other tone, a third
              tone stays low and does not rise: 美國 měi guó, 小時 xiǎo shí.
            </li>
            <li>
              <strong>一 (yī, one).</strong> Alone it is tone 1. Before a tone 4
              it becomes tone 2: 一定 is said yí dìng, 一樣 yí yàng. Before
              tones 1, 2 and 3 it becomes tone 4: 一起 yì qǐ, 一些 yì xiē.
            </li>
            <li>
              <strong>不 (bù, not).</strong> Normally tone 4. Before another
              tone 4 it becomes tone 2: 不錯 is said bú cuò, 不要 bú yào.
            </li>
          </ul>
          <p>
            Two-syllable words are where these rules matter most, and where
            learners who are fine with single syllables start to slip. Practise
            them as whole words, not as two separate tones.
          </p>
        </section>

        <section id="taiwan-vs-mainland">
          <h2>Taiwan vs mainland Mandarin tones</h2>
          <p>
            The four tones are the same system in Taiwan and in mainland China,
            but there are small differences. Taiwan Mandarin uses the neutral
            tone less, so some words keep a full tone in Taiwan where the
            mainland makes them light. A few words have a different standard
            tone, and the third tone is more often said low without a rise.
            Taiwan writes Traditional characters and teaches pronunciation with
            注音 (Bopomofo) rather than only pinyin. The recordings and examples
            on FlappyTone are Taiwan Mandarin.
          </p>
        </section>

        <section id="faq">
          <h2>Can't hear the tones? Common questions</h2>
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
