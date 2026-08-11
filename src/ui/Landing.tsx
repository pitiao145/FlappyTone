import { useEffect, useId, useMemo, useState } from "react";
import { brand } from "../brand.ts";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { loadInventory } from "../audio/inventory.ts";
import type { Tone } from "../game/gates.ts";
import type { Word } from "../game/words.ts";
import { ComingSoon } from "./ComingSoon.tsx";
import { DemoLoop } from "./DemoLoop.tsx";
import { Footer } from "./Footer.tsx";
import { DotsThreeVerticalIcon, PlusSquareIcon, ShareIcon } from "./icons.tsx";
import { micErrorCopy } from "./micErrors.ts";
import { Nav } from "./Nav.tsx";
import { ToneAverageCard } from "./ToneAverageCard.tsx";
import { useNewsletterSubscribe } from "./useNewsletterSubscribe.ts";

const TONES: Tone[] = [1, 2, 3, 4];

const HOME_SCREEN_ICONS = {
  share: ShareIcon,
  menu: DotsThreeVerticalIcon,
  add: PlusSquareIcon,
} as const;

interface Props {
  /** Go to the main game menu (Title). No mic needed — Title opens it itself. */
  onPlay: () => void;
  /** Straight to the visualiser. Mic already open. */
  onVisualiser: () => void;
}

/**
 * The front door.
 *
 * Everything above `onPlay` is readable without a microphone, an account or a
 * click: the pitch, a working demo of the mechanic, and the honest limits. The
 * game shell (Title) sits behind the Play button and stays what it was — a
 * compact, mobile-first launcher.
 *
 * Copy lives in `src/brand.ts` and colour in `src/ui/tokens.css`; this file is
 * layout. Keep it that way — the whole point is that a re-brand touches two
 * files, not fifteen JSX strings.
 */
export function Landing({ onPlay, onVisualiser }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<Word[] | null>(null);
  const mobileEmailId = useId();
  const [mobileEmail, setMobileEmail] = useState("");
  const mobileNewsletter = useNewsletterSubscribe();

  // The "how it works" cards want the same measured contours the corridors
  // are built from — loadInventory is already warm by app start (App.tsx
  // kicks it off), this just reads the result once it lands.
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

  // iOS Safari grants getUserMedia only inside the gesture, so the mic opens
  // here rather than on the destination screen's mount. Same rule as Title.
  const go = (then: () => void) => async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureMic();
      then();
    } catch (err) {
      if (!(err instanceof MicCancelled)) {
        setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing">
      <Nav variant="landing" onNavigate={() => {}} onPlay={onPlay} disabled={busy} />

      <div className="hero-row">
        <header id="top" className="landing-hero">
          {/* The h1 is the headline, not the brand name — see brand.headline. */}
          <h1>{brand.headline}</h1>
          <p className="hero-tagline">{brand.tagline}</p>
          <p className="hero-pitch">{brand.pitch}</p>
          <div className="hero-actions">
            <button className="primary" disabled={busy} onClick={onPlay}>
              Play
            </button>
            <a href="#mobile" className="hero-secondary">
              {brand.installCta}
            </a>
          </div>
          <p className="note">{brand.requirement} {brand.privacyNote}</p>
          {error && <p className="error">{error}</p>}
        </header>

        <section id="demo" className="landing-section landing-demo">
          <DemoLoop width={380} />
          <p className="note">
            {brand.demoCaption}
          </p>
        </section>
      </div>

      <section id="visualiser" className="landing-section">
        <h2>{brand.visualiser.title}</h2>
        <p>{brand.visualiser.body}</p>
        <div className="tone-average-grid">
          <ToneAverageCard tone={3} words={wordsByTone.get(3) ?? []} />
        </div>
        <button className="primary visualiser-cta" disabled={busy} onClick={go(onVisualiser)}>
          {brand.visualiser.cta}
        </button>
      </section>

      <section id="how-it-works" className="landing-section">
        <h2>How it works</h2>
        <div className="landing-steps">
          {brand.howItWorks.map((step, i) => (
            <article key={step.title}>
              <span className="step-num">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
        <h3 className="tone-data-title">{brand.toneDataTitle}</h3>
        <p>{brand.toneDataIntro}</p>
        <div className="tone-average-grid">
          {TONES.map((tone) => (
            <ToneAverageCard key={tone} tone={tone} words={wordsByTone.get(tone) ?? []} />
          ))}
        </div>
        <p className="note">
          Every clip in the inventory, resampled and averaged: the bold line
          is the mean, the faint lines behind it are what she actually said.
        </p>
      </section>

      <section id="play" className="landing-section landing-cta">
        <h2>Play</h2>
        <p>
          A run is a couple of minutes. First time through, a short calibration
          learns your voice, then the tutorial takes one tone at a time.
        </p>
        <button className="primary" disabled={busy} onClick={onPlay}>
          Try now
        </button>

      </section>

      <ComingSoon />

      <section id="limits" className="landing-section">
        <h2>What it doesn't do</h2>
        <ul className="facts">
          {brand.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section id="mobile" className="landing-section">
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

        <h3>{brand.mobile.homeScreen.title}</h3>
        <p className="note">{brand.mobile.homeScreen.body}</p>
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
      </section>

      <Footer />
    </div>
  );
}
