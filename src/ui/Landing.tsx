import { useId, useMemo, useState } from "react";
import { brand } from "../brand.ts";
import type { Tone } from "../game/gates.ts";
import { tierLimits } from "../game/tiers.ts";
import { wordsFromCatalog, wordsOfTone, type Word } from "../game/words.ts";
import { DEFAULT_SPEAKER_ID } from "../data/catalogRows.ts";
import fallback from "../data/wordsFallback.json";
import { capturePostHogEvent } from "../analytics/posthog.ts";
import { ComingSoon } from "./ComingSoon.tsx";
import { DemoLoop, VisualiserDemoLoop } from "./DemoLoop.tsx";
import { Footer } from "./Footer.tsx";
import { DotsThreeVerticalIcon, PlusSquareIcon, ShareIcon } from "./icons.tsx";
import { Nav } from "./Nav.tsx";
import { goToApp } from "./appLink.ts";
import { PRO_PRICE } from "./plan.ts";
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
export function Landing({ onPlay, onVisualiser }: Props) {
  const mobileEmailId = useId();
  const [mobileEmail, setMobileEmail] = useState("");
  const mobileNewsletter = useNewsletterSubscribe("mobile");

  /**
   * The "how it works" cards want the same measured contours the corridors are
   * built from. They read the *bundled* catalog export, not the live one: this
   * page may not import `src/data/` code at all (the marketing chunk must stay
   * free of the Supabase graph, same rule that keeps `src/audio/` and
   * `src/pitch/` out of it), and a JSON import pulls in no module. The cards
   * are illustration, not inventory — a catalog edit reaching them on the next
   * deploy is fine.
   */
  const words = useMemo(
    () => wordsFromCatalog(fallback.rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID }))),
    [],
  );

  const wordsByTone = useMemo(() => {
    const map = new Map<Tone, Word[]>();
    for (const t of TONES) {
      map.set(t, wordsOfTone(words, t));
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
        <article className="hero-card hero-card-media">
          <p className="section-eyebrow">{brand.heroCards.play.eyebrow}</p>
          <h3>{brand.heroCards.play.title}</h3>
          <p>{brand.heroCards.play.body}</p>
          <img
            className="hero-card-thumb"
            src="/hero-cards/practice.webp"
            width={420}
            height={832}
            alt=""
            loading="lazy"
          />
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
        <article className="hero-card hero-card-accent hero-card-media">
          <p className="section-eyebrow">{brand.heroCards.visualise.eyebrow}</p>
          <h3>{brand.heroCards.visualise.title}</h3>
          <p>{brand.heroCards.visualise.body}</p>
          <img
            className="hero-card-thumb"
            src="/hero-cards/understanding.webp"
            width={500}
            height={499}
            alt=""
            loading="lazy"
          />
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

      <section id="why-tones-hard" className="landing-section">
        <div className="quote-row">
          <div className="quote-row-text">
            <p className="section-eyebrow">{brand.notTextbook.eyebrow}</p>
            <h2>{brand.notTextbook.title}</h2>
            <p>{brand.notTextbook.body}</p>
          </div>
          <blockquote className="landing-quote">
            {brand.notTextbook.quote}
            <cite>{brand.notTextbook.quoteAttribution}</cite>
          </blockquote>
        </div>
      </section>

      <section id="visualiser" className="landing-section landing-section-panel">
        <div className="visualiser-row">
          <div className="visualiser-demo">
            <VisualiserDemoLoop width={500} />
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

      <section id="tone-pairs" className="landing-section">
        <div className="quote-row">
          <div className="quote-row-text">
            <p className="section-eyebrow">{brand.tonePairs.eyebrow}</p>
            <h2>{brand.tonePairs.title}</h2>
            <p>{brand.tonePairs.body}</p>
            <button
              className="primary landing-section-cta"
              onClick={() => {
                capturePostHogEvent("landing_cta_clicked", { cta: "tone_pairs", location: "tone_pairs" }, INSTANT);
                goToApp("pairs");
              }}
            >
              {brand.tonePairs.cta}
            </button>
          </div>
          <blockquote className="landing-quote">
            {brand.tonePairs.quote}
            <cite>{brand.tonePairs.quoteAttribution}</cite>
          </blockquote>
        </div>
      </section>

      <section id="leaderboard" className="landing-section landing-section-panel">
        <div className="leaderboard-row">
          <div className="leaderboard-row-text">
            <p className="section-eyebrow">{brand.leaderboard.eyebrow}</p>
            <h2>{brand.leaderboard.title}</h2>
            <p>{brand.leaderboard.body}</p>
            <button
              className="primary landing-section-cta"
              onClick={() => {
                capturePostHogEvent("landing_cta_clicked", { cta: "leaderboard", location: "leaderboard" }, INSTANT);
                goToApp("leaderboard");
              }}
            >
              {brand.leaderboard.cta}
            </button>
          </div>
          <img
            className="leaderboard-shot"
            src="/hero-cards/leaderboard.webp"
            width={1100}
            height={697}
            alt="The all-time leaderboard, top players ranked by score"
            loading="lazy"
          />
        </div>
      </section>

      <ComingSoon />

      <section id="pricing" className="landing-section">
        <div className="quote-row">
          <div className="quote-row-text">
            <p className="section-eyebrow">{brand.pricing.eyebrow}</p>
            <h2>{brand.pricing.title}</h2>
          </div>
          <blockquote className="landing-quote">
            {brand.pricing.quote}
            <cite>{brand.pricing.quoteAttribution}</cite>
          </blockquote>
        </div>
        <div className="hero-cards">
          <article className="hero-card">
            <h3>{brand.pricing.free.label}</h3>
            <ul className="pricing-feature-list">
              <li>{tierLimits().free.runsPerDay} runs a day</li>
              <li>Progress saved and synced to your account</li>
              <li>A real leaderboard entry, under a generated name</li>
              <li>{tierLimits().free.wordsPerTone} words per tone in the visualiser</li>
            </ul>
            <button
              className="secondary"
              onClick={() => {
                capturePostHogEvent("landing_cta_clicked", { cta: "play", location: "pricing_free" }, INSTANT);
                onPlay();
              }}
            >
              {brand.pricing.free.cta}
            </button>
          </article>
          <article className="hero-card hero-card-accent">
            <h3>{brand.pricing.pro.label} — {PRO_PRICE} one-time</h3>
            <ul className="pricing-feature-list">
              <li>Unlimited runs</li>
              <li>Every word, every tone, every TOCFL level</li>
              <li>Full tone pairs access</li>
              <li>Leaderboard entry under a name you choose</li>
            </ul>
            <button
              className="primary"
              onClick={() => {
                capturePostHogEvent("landing_cta_clicked", { cta: "pricing", location: "pricing_pro" }, INSTANT);
                goToApp("pricing");
              }}
            >
              {brand.pricing.pro.cta}
            </button>
          </article>
        </div>
      </section>

      <section id="faq" className="landing-section">
        <p className="section-eyebrow">FAQ</p>
        <h2>Questions</h2>
        <div className="landing-faq">
          {brand.faq.map((item) => (
            <details key={item.q} className="landing-faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="mobile" className="landing-section">

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

        <div className="mobile-platforms">
          <h3>{brand.mobile.homeScreen.title}</h3>
          <div className="mobile-row">
          <div className="mobile-video">
            <video
              src="/PWA-instructions.mp4"
              autoPlay
              muted
              loop
              playsInline
            />
          </div>
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
          </div>
          </div>
          <p className="note">{brand.mobile.homeScreen.body}</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
