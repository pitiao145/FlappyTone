import { useRef, useState, type ReactNode } from "react";
import { ContourSpark } from "../../ui/ContourSpark.tsx";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { captureGameEvent } from "../../analytics/posthog.ts";
import type { AnalyticsEvent } from "../../analytics/session.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { Pip, PipCta } from "../Pip.tsx";
import {
  inputDirection,
  markSyllable,
  numberSyllable,
  parsePinyin,
  type PinyinSyllable,
  syllablesOf,
  toMarks,
  toNumbers,
  toZhuyin,
  zhuyinSyllable,
} from "../zhuyin.ts";

const PATH = "/tools/tone-marks";

/**
 * The `tool_used` reporter: sends once per page load, on the first non-empty
 * input, with the direction only — never the typed text. Pure so it is tested
 * without a DOM.
 */
export function makeToolUsedReporter(
  send: (e: Extract<AnalyticsEvent, { type: "tool_used"; tool: "tone-marks" }>) => void,
): (input: string) => void {
  let sent = false;
  return (input) => {
    if (sent || !input.trim()) return;
    sent = true;
    try {
      send({
        type: "tool_used",
        tool: "tone-marks",
        direction: inputDirection(input),
      });
    } catch {
      // Analytics never breaks the page.
    }
  };
}
const DEFAULT_INPUT = "wo3 xi3huan1 xue2 zhong1wen2";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="tm-copy"
      disabled={!text}
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Result({
  label,
  value,
  display,
  lang,
  big,
}: {
  label: string;
  /** The text copied. */
  value: string;
  /** What is shown, when it is more than the plain text (coloured syllables). */
  display?: ReactNode;
  lang?: string;
  big?: boolean;
}) {
  return (
    <div className={big ? "tm-result tm-result-big" : "tm-result"}>
      <div className="tm-result-label">{label}</div>
      <output className="tm-result-value" lang={lang}>
        {display ?? (value || "\u00a0")}
      </output>
      <CopyButton text={value} label={label.toLowerCase()} />
    </div>
  );
}

/** Each syllable in its tone's colour; text between syllables stays plain. */
function colored(input: string, f: (s: PinyinSyllable) => string): ReactNode {
  return parsePinyin(input).map((p, i) =>
    "syllable" in p ? (
      <span key={i} style={{ color: TONE_LINE_COLOR[p.syllable.tone] }}>
        {f(p.syllable)}
      </span>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

const EXAMPLES = ["ni3 hao3", "xie4xie5", "lv4 cha2", "Zhong1guo2", "nǐ hǎo"];

/** The converter: numbered or marked pinyin in, marks, numbers and 注音 out. */
function Converter() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const report = useRef<(input: string) => void>(null);
  report.current ??= makeToolUsedReporter(captureGameEvent);
  const syllables = syllablesOf(input);
  const toNumbersMode = inputDirection(input) === "to-numbers";
  const change = (next: string) => {
    setInput(next);
    report.current?.(next);
  };

  // The right side shows only what the input is not: marks for numbered
  // input, numbers for marked input. Echoing the input back says nothing.
  const converted = toNumbersMode ? (
    <Result
      label="Pinyin with tone numbers"
      value={toNumbers(input)}
      display={colored(input, numberSyllable)}
      big
    />
  ) : (
    <Result
      label="Pinyin with tone marks"
      value={toMarks(input)}
      display={colored(input, markSyllable)}
      big
    />
  );
  return (
    <div
      className="tm-tool"
      role="group"
      aria-label="Pinyin tone marks converter"
    >
      <Pip size={72} tilt={-10} className="tm-tool-pip" />
      <div className="tm-input">
        <label className="tm-input-label" htmlFor="tone-marks-input">
          Type pinyin with tone numbers, or paste pinyin with marks
        </label>
        <textarea
          id="tone-marks-input"
          rows={4}
          value={input}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => change(e.target.value)}
        />
        <div className="tm-examples">
          <span>Try</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => change(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <p className="tm-direction" aria-live="polite">
          {toNumbersMode
            ? "Reading tone marks, writing numbers."
            : "Reading tone numbers, writing marks."}
        </p>
      </div>
      <div className="tm-output">
        {converted}
        <Result
          label="Zhuyin (注音)"
          value={toZhuyin(input)}
          lang="zh-Hant-TW"
        />
        {syllables.length > 0 && (
          <>
            <div className="tm-result-label tm-shapes-label">
              Tone shape of each syllable
            </div>
            <ul className="tm-shapes">
              {syllables.slice(0, 40).map((s, i) => (
                <li key={i} style={{ color: TONE_LINE_COLOR[s.tone] }}>
                  {s.tone === 0 ? (
                    <span className="tm-neutral" aria-hidden="true">
                      ·
                    </span>
                  ) : (
                    <ContourSpark tone={s.tone} width={44} height={22} />
                  )}
                  <span className="tm-shape-pinyin">{markSyllable(s)}</span>
                  <span className="tm-shape-zhuyin" lang="zh-Hant-TW">
                    {zhuyinSyllable(s)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** The page's FAQ: rendered below the tool and sent as FAQPage JSON-LD. */
export const TONE_MARKS_FAQ: { q: string; a: string }[] = [
  {
    q: "What is the difference between pinyin with numbers and with tone marks?",
    a: "They say the same thing. Numbers (ni3 hao3) are easy to type on any keyboard; tone marks (nǐ hǎo) are what textbooks, dictionaries and signs use. Learners often type numbers and convert them.",
  },
  {
    q: "Why is the third tone mark ˇ and not a dip and a rise?",
    a: "The mark is a simple picture of the textbook third tone, which dips and comes back up. In real speech a third tone often only dips, especially before another syllable, and two third tones in a row change: nǐ hǎo is said ní hǎo.",
  },
  {
    q: "Do I write tone marks on the neutral tone?",
    a: "No. A neutral-tone syllable has no mark in pinyin (xièxie, māma). In 注音 it gets a dot before the syllable (˙ㄒㄧㄝ).",
  },
  {
    q: "Does this converter work with Zhuyin (注音)?",
    a: "It shows the 注音 for whatever pinyin you type, with the tone marks ˊ ˇ ˋ and the neutral dot. It does not convert 注音 back to pinyin.",
  },
];

export function ToneMarks() {
  return (
    <div className="screen legal-screen site-page site-wide">
      <article className="legal-body">
        <header className="tm-head">
          <h1>Pinyin tone marks converter</h1>
          <p className="site-answer">
            Type ni3 hao3, get nǐ hǎo and ㄋㄧˇ ㄏㄠˇ. Paste marked pinyin to
            turn it back into numbers. Nothing you type leaves your browser.
          </p>
        </header>

        <Converter />

        <div className="tm-notes">
          <section>
            <h2>How to type it</h2>
            <ul className="site-rules">
              <li>
                Put the tone number right after each syllable:{" "}
                <code>zhong1 guo2</code> or <code>zhong1guo2</code>.
              </li>
              <li>
                Use <code>5</code> or <code>0</code> for the neutral tone (
                <code>ma5</code>), or no number at all.
              </li>
              <li>
                Type ü as <code>v</code>, the input-method habit:{" "}
                <code>lv4</code>, <code>nü3</code> and <code>nu:3</code> all
                work. After j, q, x and y a plain <code>u</code> is already ü (
                <code>xue2</code> → xué).
              </li>
              <li>
                An apostrophe separates syllables that could run together:{" "}
                <code>xi1'an1</code> → xī'ān.
              </li>
            </ul>
          </section>
          <section>
            <h2>Where the tone mark goes</h2>
            <p>
              Every syllable has one mark, on one vowel. If there is an a or an
              e, the mark goes there (hǎo, xiè). In ou, it goes on the o (dōu).
              Otherwise it goes on the last vowel, which is why it is liú but
              guì. ü keeps its dots and takes the mark on top (lǜ). The neutral
              tone has no mark in pinyin; in 注音 it is a dot written before the
              syllable (˙ㄇㄜ).
            </p>
            <p>
              The four marks are small pictures of the pitch: ˉ high and level,
              ˊ rising, ˇ dipping, ˋ falling. See them drawn from real
              recordings in the{" "}
              <a href="/chinese-tones">guide to the four Chinese tones</a>.
            </p>
          </section>
          <section>
            <h2>How to type tone marks on your own keyboard</h2>
            <ul className="site-rules">
              <li>
                <strong>Mac:</strong> add the ABC – Extended keyboard in System
                Settings → Keyboard → Input Sources. Then Option + a gives ˉ
                (ā), Option + e gives ˊ (á), Option + v gives ˇ (ǎ) and Option +
                ` gives ˋ (à): press the shortcut, then the vowel.
              </li>
              <li>
                <strong>Windows:</strong> there is no simple built-in shortcut.
                Type with numbers here and copy the result.
              </li>
              <li>
                <strong>Phone:</strong> long-press a vowel on the keyboard. Most
                keyboards offer ā, á and à, but not always ǎ, so copy that one
                from here. For 注音, add the Zhuyin keyboard (Chinese,
                Traditional).
              </li>
            </ul>
          </section>
          <section>
            <h2>Pinyin or 注音?</h2>
            <p>
              Pinyin uses the Latin alphabet and is the standard in mainland
              China and in most textbooks abroad. 注音 (Zhuyin, also called
              Bopomofo) uses its own symbols and is what children learn in
              Taiwan. They describe the same sounds and the same four tones, so
              this page shows both. If you plan to live or study in Taiwan,
              learning to read 注音 is worth a few hours: it is on many signs,
              in children's books and on phone keyboards.
            </p>
          </section>
          <section>
            <h2>Questions</h2>
            {TONE_MARKS_FAQ.map((f) => (
              <details key={f.q} className="site-faq" open>
                <summary>
                  <h3>{f.q}</h3>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>
        </div>

        <PipCta
          path={PATH}
          title="Now say them out loud"
          body="Typing the mark is the easy part. In FlappyTone your voice flies the bird through a tunnel shaped like the tone, so you see right away if your pitch made the shape."
          secondary={{ href: "/chinese-tones", label: "Read the tone guide" }}
        />
      </article>
    </div>
  );
}

export function toneMarksJsonLd(route: SiteRoute): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Pinyin Tone Marks Converter",
      url: absoluteUrl(route.path),
      description: route.description,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: {
        "@type": "Organization",
        name: "FlappyTone",
        url: absoluteUrl("/"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: TONE_MARKS_FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}
