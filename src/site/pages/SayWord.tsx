/**
 * The /say/<slug> word-page template and the /say index. One component per
 * page is made from `SAY_WORDS` (`sayPageDefs`), so `pages.tsx` lists them all
 * without hand-written entries. Listen / See it load their code on the tap.
 */

import { useRef, type ReactElement } from "react";
import { PipCta } from "../Pip.tsx";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { appHref } from "../../ui/appLink.ts";
import { captureGameEvent } from "../../analytics/posthog.ts";
import type {
  AnalyticsEvent,
  SaySlug,
  WordPageAction,
} from "../../analytics/session.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { SAY_CLIPS } from "../sayClips.ts";
import { SAY_WORDS, sayWordFor, type SayWord } from "../sayWords.ts";
import { PlayButton, SeeButton } from "../WordButtons.tsx";
import { markSyllable, parsePinyin, toZhuyin } from "../zhuyin.ts";

const HUB = "/chinese-tones";
const INDEX = "/say";
const VISUALIZER = "/tools/tone-visualizer";

export const sayPath = (slug: string) => `${INDEX}/${slug}`;

/**
 * The `word_page_action` reporter: each action at most once per page load,
 * the page's own slug only. Pure so it is tested without a DOM.
 */
export function makeWordPageReporter(
  slug: SaySlug,
  send: (e: Extract<AnalyticsEvent, { type: "word_page_action" }>) => void,
): (action: WordPageAction) => void {
  const sent = new Set<WordPageAction>();
  return (action) => {
    if (sent.has(action)) return;
    sent.add(action);
    try {
      send({ type: "word_page_action", slug, action });
    } catch {
      // Analytics never breaks the page.
    }
  };
}

/** Pinyin with each syllable in its tone colour. */
function TonePinyin({ text }: { text: string }) {
  return (
    <>
      {parsePinyin(text).map((p, i) =>
        "syllable" in p ? (
          <span key={i} style={{ color: TONE_LINE_COLOR[p.syllable.tone] }}>
            {markSyllable(p.syllable)}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function SayWordPage({ word }: { word: SayWord }) {
  const path = sayPath(word.slug);
  const report = useRef<((a: WordPageAction) => void) | null>(null);
  const track = (a: WordPageAction) => {
    report.current ??= makeWordPageReporter(
      word.slug as SaySlug,
      captureGameEvent,
    );
    report.current(a);
  };
  const siblings = word.siblings
    .map(sayWordFor)
    .filter((w): w is SayWord => !!w);

  return (
    <div className="screen legal-screen site-page say-page">
      <article className="legal-body">
        <h1>{word.h1}</h1>
        <p className="site-answer">
          <strong>{word.answer}</strong>
        </p>

        <div className="say-card">
          <div className="say-card-head">
            <span className="say-hanzi" lang="zh-Hant-TW">
              {word.hanzi}
            </span>
            <span className="say-pinyin">
              <TonePinyin text={word.pinyin} />
            </span>
            <span className="say-zhuyin" lang="zh-Hant-TW">
              {toZhuyin(word.pinyin)}
            </span>
            <span className="say-english">{word.english}</span>
            {word.said && (
              <span className="say-said">
                said <strong>{word.said}</strong>
              </span>
            )}
          </div>
          <ul className="say-recordings">
            {word.cards.map((c) => (
              <li key={c.id}>
                {word.cards.length > 1 && (
                  <span className="say-rec-label">
                    <span lang="zh-Hant-TW">{c.hanzi}</span>{" "}
                    <TonePinyin text={c.pinyin} />
                  </span>
                )}
                <span className="site-example-actions">
                  <PlayButton
                    id={c.id}
                    label={`${c.hanzi} ${c.pinyin}`}
                    onPlay={() => track("listen")}
                  />
                  <SeeButton
                    word={c}
                    clip={SAY_CLIPS[c.id]}
                    from={path}
                    onOpen={() => track("see_it")}
                  />
                </span>
              </li>
            ))}
          </ul>
          {word.cardNote && <p className="say-card-note">{word.cardNote}</p>}
        </div>

        <section>
          <h2>How the tones really sound</h2>
          {word.real.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>

        <section>
          <h2>{word.syllables.length > 1 ? "Syllable by syllable" : "The syllable"}</h2>
          <ul className="say-syllables">
            {word.syllables.map((s, i) => (
              <li key={i}>
                <span className="say-syl" lang="zh-Hant-TW">
                  {s.hanzi}
                </span>
                <span className="say-syl-pinyin">{s.pinyin}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Common phrases and replies</h2>
          <ul className="say-uses">
            {word.uses.map((u) => (
              <li key={u.hanzi}>
                <span className="say-use-hanzi" lang="zh-Hant-TW">
                  {u.hanzi}
                </span>
                <span className="say-use-pinyin">
                  <TonePinyin text={u.pinyin} />
                </span>
                <span className="say-use-english">{u.english}</span>
                <span className="say-use-note">{u.note}</span>
              </li>
            ))}
          </ul>
        </section>

        {word.taiwan && (
          <section>
            <h2>Taiwan and mainland</h2>
            <p>{word.taiwan}</p>
          </section>
        )}

        <section className="say-practise">
          <h2>Practise it out loud</h2>
          <p>
            Hearing a word is half of it. Say it and watch your own pitch
            line drawn over the real shape.
          </p>
          <div className="say-practise-actions">
            <a
              className="sticker-button"
              href={`${VISUALIZER}?tone=${word.toneTarget}`}
              onClick={() => track("practise_tone")}
            >
              Practise {word.toneTargetLabel}, free
            </a>
            <a
              className="site-play say-practise-word"
              href={appHref("visualiser", path)}
              onClick={() => track("practise_word")}
            >
              Practise this exact word
            </a>
          </div>
          <p className="say-practise-note">
            The free tone visualizer needs no account. Practising real words
            with recordings is in the FlappyTone app, free with an account.
          </p>
        </section>

        <section id="faq">
          <h2>Questions</h2>
          {word.faq.map((f) => (
            <details key={f.q} className="site-faq" open>
              <summary>
                <h3>{f.q}</h3>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section>
          <h2>More words</h2>
          <ul className="say-more">
            {siblings.map((s) => (
              <li key={s.slug}>
                <a href={sayPath(s.slug)}>
                  How to say {s.phrase.toLowerCase()}:{" "}
                  <span lang="zh-Hant-TW">{s.hanzi}</span>
                </a>
              </li>
            ))}
            <li>
              <a href={INDEX}>All common words</a>
            </li>
            <li>
              <a href={HUB}>The four Mandarin tones, explained</a>
            </li>
          </ul>
        </section>

        <PipCta
          path={path}
          title="Fly the word with your voice"
          body="In FlappyTone your voice flies a bird through a tunnel shaped like the tone, so you see right away if your pitch made the right shape. It checks the pitch shape, not the syllable, and your microphone audio stays on your device."
          secondary={{ href: HUB, label: "Chinese tones, explained" }}
        />
      </article>
    </div>
  );
}

export function sayWordJsonLd(word: SayWord, route: SiteRoute): object[] {
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
      about: {
        "@type": "Thing",
        name: `${word.hanzi} (${word.pinyin}), ${word.phrase} in Mandarin Chinese`,
      },
      publisher: {
        "@type": "Organization",
        name: "FlappyTone",
        url: absoluteUrl("/"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: word.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}

export function SayIndex() {
  return (
    <div className="screen legal-screen site-page say-page">
      <article className="legal-body">
        <h1>How to say common words in Chinese</h1>
        <p className="site-answer">
          <strong>
            The words you need first, each with a native speaker's recording,
            pinyin, 注音 (Zhuyin) and an honest note on how the tones sound at
            everyday speed, which is often not how the textbook writes them.
          </strong>
        </p>
        <p>
          Every page uses Traditional characters and Taiwan Mandarin. Tap a
          word for its recording, the shape of its tones, common replies and a
          way to practise it out loud.
        </p>
        <ul className="say-index">
          {SAY_WORDS.map((w) => (
            <li key={w.slug}>
              <a href={sayPath(w.slug)}>
                <span className="say-index-phrase">{w.phrase}</span>
                <span className="say-index-hanzi" lang="zh-Hant-TW">
                  {w.hanzi}
                </span>
                <span className="say-index-pinyin">
                  <TonePinyin text={w.pinyin} />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p>
          New to tones? Start with{" "}
          <a href={HUB}>the four Mandarin tones, explained</a>, or try your own
          voice in the <a href={VISUALIZER}>free tone visualizer</a>.
        </p>
        <PipCta
          path={INDEX}
          title="Practise the words out loud"
          body="In FlappyTone your voice flies a bird through a tunnel shaped like the tone, so you see right away if your pitch made the right shape. It checks the pitch shape, not the syllable, and your microphone audio stays on your device."
          secondary={{ href: HUB, label: "Chinese tones, explained" }}
        />
      </article>
    </div>
  );
}

export function sayIndexJsonLd(route: SiteRoute): object[] {
  const url = absoluteUrl(route.path);
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: route.title,
      description: route.description,
      url,
      inLanguage: "en",
      hasPart: SAY_WORDS.map((w) => ({
        "@type": "Article",
        headline: `How to say ${w.phrase.toLowerCase()} in Chinese`,
        url: absoluteUrl(sayPath(w.slug)),
      })),
    },
  ];
}

/** `SITE_PAGES` entries for every word page. */
export function sayPageDefs(): Record<
  string,
  { Page: () => ReactElement; jsonLd: (r: SiteRoute) => object[] }
> {
  return Object.fromEntries(
    SAY_WORDS.map((w) => [
      sayPath(w.slug),
      {
        Page: () => <SayWordPage word={w} />,
        jsonLd: (r: SiteRoute) => sayWordJsonLd(w, r),
      },
    ]),
  );
}
