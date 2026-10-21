/**
 * The /say/<slug> word-page template and the /say index. One component per
 * page is made from `SAY_WORDS` (`sayPageDefs`), so `pages.tsx` lists them all
 * without hand-written entries. Listen / See it load their code on the tap.
 */

import { useRef, type ReactElement } from "react";
import { PipCta } from "../Pip.tsx";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { captureGameEvent } from "../../analytics/posthog.ts";
import type {
  AnalyticsEvent,
  SaySlug,
  WordPageAction,
} from "../../analytics/session.ts";
import { absoluteUrl, routeFor, type SiteRoute } from "../routes.ts";
import { OG_IMAGE } from "../siteFiles.ts";
import { SAY_CLIPS, SAY_CLIPS_SPOKEN } from "../sayClips.ts";
import type { ExampleClip } from "../exampleClips.ts";
import { corridorChaoAt } from "../../game/gates.ts";
import { ToneMarkIcon } from "../../ui/toneIcons.tsx";
import { SAY_WORDS, sayWordFor, type SayWord } from "../sayWords.ts";
import { toneName } from "../toneNames.ts";
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

/** Each syllable's tone mark, in its tone colour, with the tone's name. */
function ToneMarks({ text }: { text: string }) {
  const syllables = parsePinyin(text).flatMap((p) =>
    "syllable" in p ? [p.syllable] : [],
  );
  return (
    <span className="say-tonemarks">
      {syllables.map((syl, i) => (
        <span
          key={i}
          className="say-tonemark"
          style={{ color: TONE_LINE_COLOR[syl.tone] }}
        >
          <ToneMarkIcon tone={syl.tone} className="say-tonemark-icon" />
          <span className="visually-hidden">
            {syl.tone === 0 ? "neutral" : toneName(syl.tone)}
          </span>
        </span>
      ))}
    </span>
  );
}

const CW = 300;
const CH = 120;
const CPAD = 10;

/** One recording's pitch line, its width in proportion to its length. */
function MiniContour({
  clip,
  scale,
  color,
}: {
  clip: ExampleClip;
  /** Seconds the full width stands for (the longer of the two takes). */
  scale: number;
  color: string;
}) {
  const w = (CW - 2 * CPAD) * (clip.durationS / scale);
  const pts = Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    const chao = corridorChaoAt(clip, t);
    return `${(CPAD + t * w).toFixed(1)},${(CPAD + ((5 - chao) / 4) * (CH - 2 * CPAD)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="say-mini" viewBox={`0 0 ${CW} ${CH}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((c) => (
        <line
          key={c}
          x1={CPAD}
          x2={CW - CPAD}
          y1={CPAD + ((5 - c) / 4) * (CH - 2 * CPAD)}
          y2={CPAD + ((5 - c) / 4) * (CH - 2 * CPAD)}
        />
      ))}
      <polyline points={pts} style={{ stroke: color }} />
    </svg>
  );
}

/** The standard and spoken recordings of one word, side by side. */
function StyleCompare({
  card,
  labelled,
}: {
  card: import("../sayWords.ts").SayCard;
  labelled: boolean;
}) {
  const standard = SAY_CLIPS[card.id];
  const spoken = SAY_CLIPS_SPOKEN[card.id];
  const scale = Math.max(standard.durationS, spoken?.durationS ?? 0);
  const color = TONE_LINE_COLOR[card.tone];
  const take = (
    label: string,
    note: string,
    clip: ExampleClip | undefined,
    style: "textbook" | "natural",
  ) => (
    <div className="say-take">
      <div className="say-take-head">
        <strong>{label}</strong>
        <span>{note}</span>
      </div>
      {clip ? (
        <>
          <MiniContour clip={clip} scale={scale} color={color} />
          <div className="say-take-foot">
            <PlayButton
              id={card.id}
              style={style}
              label={`${card.hanzi}, ${label.toLowerCase()}`}
              text={`Play ${label.toLowerCase()}`}
            />
            <span className="say-take-len">{clip.durationS.toFixed(2)} s</span>
          </div>
        </>
      ) : (
        <p className="say-take-missing">Recording coming soon.</p>
      )}
    </div>
  );
  return (
    <div className="say-compare">
      {labelled && (
        <p className="say-compare-label">
          <span lang="zh-Hant-TW">{card.hanzi}</span>{" "}
          <TonePinyin text={card.pinyin} />
        </p>
      )}
      <div className="say-compare-row">
        {take("Standard", "slow and clear", standard, "textbook")}
        {take("Spoken", "normal speed", spoken, "natural")}
      </div>
    </div>
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
        <a className="say-back" href={INDEX}>
          <span aria-hidden="true">←</span> All words
        </a>
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
            <ToneMarks text={word.pinyin} />
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
          <h2>Standard and spoken</h2>
          <p>
            Our native speaker recorded {word.hanzi} twice: standard, slow and
            clear like a textbook, and spoken, at normal speed. Both lines are
            drawn on the same time scale.
          </p>
          {word.cards.map((c) => (
            <StyleCompare key={c.id} card={c} labelled={word.cards.length > 1} />
          ))}
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
          <h2>Common mistakes</h2>
          <ul className="say-mistakes">
            {word.mistakes.map((m) => (
              <li key={m.wrong}>
                <span className="say-mistake-wrong">{m.wrong}</span>
                <span className="say-mistake-fix">{m.fix}</span>
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
          <p>Say it and see your pitch drawn over the recording.</p>
          <div className="say-practise-actions">
            <a
              className="sticker-button"
              href={`${VISUALIZER}?tone=${word.toneTarget}`}
              onClick={() => track("practise_tone")}
            >
              Practise {word.toneTargetLabel}, free
            </a>
          </div>
          <p className="say-practise-note">
            The tone visualizer is free and needs no account.
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
      datePublished: "2026-10-19",
      dateModified: route.lastmod,
      image: OG_IMAGE,
      author: { "@type": "Organization", name: "FlappyTone", url: absoluteUrl("/") },
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
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Common words", item: absoluteUrl(INDEX) },
        { "@type": "ListItem", position: 2, name: word.phrase, item: url },
      ],
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
            The first words most learners need, each with a native speaker's
            recording, pinyin and 注音 (Zhuyin). Each page also compares the
            slow standard pronunciation with how the word sounds at normal
            speed.
          </strong>
        </p>
        <p>
          All pages use Traditional characters and Taiwan Mandarin.
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
                <span className="say-index-teaser">{w.teaser}</span>
              </a>
            </li>
          ))}
        </ul>
        <section>
          <h2>What each page has</h2>
          <ul className="site-rules">
            <li>
              The word in Traditional characters, pinyin with tone marks, and
              注音.
            </li>
            <li>
              Two recordings by our native speaker: standard (slow and clear)
              and spoken (normal speed), drawn side by side so you can see what
              changes.
            </li>
            <li>
              Tone changes that the spelling hides, like 你好 said ní hǎo or
              不客氣 said bú kèqì.
            </li>
            <li>Common mistakes, everyday replies, and Taiwan usage.</li>
          </ul>
        </section>
        <section>
          <h2>Why the recordings sound different from the pinyin</h2>
          <p>
            Pinyin writes each syllable's own tone. In real speech, tones
            change next to each other: two third tones in a row become a rise and a
            dip, 不 rises before a fourth tone, and many second syllables go light.
            The spoken recordings are also shorter and their pitch moves less.
            Hearing both versions helps you understand people at normal speed,
            not just in a classroom.
          </p>
        </section>
        <p>
          New to tones? Start with{" "}
          <a href={HUB}>the four Mandarin tones, explained</a>, or try your own
          voice in the <a href={VISUALIZER}>free tone visualizer</a>. Can you hear
          the tones? Take the <a href="/tools/tone-test">Chinese tones test</a>.
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
        headline:
          routeFor(sayPath(w.slug))?.title ??
          `How to say ${w.phrase.toLowerCase()} in Chinese`,
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
