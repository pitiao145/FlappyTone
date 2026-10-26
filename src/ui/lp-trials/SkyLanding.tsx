import { useEffect } from "react";
import { brand } from "../../brand.ts";
import type { Tone } from "../../game/gates.ts";
import { tierLimits } from "../../game/tiers.ts";
import { LEARN_LINKS } from "../../site/links.ts";
import { Pip } from "../../site/Pip.tsx";
import { capturePostHogEvent } from "../../analytics/posthog.ts";
import { DemoLoop, VisualiserDemoLoop } from "../DemoLoop.tsx";
import { Footer } from "../Footer.tsx";
import { PRO_PRICE } from "../plan.ts";
import { TONE_LINE_COLOR } from "../toneColors.ts";
import { ToneAverageCard } from "../ToneAverageCard.tsx";
import { NotifyForm, TONES, go, useWordsByTone } from "./shared.tsx";
import "./sky.css";

/**
 * Hallmark trial 2: custom. The idea: the page is the corridor. You scroll
 * through the game's own sky, and every band of ground is a wall whose edge is
 * a tone contour, the same shapes the bird flies. Dev only, at `/?lp=sky`.
 */

/** Pitch height 0 (low) to 1 (high) along a syllable, per tone. */
const CONTOUR: Record<Tone, (t: number) => number> = {
  1: () => 0.82,
  2: (t) => 0.32 + 0.56 * t * t,
  3: (t) => 0.55 - 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (t < 0.8 ? 1 : 0.4) + 0.3 * t * t,
  4: (t) => 0.92 - 0.8 * t,
};

function contourPoints(tone: Tone, w: number, top: number, span: number, n = 48): string {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(`${((t * w)).toFixed(1)},${(top + (1 - CONTOUR[tone](t)) * span).toFixed(1)}`);
  }
  return pts.join(" L");
}

/** A band of ground whose top (or bottom) edge is a tone's contour. */
function Wall({ tone, edge }: { tone: Tone; edge: "top" | "bottom" }) {
  const W = 1200;
  const H = 150;
  const line = contourPoints(tone, W, 14, 110);
  const d = edge === "top" ? `M${line} L${W},${H} L0,${H} Z` : `M${line} L${W},0 L0,0 Z`;
  return (
    <svg
      className={`sky-wall sky-wall-${edge}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} className="sky-wall-fill" />
      <path d={`M${line}`} className="sky-wall-rim" />
    </svg>
  );
}

/** One tone as a pair of corridor walls with the gap the bird flies through. */
function Corridor({ tone }: { tone: Tone }) {
  const W = 240;
  const H = 180;
  const gap = 46;
  const mid = (t: number) => 24 + (1 - CONTOUR[tone](t)) * (H - 48 - gap);
  const n = 32;
  const topEdge: string[] = [];
  const botEdge: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t * W).toFixed(1);
    topEdge.push(`${x},${mid(t).toFixed(1)}`);
    botEdge.push(`${x},${(mid(t) + gap).toFixed(1)}`);
  }
  const bird = mid(0.62) + gap / 2;
  return (
    <svg className="sky-corridor" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={`M0,0 L${topEdge.join(" L")} L${W},0 Z`} className="sky-wall-fill" />
      <path d={`M0,${H} L${botEdge.join(" L")} L${W},${H} Z`} className="sky-wall-fill" />
      <path d={`M${topEdge.join(" L")}`} className="sky-wall-rim" />
      <path d={`M${botEdge.join(" L")}`} className="sky-wall-rim" />
      <path
        d={`M${topEdge.map((p) => {
          const [x, y] = p.split(",").map(Number);
          return `${x},${(y + gap / 2).toFixed(1)}`;
        }).join(" L")}`}
        className="sky-corridor-trace"
        style={{ stroke: TONE_LINE_COLOR[tone] }}
      />
      <g transform={`translate(${0.62 * W - 16}, ${bird - 16})`}>
        <circle cx="14" cy="16" r="11" className="sky-bird-body" />
        <circle cx="17" cy="11" r="3" className="sky-bird-eye" />
        <path d="M24 13 L32 16 L24 19 z" className="sky-bird-beak" />
      </g>
    </svg>
  );
}

export function SkyLanding() {
  const wordsByTone = useWordsByTone();

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Lilita+One&display=swap";
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  return (
    <div className="lp-sky">
      <nav className="sky-nav" aria-label="Main">
        <a className="sky-brand" href="#top">
          <Pip size={38} tilt={-8} /> FlappyTone
        </a>
        <ul className="sky-nav-links">
          <li><a href="#how-it-works">The four tones</a></li>
          <li><a href="#visualiser">Visualiser</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li>
            <details className="sky-learn">
              <summary>Learn and tools</summary>
              <ul>
                {LEARN_LINKS.map((l) => (
                  <li key={l.href}><a href={l.href}>{l.label}</a></li>
                ))}
              </ul>
            </details>
          </li>
        </ul>
        <button className="sky-btn sky-btn-small" onClick={() => go("play", "nav")}>
          Play free
        </button>
      </nav>

      <header id="top" className="sky-hero">
        <div className="sky-hero-text">
          <h1>
            Your voice is the <span className="sky-nowrap">controller.</span>
          </h1>
          <p className="sky-lede">Say a Mandarin tone and the bird flies its shape.</p>
          <div className="sky-actions">
            <button className="sky-btn" onClick={() => go("play", "hero_actions")}>
              Play free
            </button>
            <button className="sky-btn sky-btn-ghost" onClick={() => go("visualiser", "hero_actions", "visualiser")}>
              Try the visualiser
            </button>
          </div>
          <p className="sky-small">{brand.requirement} Your voice never leaves your device.</p>
        </div>
        <figure id="demo" className="sky-screen">
          <DemoLoop width={340} />
          <figcaption>A real run, one wall clipped near the end.</figcaption>
        </figure>
      </header>

      <section id="how-it-works" className="sky-ground">
        <Wall tone={3} edge="top" />
        <div className="sky-inner">
          <h2>Four tones, four corridors.</h2>
          <p className="sky-ground-lede">
            Each tone mark is a pitch shape. The game turns each shape into a corridor you fly with your voice.
          </p>
          <ol className="sky-corridors">
            {TONES.map((t) => (
              <li key={t}>
                <Corridor tone={t} />
                <p className="sky-corridor-label">
                  <span lang="zh-Hant">{brand.tones[t].hanzi}</span>{" "}
                  <b style={{ color: TONE_LINE_COLOR[t] }}>{brand.tones[t].pinyin}</b>
                </p>
                <p className="sky-corridor-cue">{brand.tones[t].cue}</p>
              </li>
            ))}
          </ol>
        </div>
        <Wall tone={2} edge="bottom" />
      </section>

      <section id="real-speech" className="sky-section">
        <div className="sky-split">
          <div className="sky-head">
            <h2>Shaped from 450+ real recordings.</h2>
            <p>
              One native Taiwanese speaker, Traditional characters, TOCFL word order. Each bold line is her
              average; the faint ones are what she actually said. Recorded by the founder of{" "}
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
            <ul className="sky-tags">
              {brand.limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          <div className="sky-tone-grid">
            {TONES.map((t) => (
              <div key={t} className="sky-panel">
                <ToneAverageCard tone={t} words={wordsByTone.get(t) ?? []} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="visualiser" className="sky-section">
        <div className="sky-split sky-split-rev">
          <div className="sky-panel sky-panel-media">
            <VisualiserDemoLoop width={480} />
          </div>
          <div className="sky-head">
            <h2>No gates. Just your voice and the shape.</h2>
            <p>Say mǎ ten times and every try stacks on the target. Nothing is scored.</p>
            <button className="sky-btn" onClick={() => go("visualiser", "visualiser_section", "visualiser")}>
              Open the visualiser
            </button>
          </div>
        </div>
      </section>

      <section id="tone-pairs" className="sky-sand">
        <div className="sky-inner sky-split">
          <div className="sky-head">
            <h2>
              <span lang="zh-Hant">好玩</span>, <span lang="zh-Hant">以前</span> and 240 more.
            </h2>
            <p>
              Tone Pairs flies real two-syllable words. Each corridor comes from the exact recording, sandhi
              included.
            </p>
            <button className="sky-btn" onClick={() => go("tone_pairs", "tone_pairs", "pairs")}>
              Try Tone Pairs
            </button>
          </div>
          <div className="sky-quotes">
            <blockquote>
              {brand.notTextbook.quote}
              <cite>r/taiwan</cite>
            </blockquote>
            <blockquote>
              {brand.tonePairs.quote}
              <cite>An early tester</cite>
            </blockquote>
          </div>
        </div>
      </section>

      <section id="options" className="sky-section">
        <div className="sky-head">
          <h2>Four ways to fly.</h2>
        </div>
        <ul className="sky-pipes">
          {brand.options.modes.map((m) => (
            <li key={m.title} className="sky-pipe">
              <h3>{m.title}</h3>
              <p>{m.body}</p>
            </li>
          ))}
        </ul>
        <dl className="sky-settings">
          {brand.options.settings.map((s) => (
            <div key={s.title}>
              <dt>{s.title}</dt>
              <dd>{s.choices.replaceAll(" · ", ", ")}</dd>
            </div>
          ))}
        </dl>
        <button className="sky-btn sky-center" onClick={() => go("play", "options")}>
          Try it
        </button>
      </section>

      <section id="leaderboard" className="sky-section">
        <div className="sky-split">
          <div className="sky-head">
            <h2>Defend your spot on the board.</h2>
            <p>Week, month or all-time. Sign up free and every run counts.</p>
            <button className="sky-btn sky-btn-ghost" onClick={() => go("leaderboard", "leaderboard", "leaderboard")}>
              See the board
            </button>
          </div>
          <img
            className="sky-panel sky-shot"
            src="/hero-cards/leaderboard.webp"
            width={1100}
            height={697}
            alt="The all-time leaderboard, top players ranked by score"
            loading="lazy"
          />
        </div>
      </section>

      <section id="pricing" className="sky-ground sky-ground-pricing">
        <Wall tone={1} edge="top" />
        <div className="sky-inner">
          <h2>Free to fly. {PRO_PRICE} once for everything.</h2>
          <div className="sky-prices">
            <article className="sky-price">
              <h3>Free</h3>
              <ul>
                <li>{tierLimits().free.runsPerDay} runs a day</li>
                <li>Progress synced to your account</li>
                <li>A leaderboard entry, under a generated name</li>
                <li>{tierLimits().free.wordsPerTone} words per tone in the visualiser</li>
                <li>Limited tone pair practice</li>
              </ul>
              <button className="sky-btn sky-btn-ghost" onClick={() => go("play", "pricing_free")}>
                Start free
              </button>
            </article>
            <article className="sky-price sky-price-pro">
              <h3>Pro, {PRO_PRICE} one-time</h3>
              <ul>
                <li>Unlimited runs</li>
                <li>Every word, every tone, every TOCFL level</li>
                <li>Full tone pairs access</li>
                <li>A leaderboard name you choose</li>
                <li>Offline play (coming soon)</li>
              </ul>
              <button className="sky-btn" onClick={() => go("pricing", "pricing_pro", "pricing")}>
                Go Pro
              </button>
            </article>
          </div>
          <blockquote className="sky-ground-quote">
            {brand.pricing.quote}
            <cite>EarlyBird player, over email</cite>
          </blockquote>
        </div>
        <Wall tone={4} edge="bottom" />
      </section>

      <section id="faq" className="sky-section sky-faq">
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

      <section id="mobile" className="sky-section">
        <div className="sky-split sky-mobile">
          <video
            className="sky-phone"
            src="/PWA-instructions.mp4"
            poster="/PWA-instructions-poster.jpg"
            width={502}
            height={1080}
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="sky-head">
            <h2>No app yet. Use your home screen.</h2>
            <div className="sky-steps">
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
            <p>Native apps, a second voice and more tone-pair drills are next.</p>
            <NotifyForm className="sky-notify" cta="Notify me" placeholder="you@example.com" />
            <p className="sky-small">{brand.mobile.notify.disclaimer}</p>
          </div>
        </div>
      </section>

      <div className="sky-footer">
        <Footer />
      </div>
    </div>
  );
}
