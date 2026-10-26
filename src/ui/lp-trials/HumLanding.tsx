import { useEffect, useState } from "react";
import { brand } from "../../brand.ts";
import { tierLimits } from "../../game/tiers.ts";
import { LEARN_LINKS } from "../../site/links.ts";
import { Pip } from "../../site/Pip.tsx";
import { capturePostHogEvent } from "../../analytics/posthog.ts";
import { DemoLoop, VisualiserDemoLoop } from "../DemoLoop.tsx";
import { Footer } from "../Footer.tsx";
import { PRO_PRICE } from "../plan.ts";
import { TONE_LINE_COLOR } from "../toneColors.ts";
import { ToneAverageCard } from "../ToneAverageCard.tsx";
import { NotifyForm, TONES, go, tornEdge, useWordsByTone } from "./shared.tsx";
import "./hum.css";

/**
 * Hallmark trial 1: the Hum theme (cut paper, card stock, Chillax), dealt 1/3.
 * Dev only, at `/?lp=hum`. Copy is local and cut to Hallmark's word budget so
 * the trial can be judged as a page; brand.ts stays the source for the live one.
 */

const MODES = brand.options.modes;

const TORN = {
  hero: tornEdge(11, "bottom", 2.2),
  strip: tornEdge(29, "both", 9),
  sheetA: tornEdge(41, "both", 2),
  sheetB: tornEdge(53, "both", 2),
  ink: tornEdge(67, "both", 1.6),
  shot: tornEdge(83, "bottom", 3),
};

export function HumLanding() {
  const wordsByTone = useWordsByTone();
  const [mode, setMode] = useState(0);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.fontshare.com/v2/css?f[]=chillax@500,600&display=swap";
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  return (
    <div className="lp-hum">
      <nav className="hum-nav" aria-label="Main">
        <a className="hum-brand" href="#top">
          <Pip size={34} /> FlappyTone
        </a>
        <ul className="hum-nav-links">
          <li><a href="#how-it-works">How it works</a></li>
          <li><a href="#visualiser">Visualiser</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li>
            <details className="hum-learn">
              <summary>Learn and tools</summary>
              <ul>
                {LEARN_LINKS.map((l) => (
                  <li key={l.href}><a href={l.href}>{l.label}</a></li>
                ))}
              </ul>
            </details>
          </li>
        </ul>
        <button className="hum-btn hum-btn-primary hum-btn-small" onClick={() => go("play", "nav")}>
          Play free
        </button>
      </nav>

      <header id="top" className="hum-hero" style={{ clipPath: TORN.hero }}>
        <div className="hum-hero-text">
          <h1>Your voice flies the bird.</h1>
          <p className="hum-lede">Train your Mandarin tones by steering through corridors shaped like them.</p>
          <div className="hum-actions">
            <button className="hum-btn hum-btn-primary" onClick={() => go("play", "hero_actions")}>
              Play free
            </button>
            <button className="hum-btn" onClick={() => go("visualiser", "hero_actions", "visualiser")}>
              Try the visualiser
            </button>
          </div>
          <p className="hum-small">{brand.requirement} Your voice never leaves your device.</p>
        </div>
        <figure id="demo" className="hum-demo">
          <div className="hum-sheet hum-sheet-tilt" style={{ clipPath: TORN.sheetA }}>
            <DemoLoop width={360} />
          </div>
          <span className="hum-sticker">Free to play</span>
          <figcaption>A real run: four corridors, one wall clipped.</figcaption>
        </figure>
        <ol className="hum-tiles" aria-label="The four tones" style={{ clipPath: TORN.strip }}>
          {TONES.map((t) => (
            <li key={t} style={{ "--tone": TONE_LINE_COLOR[t] } as React.CSSProperties}>
              <span lang="zh-Hant" className="hum-tile-hanzi">{brand.tones[t].hanzi}</span>
              <span className="hum-tile-pinyin">{brand.tones[t].pinyin}</span>
            </li>
          ))}
        </ol>
      </header>

      <section id="how-it-works" className="hum-section">
        <div className="hum-head">
          <h2>Four tones, four shapes.</h2>
          <p>
            Each curve is the average of every clip from our native speaker: 450+ words, Taiwan
            pronunciation, in TOCFL order. Recorded by the founder of{" "}
            <a
              href={brand.jane.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => capturePostHogEvent("landing_cta_clicked", { cta: "jane", location: "real_speech" }, { instant: true })}
            >
              {brand.jane.linkText}
            </a>
            .
          </p>
        </div>
        <div className="hum-tone-grid">
          {TONES.map((t) => (
            <div key={t} className="hum-card">
              <ToneAverageCard tone={t} words={wordsByTone.get(t) ?? []} />
            </div>
          ))}
        </div>
        <ul className="hum-pills" aria-label="What it is not">
          {brand.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section id="visualiser" className="hum-section hum-split">
        <div className="hum-sheet hum-sheet-tilt-r" style={{ clipPath: TORN.sheetB }}>
          <VisualiserDemoLoop width={480} />
        </div>
        <div className="hum-head">
          <h2>Watch your voice trace the shape.</h2>
          <p>Say mǎ ten times and see every try stack on the target. No score, no gate.</p>
          <button className="hum-btn hum-btn-primary" onClick={() => go("visualiser", "visualiser_section", "visualiser")}>
            Open the visualiser
          </button>
        </div>
      </section>

      <section id="tone-pairs" className="hum-pear">
        <dl className="hum-figures">
          <div><dt>words, single syllables</dt><dd>450+</dd></div>
          <div><dt>two-syllable tone pairs</dt><dd>240+</dd></div>
          <div><dt>game modes</dt><dd>4</dd></div>
          <div><dt>recordings of you uploaded</dt><dd>0</dd></div>
        </dl>
        <div className="hum-pear-text">
          <h2>Real words, sandhi and all.</h2>
          <p>
            Tone Pairs flies words like <span lang="zh-Hant">好玩</span> and <span lang="zh-Hant">以前</span>,
            each corridor shaped from the exact recording.
          </p>
          <blockquote>
            {brand.tonePairs.quote}
            <cite>An early tester</cite>
          </blockquote>
          <button className="hum-btn hum-btn-ink" onClick={() => go("tone_pairs", "tone_pairs", "pairs")}>
            Try Tone Pairs
          </button>
        </div>
      </section>

      <section id="options" className="hum-section">
        <div className="hum-head">
          <h2>Pick how you practise.</h2>
        </div>
        <div className="hum-chooser">
          <div className="hum-chips" role="radiogroup" aria-label="Game mode">
            {MODES.map((m, i) => (
              <button
                key={m.title}
                role="radio"
                aria-checked={mode === i}
                className="hum-chip"
                onClick={() => setMode(i)}
              >
                {m.title}
              </button>
            ))}
          </div>
          <p className="hum-chooser-result" aria-live="polite">
            <mark>{MODES[mode].title}</mark>: {MODES[mode].body}
          </p>
          <ul className="hum-settings">
            {brand.options.settings.map((s) => (
              <li key={s.title}>
                <b>{s.title}</b> {s.choices.replaceAll(" · ", ", ")}
              </li>
            ))}
          </ul>
          <button className="hum-btn hum-btn-primary" onClick={() => go("play", "options")}>
            Try it
          </button>
        </div>
      </section>

      <section id="leaderboard" className="hum-section hum-split hum-split-rev">
        <div className="hum-head">
          <h2>A real leaderboard.</h2>
          <p>This week, this month or all-time. Sign up free and every run counts.</p>
          <button className="hum-btn" onClick={() => go("leaderboard", "leaderboard", "leaderboard")}>
            See the board
          </button>
        </div>
        <img
          className="hum-shot"
          style={{ clipPath: TORN.shot }}
          src="/hero-cards/leaderboard.webp"
          width={1100}
          height={697}
          alt="The all-time leaderboard, top players ranked by score"
          loading="lazy"
        />
      </section>

      <section id="pricing" className="hum-section">
        <div className="hum-head">
          <h2>Free to start, {PRO_PRICE} once to go further.</h2>
        </div>
        <div className="hum-prices">
          <article className="hum-card hum-price">
            <h3>Free</h3>
            <ul>
              <li>{tierLimits().free.runsPerDay} runs a day</li>
              <li>Progress synced to your account</li>
              <li>A leaderboard entry, under a generated name</li>
              <li>{tierLimits().free.wordsPerTone} words per tone in the visualiser</li>
              <li>Limited tone pair practice</li>
            </ul>
            <button className="hum-btn" onClick={() => go("play", "pricing_free")}>
              Start free
            </button>
          </article>
          <article className="hum-card hum-price hum-price-pro">
            <span className="hum-sticker hum-sticker-coral">One-time</span>
            <h3>Pro, {PRO_PRICE}</h3>
            <ul>
              <li>Unlimited runs</li>
              <li>Every word, every tone, every TOCFL level</li>
              <li>Full tone pairs access</li>
              <li>A leaderboard name you choose</li>
              <li>Offline play (coming soon)</li>
            </ul>
            <button className="hum-btn hum-btn-primary" onClick={() => go("pricing", "pricing_pro", "pricing")}>
              Go Pro
            </button>
          </article>
        </div>
        <blockquote className="hum-quote">
          {brand.pricing.quote}
          <cite>EarlyBird player, over email</cite>
        </blockquote>
      </section>

      <section id="faq" className="hum-section hum-faq">
        <h2>Questions</h2>
        <div>
          {brand.faq.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="mobile" className="hum-ink" style={{ clipPath: TORN.ink }}>
        <div className="hum-ink-text">
          <h2>No app yet. Put it on your home screen.</h2>
          <div className="hum-steps">
            {[brand.mobile.homeScreen.ios, brand.mobile.homeScreen.android].map((p) => (
              <div key={p.label}>
                <h3>{p.label}</h3>
                <ol>
                  {p.steps.map((s) => (
                    <li key={s.text}>{s.text}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p>Native apps, a second voice and more tone-pair drills are next. Hear when they ship:</p>
          <NotifyForm className="hum-notify" cta="Notify me" placeholder="you@example.com" />
          <p className="hum-small">{brand.mobile.notify.disclaimer}</p>
        </div>
        <video
          className="hum-phone"
          src="/PWA-instructions.mp4"
          poster="/PWA-instructions-poster.jpg"
          width={502}
          height={1080}
          autoPlay
          muted
          loop
          playsInline
        />
      </section>

      <Footer />
    </div>
  );
}
