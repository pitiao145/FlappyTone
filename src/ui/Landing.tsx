import { useEffect, useId, useMemo, useState } from "react";
import { brand } from "../brand.ts";
import { loadInventory } from "../audio/inventory.ts";
import type { Tone } from "../game/gates.ts";
import type { Word } from "../game/words.ts";
import { capturePostHogEvent } from "../analytics/posthog.ts";
import { ComingSoon } from "./ComingSoon.tsx";
import { DemoLoop, VisualiserDemoLoop } from "./DemoLoop.tsx";
import { Footer } from "./Footer.tsx";
import { DotsThreeVerticalIcon, PlusSquareIcon, ShareIcon } from "./icons.tsx";
import { Nav } from "./Nav.tsx";
import { ToneAverageCard } from "./ToneAverageCard.tsx";
import { useNewsletterSubscribe } from "./useNewsletterSubscribe.ts";

const TONES: Tone[] = [1, 2, 3, 4];

/**
 * Every CTA on this page leaves for /app, and PostHog's queue does not survive
 * a page navigation — a batched click event would be dropped on the way out.
 */
const INSTANT = { instant: true } as const;

const HOME_SCREEN_ICONS = {
  share: ShareIcon,
  menu: DotsThreeVerticalIcon,
  add: PlusSquareIcon,
} as const;

interface Props {
  /** Leave for the game at /app. */
  onPlay: () => void;
  /**
   * Leave for the game at /app, asking it for the visualiser.
   *
   * This used to open the microphone here, inside the click, and go straight
   * to the visualiser screen. It cannot any more: the game is a separate page,
   * and a gesture does not survive a navigation. The player taps once more on
   * the other side, which is what buys this page its freedom from `src/audio/`.
   */
  onVisualiser: () => void;
  /** Terms of Use page. */
  onTerms: () => void;
}

/**
 * The front door.
 *
 * Everything above `onPlay` is readable without a microphone, an account or a
 * click: the pitch, a working demo of the mechanic, and the honest limits. The
 * game shell (`/app`, its own nav plus the Play tab's standby screen) sits
 * behind the Play button and stays what it was — a compact, mobile-first
 * launcher.
 *
 * Copy lives in `src/brand.ts` and colour in `src/ui/tokens.css`; this file is
 * layout. Keep it that way — the whole point is that a re-brand touches two
 * files, not fifteen JSX strings.
 */
export function Landing({ onPlay, onVisualiser, onTerms }: Props) {
  const [words, setWords] = useState<Word[] | null>(null);
  const mobileEmailId = useId();
  const [mobileEmail, setMobileEmail] = useState("");
  const mobileNewsletter = useNewsletterSubscribe("mobile");

  // The "how it works" cards want the same measured contours the corridors
  // are built from. This is the only thing on the page that needs the clip
  // inventory, so it starts the fetch itself — the game's own warm-up runs on
  // the other entry now.
  useEffect(() => {
    loadInventory().then(setWords, () => setWords([]));
  }, []);

  const wordsByTone = useMemo(() => {
    const map = new Map<Tone, Word[]>();
    for (const t of TONES) {
      map.set(t, (words ?? []).filter((w) => w.tone === t));
    }
    return map;
  }, [words]);

  return (
    <div className="landing">
      <Nav onPlay={onPlay} />

      <div className="hero-row">
        <header id="top" className="landing-hero">
          <p className="section-eyebrow">{brand.heroEyebrow}</p>
          {/* The h1 is the headline, not the brand name — see brand.headline. */}
          <h1>{brand.headline}</h1>
          <p className="hero-pitch">{brand.pitch}</p>
          <div className="hero-actions">
            <button
              className="primary"
              onClick={() => {
                capturePostHogEvent("landing_cta_clicked", { cta: "play", location: "hero_actions" }, INSTANT);
                onPlay();
              }}
            >
              {brand.heroCards.play.cta}
            </button>
            <button
              className="secondary"
              onClick={() => {
                capturePostHogEvent("landing_cta_clicked", { cta: "visualiser", location: "hero_actions" }, INSTANT);
                onVisualiser();
              }}
            >
              {brand.heroCards.visualise.cta}
            </button>
          </div>
        </header>

        <section id="demo" className="landing-section landing-demo">
          <DemoLoop width={380} />
          <p className="note">
            {brand.demoCaption}
          </p>
        </section>
      </div>

      <section id="play" className="landing-section hero-cards">
        <article className="hero-card">
          <p className="section-eyebrow">{brand.heroCards.play.eyebrow}</p>
          <h3>{brand.heroCards.play.title}</h3>
          <p>{brand.heroCards.play.body}</p>
          <button
            className="primary"
            onClick={() => {
              capturePostHogEvent("landing_cta_clicked", { cta: "play", location: "hero" }, INSTANT);
              onPlay();
            }}
          >
            {brand.heroCards.play.cta}
          </button>
        </article>
        <article className="hero-card hero-card-accent">
          <p className="section-eyebrow">{brand.heroCards.visualise.eyebrow}</p>
          <h3>{brand.heroCards.visualise.title}</h3>
          <p>{brand.heroCards.visualise.body}</p>
          <button
            className="secondary"
            onClick={() => {
              capturePostHogEvent("landing_cta_clicked", { cta: "visualiser", location: "hero" }, INSTANT);
              onVisualiser();
            }}
          >
            {brand.heroCards.visualise.cta}
          </button>
        </article>
      <p className="note hero-requirement">{brand.requirement} {brand.privacyNote}</p>
      </section>

      <section id="how-it-works" className="landing-section">
        <p className="section-eyebrow">{brand.whyThisWorks.eyebrow}</p>
        <div className="why-this-works-content">
          <div className="why-this-works-text">
          <h2 className="title-multiline">{brand.whyThisWorks.title}</h2>
          <p>{brand.whyThisWorks.body}</p></div>
          <div className="visualiser-figure">
            <ToneAverageCard tone={3} words={wordsByTone.get(3) ?? []} />
            <p className="visualiser-caption">{brand.visualiser.imageCaption}</p>
          </div>
        </div>
      </section>

      <section id="visualiser" className="landing-section landing-section-panel">
        <div className="visualiser-row">
          <div className="visualiser-demo">
            <VisualiserDemoLoop width={440} />
          </div>
          <div className="visualiser-text">
            <p className="section-eyebrow">{brand.visualiser.eyebrow}</p>
            <h2>{brand.visualiser.title}</h2>
            <p>{brand.visualiser.body}</p>
            <button
              className="primary visualiser-cta"
              onClick={() => {
                capturePostHogEvent("landing_cta_clicked", { cta: "visualiser", location: "visualiser_section" }, INSTANT);
                onVisualiser();
              }}
            >
              {brand.visualiser.cta}
            </button>
          </div>
        </div>
      </section>

      <section id="real-speech" className="landing-section">
        <div className="real-speech-row">
          <div className="real-speech-text">
            <p className="section-eyebrow">{brand.toneDataEyebrow}</p>
            <h2>{brand.toneDataTitle}</h2>
            <p>{brand.toneDataIntro}</p>
          </div>
          <div className="real-speech-data">
            <div className="tone-average-grid">
              {TONES.map((tone) => (
                <ToneAverageCard key={tone} tone={tone} words={wordsByTone.get(tone) ?? []} />
              ))}
            </div>
            <p className="note">
              Every clip in the inventory, resampled and averaged: the bold line
              is the mean, the faint lines behind it are what she actually said.
            </p>
          </div>
        </div>
        <ul className="tag-pills tag-pills-centered">
          {brand.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <ComingSoon />

      <section id="mobile" className="landing-section">
        <div className="mobile-row">
          <div className="mobile-text">
            <p className="section-eyebrow">{brand.mobile.eyebrow}</p>
            <h2>{brand.mobile.title}</h2>
            <p>{brand.mobile.body}</p>

            {mobileNewsletter.status === "success" ? (
              <p className="newsletter-success">You&rsquo;re on the list.</p>
            ) : (
              <form
                className="coming-soon-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  mobileNewsletter.submit(mobileEmail);
                }}
              >
                <label htmlFor={mobileEmailId} className="visually-hidden">
                  Email address
                </label>
                <input
                  id={mobileEmailId}
                  type="email"
                  name="email"
                  placeholder={brand.mobile.notify.placeholder}
                  autoComplete="email"
                  required
                  value={mobileEmail}
                  onChange={(e) => setMobileEmail(e.target.value)}
                  disabled={mobileNewsletter.status === "loading"}
                />
                <button
                  type="submit"
                  className="primary"
                  disabled={mobileNewsletter.status === "loading"}
                >
                  {mobileNewsletter.status === "loading" ? "Joining…" : brand.mobile.notify.cta}
                </button>
              </form>
            )}
            {mobileNewsletter.error && (
              <p className="newsletter-error" role="alert">
                {mobileNewsletter.error}
              </p>
            )}
            <p className="coming-soon-disclaimer">{brand.mobile.notify.disclaimer}</p>
          </div>

          <div className="mobile-instructions">
            <h3>{brand.mobile.homeScreen.title}</h3>
            <div className="home-screen-guide">
              {[brand.mobile.homeScreen.ios, brand.mobile.homeScreen.android].map((platform) => (
                <div className="home-screen-platform" key={platform.label}>
                  <h4>{platform.label}</h4>
                  <ol className="home-screen-step-list">
                    {platform.steps.map((step, i) => {
                      const Icon = HOME_SCREEN_ICONS[step.icon];
                      return (
                        <li key={i}>
                          <span className="home-screen-step-icon">
                            <Icon />
                          </span>
                          <span>{step.text}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
              <p className="note">{brand.mobile.homeScreen.body}</p>
            </div>
          </div>
        </div>
      </section>

      <Footer onTerms={onTerms} />
    </div>
  );
}
