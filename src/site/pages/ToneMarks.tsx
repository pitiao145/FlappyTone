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
  ];
}
