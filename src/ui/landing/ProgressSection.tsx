import { brand } from "../../brand.ts";

/**
 * Landing → "Track progress". Real screens from the founder's account (27 Oct
 * 2026): the tone-shape comparison as a short screen recording, accuracy per
 * tone and the accuracy trend as screenshots. Static media, nothing live.
 */

const COPY = brand.landing.progress;

function Feature({ badges, title, children }: { badges: readonly string[]; title: string; children: React.ReactNode }) {
  return (
    <article className="pg-feature">
      <div className="pg-badges">
        {badges.map((b) => (
          <span key={b} className="pg-badge">
            {b}
          </span>
        ))}
      </div>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export function ProgressSection() {
  const { shape, accuracy, trend } = COPY;
  return (
    <section id="progress" className="sky-section pg">
      <div className="sky-head">
        <h2>{COPY.title}</h2>
        <p>{COPY.lede}</p>
        <p className="sky-small">{COPY.source}</p>
      </div>
      <div className="pg-layout">
        <Feature badges={[shape.badge]} title={shape.title}>
          <video
            className="pg-media pg-video"
            src="/lp/tone-evolution-demo.mp4"
            poster="/lp/tone-evolution-poster.jpg"
            width={540}
            height={1168}
            autoPlay
            muted
            loop
            playsInline
            aria-label={shape.alt}
          />
        </Feature>
        <div className="pg-stack">
          <Feature badges={accuracy.badges} title={accuracy.title}>
            <img
              className="pg-media"
              src="/lp/progress-accuracy.webp"
              width={782}
              height={816}
              alt={accuracy.alt}
              loading="lazy"
            />
          </Feature>
          <Feature badges={[trend.badge]} title={trend.title}>
            <img
              className="pg-media"
              src="/lp/progress-trend.webp"
              width={782}
              height={1164}
              alt={trend.alt}
              loading="lazy"
            />
          </Feature>
        </div>
      </div>
    </section>
  );
}
