import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { brand } from "../../brand.ts";
import type { Tone } from "../../game/gates.ts";
import { wordsFromCatalog } from "../../game/words.ts";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
import fallback from "../../data/wordsFallback.json";
import { Pip } from "../../site/Pip.tsx";
import { capturePostHogEvent } from "../../analytics/posthog.ts";
import { VisualiserDemoLoop } from "../DemoLoop.tsx";
import { Footer } from "../Footer.tsx";
import { Nav } from "../Nav.tsx";
import { ScrollBird } from "../ScrollBird.tsx";
import { FREE_HIGHLIGHTS, PRO_HIGHLIGHTS, PRO_PRICE } from "../plan.ts";
import { TONE_LINE_COLOR } from "../toneColors.ts";
import { ToneAverageCard } from "../ToneAverageCard.tsx";
import { NotifyForm, TONES, go, goToPage, useWordsByTone } from "./shared.tsx";
import { ProgressSection } from "./ProgressSection.tsx";
import { TryItNow, type DemoControl } from "./TryItNow.tsx";

type DemoMode = "game" | "drill" | "pairs";

/** The mode chooser's demo per card title (brand.options.modes); Learn has none. */
const CHOOSER_DEMO: Record<string, DemoMode | undefined> = {
  Classic: "game",
  "Tone Drill": "drill",
  "Tone Pairs": "pairs",
};
import "./sky.css";

/**
 * The landing page at `/` (built with the Hallmark skill, custom direction).
 * The idea: the page is the corridor. You scroll through the game's own sky,
 * and every band of ground is a wall whose edge is a tone contour, the same
 * shapes the bird flies. Prerendered into index.html for crawlers
 * (src/dev/prerenderEntry.tsx), so it must render without `window`.
 *
 * Copy lives in brand.ts: `brand.landing` holds this page's own lines, cut to
 * Hallmark's budget (one idea a sentence, about 80 words a screen).
 */

const COPY = brand.landing;

/**
 * Real quotes from players, as brand.ts has them. Never add one nobody said.
 * The avatars are roster birds (docs/bird-design/roster), not the players.
 */
const QUOTES = [
  { text: brand.notTextbook.quote, who: brand.notTextbook.quoteAttribution, bird: "lu_rou_fan" },
  { text: brand.tonePairs.quote, who: brand.tonePairs.quoteAttribution, bird: "boba" },
  { text: brand.pricing.quote, who: brand.pricing.quoteAttribution, bird: "ji_pai" },
].map((q) => ({ ...q, who: q.who.replace(/^—\s*/, "") }));

/** The real gate, drawn by the game's renderer. Off the first paint. */
const GateDemo = lazy(() => import("./GateDemo.tsx"));

/** Example words for the gate picker: one per tone, then a few pairs. */
const EXAMPLES: { group: "Single tones" | "Tone pairs"; id: string }[] = [
  { group: "Single tones", id: "ma1b" },
  { group: "Single tones", id: "ma2" },
  { group: "Single tones", id: "ma3b" },
  { group: "Single tones", id: "ma4b" },
  { group: "Tone pairs", id: "zhongwen12" },
  { group: "Tone pairs", id: "laoshi31" },
  { group: "Tone pairs", id: "haowan32" },
  { group: "Tone pairs", id: "nihao33" },
];

/** Pitch height 0 (low) to 1 (high) along a syllable, per tone. */
const CONTOUR: Record<Tone, (t: number) => number> = {
  1: () => 0.82,
  2: (t) => 0.32 + 0.56 * t * t,
  3: (t) => 0.55 - 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (t < 0.8 ? 1 : 0.4) + 0.3 * t * t,
  4: (t) => 0.92 - 0.8 * t,
};

/** A band of ground whose top (or bottom) edge is a tone's contour. */
function Wall({ tone, edge }: { tone: Tone; edge: "top" | "bottom" }) {
  const W = 1200;
  const H = 150;
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    pts.push(`${(t * W).toFixed(1)},${(14 + (1 - CONTOUR[tone](t)) * 110).toFixed(1)}`);
  }
  const line = pts.join(" L");
  const d = edge === "top" ? `M${line} L${W},${H} L0,${H} Z` : `M${line} L${W},0 L0,0 Z`;
  return (
    <svg className={`sky-wall sky-wall-${edge}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} className="sky-wall-fill" />
      <path d={`M${line}`} className="sky-wall-rim" />
    </svg>
  );
}

function toneLabel(tones: number[]): string {
  return tones.length > 1 ? `Tones ${tones.join(" + ")}` : `Tone ${tones[0]}`;
}

export function SkyLanding() {
  const wordsByTone = useWordsByTone();
  const [mode, setMode] = useState(0);
  const [exampleId, setExampleId] = useState(EXAMPLES[2].id);

  const examples = useMemo(() => {
    const all = wordsFromCatalog(fallback.rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })));
    return EXAMPLES.map((e) => ({ ...e, word: all.find((w) => w.id === e.id) })).filter(
      (e): e is typeof e & { word: NonNullable<typeof e.word> } => !!e.word,
    );
  }, []);
  const picked = examples.find((e) => e.id === exampleId) ?? examples[0];


  const modes = brand.options.modes;

  /** The hero's "or try the demo" link opens the demo beside it (TryItNow fills this). */
  const demo = useRef<DemoControl | null>(null);
  /**
   * The demo in a dialog, in one of the game's modes ("Try Tone Pairs", and
   * the mode chooser's "Try it"). Loaded on the tap; the hero run stops first
   * so two runs never share the mic.
   */
  const [overlay, setOverlay] = useState<{
    mod: typeof import("../../site/DemoOverlay.tsx");
    mode: DemoMode;
  } | null>(null);
  const openDemo = (mode: DemoMode, cta: string, location: string) => {
    capturePostHogEvent("landing_cta_clicked", { cta, location });
    demo.current?.stop();
    import("../../site/DemoOverlay.tsx")
      .then((mod) => setOverlay({ mod, mode }))
      .catch(() => go(cta, location, mode === "pairs" ? "pairs" : undefined));
  };

  return (
    <div className="sky lp-sky">
      <Nav onPlay={() => go("play", "nav")} />
      <ScrollBird />
      {overlay &&
        createPortal(
          <overlay.mod.DemoOverlay seedId={null} mode={overlay.mode} onClose={() => setOverlay(null)} />,
          document.body,
        )}

      <main className="sky-main">

      <header id="top" className="sky-hero">
        <div className="sky-hero-text">
          <h1>{COPY.headline}</h1>
          <p className="sky-lede">{COPY.lede}</p>
          <div className="sky-actions">
            <button className="sky-btn" onClick={() => go("play", "hero_actions")}>
              {brand.heroCards.play.cta}
            </button>
            {/* The free tool first: "Try" must not land on signup. */}
            <button className="sky-btn sky-btn-ghost" onClick={() => goToPage("visualiser_tool", "hero_actions", "/tools/tone-visualizer")}>
              {brand.heroCards.visualise.cta}
            </button>
          </div>
          <button
            type="button"
            className="sky-demo-link"
            onClick={() => {
              capturePostHogEvent("landing_cta_clicked", { cta: "try_demo_link", location: "hero_actions" });
              demo.current?.start();
            }}
          >
            {brand.heroCards.play.demoLink}
          </button>
          <p className="sky-small">{COPY.privacy}</p>
        </div>
        <TryItNow controlRef={demo} />
      </header>

      <section className="sky-proof" aria-label="What players say">
        <h2 className="sky-proof-title">What players say</h2>
        {QUOTES.map((q) => (
          <figure key={q.who} className="sky-testimonial">
            <blockquote>{q.text}</blockquote>
            <figcaption>
              <img src={`/lp/birds/${q.bird}.webp`} width={48} height={48} alt="" loading="lazy" />
              <cite>{q.who}</cite>
            </figcaption>
          </figure>
        ))}
      </section>

      <section id="how-it-works" className="sky-ground">
        <Wall tone={3} edge="top" />
        <div className="sky-inner">
          <div className="sky-split sky-split-how">
            <div className="sky-head">
              <h2>{brand.whyThisWorks.title}</h2>
              {COPY.why.map((p) => (
                <p key={p}>{p}</p>
              ))}
              <p className="sky-callout">{COPY.tunnels}</p>
            </div>
            <div className="sky-gate">
              <div className="sky-gate-picker">
                {(["Single tones", "Tone pairs"] as const).map((group) => (
                  <div key={group} className="sky-gate-group" role="radiogroup" aria-label={group}>
                    <h3>{group}</h3>
                    <div className="sky-gate-chips">
                      {examples
                        .filter((e) => e.group === group)
                        .map((e) => (
                          <button
                            key={e.id}
                            role="radio"
                            aria-checked={e.id === picked?.id}
                            className="sky-chip"
                            onClick={() => setExampleId(e.id)}
                          >
                            <span lang="zh-Hant">{e.word.hanzi}</span>{" "}
                            <span className="sky-chip-pinyin">{e.word.pinyin}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              {picked && (
                <figure className="sky-gate-screen">
                  <p className="sky-arrow-note" aria-hidden="true">
                    See the gates
                    <svg viewBox="0 0 64 56" className="sky-arrow">
                      <path d="M4 10 C 22 2, 38 6, 40 18 C 42 28, 30 30, 30 22 C 30 14, 46 14, 52 28 L 54 44" />
                      <path d="M46 38 L 54 46 L 60 36" />
                    </svg>
                  </p>
                  <Suspense fallback={<div className="sky-gate-canvas" />}>
                    <GateDemo
                      word={picked.word}
                      label={`The game's gate for ${picked.word.pinyin}, a corridor shaped like ${toneLabel(picked.word.tones).toLowerCase()}.`}
                    />
                  </Suspense>
                  <figcaption>
                    <span lang="zh-Hant">{picked.word.hanzi}</span>{" "}
                    <b>{picked.word.pinyin}</b>
                    {picked.word.english ? `, “${picked.word.english}”` : ""},{" "}
                    {picked.word.tones.map((t, i) => (
                      <span key={i} className="sky-gate-tone" style={{ color: TONE_LINE_COLOR[t] }}>
                        {i > 0 ? " + " : ""}
                        tone {t}
                      </span>
                    ))}
                  </figcaption>
                </figure>
              )}
            </div>
          </div>
        </div>
        <Wall tone={2} edge="bottom" />
      </section>

      <div className="sky-ticker" aria-label="What FlappyTone is not">
        <ul className="sky-ticker-track">
          {brand.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {brand.limits.map((l) => (
            <li key={`dup-${l}`} aria-hidden="true" className="sky-ticker-dup">
              {l}
            </li>
          ))}
        </ul>
      </div>

      <section id="real-speech" className="sky-section">
        <div className="sky-split">
          <div className="sky-head">
            <h2>{brand.toneDataTitle}</h2>
            <p>{COPY.realSpeech}</p>
            <p>
              {brand.jane.before}
              <a
                href={brand.jane.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => capturePostHogEvent("landing_cta_clicked", { cta: "jane", location: "real_speech" }, { instant: true })}
              >
                {brand.jane.linkText}
              </a>
              {brand.jane.after}
            </p>
          </div>
          <div>
            <div className="sky-tone-grid">
              {TONES.map((t) => (
                <div key={t} className="sky-panel">
                  <ToneAverageCard tone={t} words={wordsByTone.get(t) ?? []} />
                </div>
              ))}
            </div>
            <p className="sky-small sky-note">
              {COPY.averages}
            </p>
          </div>
        </div>
      </section>

      {/* "Feel them" is the visualiser's promise, so it heads that section. */}
      <section id="visualiser" className="sky-section">
        <div className="sky-split sky-split-rev">
          <div className="sky-panel sky-panel-media">
            <VisualiserDemoLoop width={480} />
          </div>
          <div className="sky-head">
            <h2>{brand.notTextbook.title}</h2>
            <p>{COPY.notTextbook}</p>
            <p>{COPY.visualiser}</p>
            <button className="sky-btn" onClick={() => go("visualiser", "visualiser_section", "visualiser")}>
              {brand.visualiser.cta}
            </button>
          </div>
        </div>
      </section>

      <ProgressSection />

      <section id="tone-pairs" className="sky-sand">
        <div className="sky-inner sky-split">
          <div className="sky-head">
            <h2>{COPY.pairsTitle}</h2>
            <p>{COPY.pairs}</p>
            <button className="sky-btn" aria-haspopup="dialog" onClick={() => openDemo("pairs", "tone_pairs", "tone_pairs")}>
              {brand.tonePairs.cta}
            </button>
          </div>
          <ol className="sky-pair-tiles" aria-label="Example tone pairs">
            {examples
              .filter((e) => e.group === "Tone pairs")
              .map((e) => (
                <li key={e.id}>
                  <span lang="zh-Hant">{e.word.hanzi}</span>
                  <span>{e.word.pinyin}</span>
                </li>
              ))}
          </ol>
        </div>
      </section>

      <section id="options" className="sky-section">
        <div className="sky-head">
          <h2>{brand.options.title}</h2>
          <p>{brand.options.body}</p>
        </div>
        <div className="sky-chooser">
          <h3>{brand.options.modesTitle}</h3>
          <div className="sky-chooser-chips" role="radiogroup" aria-label={brand.options.modesTitle}>
            {modes.map((m, i) => (
              <button key={m.title} role="radio" aria-checked={mode === i} className="sky-chip" onClick={() => setMode(i)}>
                {m.title}
              </button>
            ))}
          </div>
          <p className="sky-chooser-result" aria-live="polite">
            <mark>{modes[mode].title}</mark>: {modes[mode].body}
          </p>
          <h3>{brand.options.settingsTitle}</h3>
          <dl className="sky-settings">
            {brand.options.settings.map((s) => (
              <div key={s.title}>
                <dt>{s.title}</dt>
                <dd className="sky-settings-choices">{s.choices.replaceAll(" · ", ", ")}</dd>
                <dd>{s.body}</dd>
              </div>
            ))}
          </dl>
          {/* Classic, Drill and Pairs open the demo in that mode; Learn has no demo yet. */}
          {CHOOSER_DEMO[modes[mode].title] ? (
            <button
              className="sky-btn"
              aria-haspopup="dialog"
              onClick={() => openDemo(CHOOSER_DEMO[modes[mode].title]!, `try_${CHOOSER_DEMO[modes[mode].title]}`, "options")}
            >
              {brand.options.cta}
            </button>
          ) : (
            <button className="sky-btn" onClick={() => go("play", "options")}>
              {brand.options.cta}
            </button>
          )}
        </div>
      </section>

      <section id="leaderboard" className="sky-section">
        <div className="sky-split">
          <div className="sky-head">
            <h2>{brand.leaderboard.title}</h2>
            <p>{COPY.leaderboard}</p>
            <button className="sky-btn sky-btn-ghost" onClick={() => go("leaderboard", "leaderboard", "leaderboard")}>
              {brand.leaderboard.cta}
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
          <h2>{brand.pricing.title}</h2>
          <p className="sky-pay-once">{brand.pricing.pro.payOnce}</p>
          <div className="sky-prices">
            <article className="sky-price">
              <h3>{brand.pricing.free.label}</h3>
              <ul>
                {FREE_HIGHLIGHTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <button className="sky-btn sky-btn-ghost" onClick={() => go("play", "pricing_free")}>
                {brand.pricing.free.cta}
              </button>
            </article>
            <article className="sky-price sky-price-pro">
              <span className="sky-launch">{brand.pricing.pro.launch}</span>
              <h3>
                {brand.pricing.pro.label}: {PRO_PRICE} one-time
              </h3>
              <p className="sky-price-value">{brand.pricing.pro.value}</p>
              <ul>
                {PRO_HIGHLIGHTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <button className="sky-btn" onClick={() => go("pricing", "pricing_pro", "pricing")}>
                {brand.pricing.pro.cta}
              </button>
            </article>
          </div>
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
            <h2>{brand.mobile.title}</h2>
            <p>{COPY.mobile}</p>
            <NotifyForm className="sky-notify" cta={brand.mobile.notify.cta} placeholder={brand.mobile.notify.placeholder} />
            <p className="sky-small">{brand.mobile.notify.disclaimer}</p>
            <h3>{brand.mobile.homeScreen.title}</h3>
            <div className="sky-steps">
              {[brand.mobile.homeScreen.ios, brand.mobile.homeScreen.android].map((p) => (
                <div key={p.label}>
                  <h4>{p.label}</h4>
                  <ol>
                    {p.steps.map((s) => (
                      <li key={s.text}>{s.text}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <p className="sky-small">{brand.mobile.homeScreen.body}</p>
          </div>
        </div>
      </section>

      <section id="founder" className="sky-section">
        <div className="sky-founder">
          <div className="sky-head">
            <h2>Made by a Mandarin learner</h2>
            {COPY.founder.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <a href="mailto:pierre@pierrebuilds.dev">pierre@pierrebuilds.dev</a>
          </div>
          <video
            className="sky-founder-video"
            src="/lp/founder-play.mp4"
            poster="/lp/founder-play-poster.jpg"
            width={340}
            height={730}
            autoPlay
            muted
            loop
            playsInline
            aria-label="Pierre playing FlappyTone, his voice flying the bird through a tone corridor"
          />
        </div>
      </section>

      <section className="sky-final">
        <Wall tone={2} edge="top" />
        <div className="sky-inner sky-final-inner">
          <Pip size={88} tilt={-14} />
          <h2>One run a day keeps the lǎoshī away</h2>
          <button className="sky-btn" onClick={() => go("play", "final_cta")}>
            {brand.heroCards.play.cta}
          </button>
        </div>
        <Wall tone={4} edge="bottom" />
      </section>

      </main>

      <div className="sky-footer">
        <Footer />
      </div>
    </div>
  );
}
