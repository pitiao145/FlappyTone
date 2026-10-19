import { useRef, useState } from "react";
import { appHref } from "../../ui/appLink.ts";
import { ContourSpark } from "../../ui/ContourSpark.tsx";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { captureGameEvent } from "../../analytics/posthog.ts";
import type { AnalyticsEvent } from "../../analytics/session.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import {
  inputDirection,
  markSyllable,
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
  send: (e: Extract<AnalyticsEvent, { type: "tool_used" }>) => void,
): (input: string) => void {
  let sent = false;
  return (input) => {
    if (sent || !input.trim()) return;
    sent = true;
    try {
      send({ type: "tool_used", tool: "tone-marks", direction: inputDirection(input) });
    } catch {
      // Analytics never breaks the page.
    }
  };
}
const DEFAULT_INPUT = "ni3 hao3, lv4 cha2";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="secondary site-copy"
      disabled={!text}
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

function Output({ label, value, lang }: { label: string; value: string; lang?: string }) {
  return (
    <div className="site-tool-output">
      <div className="label">{label}</div>
      <output className="value" lang={lang}>
        {value || " "}
      </output>
      <CopyButton text={value} />
    </div>
  );
}

/** The converter: numbered or marked pinyin in, marks, numbers and 注音 out. */
function Converter() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const report = useRef<(input: string) => void>(null);
  report.current ??= makeToolUsedReporter(captureGameEvent);
  const syllables = syllablesOf(input);

  return (
    <div className="site-tool">
      <label className="label" htmlFor="tone-marks-input">
        Pinyin with numbers (ni3 hao3) or with marks (nǐ hǎo)
      </label>
      <textarea
        id="tone-marks-input"
        rows={3}
        value={input}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => {
          const next = e.target.value;
          setInput(next);
          report.current?.(next);
        }}
      />
      <Output label="Tone marks" value={toMarks(input)} />
      <Output label="Numbers" value={toNumbers(input)} />
      <Output label="注音 (Zhuyin)" value={toZhuyin(input)} lang="zh-Hant-TW" />
      {syllables.length > 0 && (
        <ul className="site-tool-shapes" aria-label="Tone shape of each syllable">
          {syllables.slice(0, 40).map((s, i) => (
            <li key={i} style={{ color: TONE_LINE_COLOR[s.tone] }}>
              {s.tone === 0 ? (
                <span className="neutral-dot" aria-hidden="true">
                  ·
                </span>
              ) : (
                <ContourSpark tone={s.tone} />
              )}
              <span className="pinyin">{markSyllable(s)}</span>
              <span className="zhuyin" lang="zh-Hant-TW">
                {zhuyinSyllable(s)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ToneMarks() {
  return (
    <div className="screen legal-screen site-page">
      <article className="legal-body">
        <h1>Pinyin tone marks converter</h1>
        <p className="site-answer">
          Type pinyin with tone numbers (ni3 hao3) and get the tone marks (nǐ hǎo), the 注音
          (ㄋㄧˇ ㄏㄠˇ) and the shape of each tone. Paste marked pinyin to convert it back to
          numbers. Free, and nothing you type leaves your browser.
        </p>

        <Converter />

        <h2>How to type it</h2>
        <ul className="site-rules">
          <li>
            Put the tone number right after each syllable: <code>zhong1 guo2</code> or{" "}
            <code>zhong1guo2</code>.
          </li>
          <li>
            Use <code>5</code> or <code>0</code> for the neutral tone (<code>ma5</code>), or no
            number at all.
          </li>
          <li>
            Type ü as <code>v</code> or <code>ü</code>: <code>lv4</code> and <code>nü3</code> both
            work. After j, q, x and y a plain <code>u</code> is already ü (<code>xue2</code> →
            xué).
          </li>
          <li>
            An apostrophe separates syllables that could run together: <code>xi1'an1</code> →
            xī'ān.
          </li>
        </ul>

        <h2>Where the tone mark goes</h2>
        <p>
          Every syllable has one mark, on one vowel. The rule is short: if there is an a or an e,
          the mark goes there (hǎo, xiè). In ou, it goes on the o (dōu). Otherwise it goes on the
          last vowel, which is why it is liú but guì. ü keeps its dots and takes the mark on top
          (lǜ). The neutral tone has no mark in pinyin; in 注音 it is a dot written before the
          syllable (˙ㄇㄜ).
        </p>
        <p>
          The four marks are small pictures of the pitch: ˉ high and level, ˊ rising, ˇ dipping, ˋ
          falling. See them drawn from real recordings in the{" "}
          <a href="/chinese-tones">guide to the four Chinese tones</a>.
        </p>

        <h2>Say them, not only type them</h2>
        <p>
          Knowing where the mark goes is the easy part. FlappyTone lets you practise the tones out
          loud: your voice steers a bird through a corridor shaped like the tone, so you can see
          whether your pitch makes the right shape.
        </p>
        <p className="site-ctas">
          <a className="primary" href={appHref(undefined, PATH)}>
            Practise the tones with your voice
          </a>
        </p>
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
      publisher: { "@type": "Organization", name: "FlappyTone", url: absoluteUrl("/") },
    },
  ];
}
