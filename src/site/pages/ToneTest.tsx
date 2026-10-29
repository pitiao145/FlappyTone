import { useEffect, useRef } from "react";
import { captureGameEvent } from "../../analytics/posthog.ts";
import { absoluteUrl, type SiteRoute } from "../routes.ts";
import { PipCta } from "../Pip.tsx";
import { DemoTrigger, trackSignupCta } from "../DemoCta.tsx";
import { TONE_LINE_COLOR } from "../../ui/toneColors.ts";
import { toneName } from "../toneNames.ts";
import { gameHref, pairKey, weakPair } from "../../toneder/cta.ts";
import { Toneder } from "../../toneder/Toneder.tsx";
import { makeToneTestReporter, type ToneTestReporter } from "../../toneder/toneTest.ts";

const PATH = "/tools/tone-test";

const FAQ = [
  {
    q: "How does the Chinese tones test work?",
    a: "TONEder works like a dating app for tones. You hear one Mandarin word at a time, recorded by our native Taiwan Mandarin speaker. The word is hidden, so only the pitch can tell you the tone. Swipe the card into the corner of the tone you heard (or tap the corner, or press 1 to 4). After ten words you get a score, your result per tone, and which tones you mix up.",
  },
  {
    q: "What is the difference between Standard and Spoken?",
    a: "Standard plays slow, clear recordings, like a textbook. Spoken plays the same words at everyday speed, where tones are shorter and smaller, so it is harder. Real conversations sound like Spoken.",
  },
  {
    q: "Am I tone deaf if I get a low score?",
    a: "Almost certainly not. True tone deafness (congenital amusia) affects a small share of people, and most of them still hear speech melody. A low score usually means your ear has not yet learned to treat pitch as part of a word, because English does not. That improves with targeted practice.",
  },
  {
    q: "Which tones are hardest to hear?",
    a: "Second and third tones are the most common mix-up. A second tone starts in the middle and rises early and steadily; third tone starts low and stays low for longer. First and fourth tones can also blur at speed, because a short fourth tone starts high like a first tone.",
  },
  {
    q: "Is it free? Do I need an account?",
    a: "Yes, it is free, with no sign-up and no microphone. It only plays audio. Turn your sound on.",
  },
];

function useReporter(): ToneTestReporter {
  const ref = useRef<ToneTestReporter | null>(null);
  ref.current ??= makeToneTestReporter(captureGameEvent);
  return ref.current;
}

/** The page's TONEder: its analytics, and the visualizer as the next step. */
function ToneGameOnPage() {
  const reporter = useReporter();
  useEffect(() => {
    const onHide = () => reporter.summary();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [reporter]);
  return (
    <Toneder
      sharePath={PATH}
      reporter={reporter}
      doneCta={(_, answers) => {
        const pair = weakPair(answers);
        return (
          <a
            className="tc-result-cta"
            href={gameHref(PATH, pair)}
            onClick={() => {
              ctaClick(pairKey(pair), "round_done");
              trackSignupCta(PATH, "tone_test_result");
            }}
          >
            {pair ? (
              <>
                Your weak spot:{" "}
                <b style={{ color: TONE_LINE_COLOR[pair[0]] }}>{toneName(pair[0], true)}</b> vs{" "}
                <b style={{ color: TONE_LINE_COLOR[pair[1]] }}>{toneName(pair[1], true)}</b> → train it
                in the game
              </>
            ) : (
              <>Perfect ear. Now say them: train in the game</>
            )}
          </a>
        );
      }}
    />
  );
}

function ctaClick(weak_pair: string, placement: "round_done" | "persistent"): void {
  try {
    captureGameEvent({ type: "tool_cta_click", tool: "tone-test", weak_pair, placement });
  } catch {
    // Analytics never breaks the page.
  }
}

export function ToneTest() {
  return (
    <div className="screen legal-screen site-page site-wide">
      <article className="legal-body">
        <header className="tm-head">
          <h1>Chinese tones test: TONEder</h1>
          <p className="site-answer">
            Can you hear the four Mandarin tones? TONEder is like Tinder, but for
            tones: ten words from a native speaker want to meet you, and you swipe
            each one to the tone it matches (high and level, rising, dipping or
            falling). Free, no sign-up, no microphone. You get a score and the tones
            you mix up.
          </p>
        </header>

        <ToneGameOnPage />
        <p className="tt-play-game">
          Hearing is half of it.{" "}
          <DemoTrigger page={PATH} cta="tone_test_play_link" onOpen={() => ctaClick("none", "persistent")}>
            Play the game: say the tones with your voice
          </DemoTrigger>
        </p>

        <div className="tm-notes">
          <section>
            <h2>How the test works</h2>
            <p>
              Each card plays one word, hidden, so the tone is the only clue. The four
              corners are the four tones, placed like their marks: the two that end
              high on top (first tone level, second tone ˊ rising), the low dip and the fall at
              the bottom (third tone ˇ, fourth tone ˋ). Swipe, tap a corner or press 1 to 4. Then
              you see the word, its pinyin, 注音 and the shape of its tone.
            </p>
            <p>
              Standard plays slow, clear recordings. Spoken plays the same words at
              everyday speed, which is harder and closer to real conversation.
            </p>
          </section>
          <section>
            <h2>Why tones are hard to hear for English speakers</h2>
            <p>
              In English, pitch tells you whether a sentence is a question or how
              someone feels, never which word it is. So your ear learned to skip
              pitch inside a word. In Mandarin the pitch shape is part of the word: mā
              (媽, mother) and mǎ (馬, horse) differ only in tone. Hearing that is a
              new habit, and like any habit it comes with practice, not talent.
            </p>
          </section>
          <section>
            <h2>Are you tone deaf?</h2>
            <p>
              Probably not. True tone deafness (congenital amusia) is rare, and even
              most people with it can follow speech melody. If you score low here, it
              almost always means your ear has not had enough focused practice yet.
              Learn what each shape looks like in the{" "}
              <a href="/chinese-tones">guide to the four tones</a>, take this test a
              few times, then say the tones yourself in the{" "}
              <a href="/tools/tone-visualizer">tone visualizer</a> to see your own
              pitch. Hearing real words also helps: try the{" "}
              <a href="/say">common words with audio</a>.
            </p>
          </section>
          <section>
            <h2>Common questions</h2>
            {FAQ.map((f) => (
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
          title="Now say them: fly with your voice"
          body="Hearing a tone is half of it. In FlappyTone your voice steers the bird through tunnels shaped like each tone, with words from our native speaker. Free to play in your browser."
          secondary={{ href: "/chinese-tones", label: "Read the tone guide" }}
        />
      </article>
    </div>
  );
}

export function toneTestJsonLd(route: SiteRoute): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "TONEder: Chinese Tones Test",
      url: absoluteUrl(route.path),
      description: route.description,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript and audio",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
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
