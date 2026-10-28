import { brand } from "../../brand.ts";

/**
 * Landing → "Track progress". Real screens from the founder's account (27 Oct
 * 2026): the tone-shape comparison as a short screen recording, accuracy per
 * tone and the accuracy trend as screenshots, in one row, each frame the same height, never cropped. Static media,
 * nothing live.
 */

const COPY = brand.landing.progress;

function Feature({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <article className="pg-feature">
      <div className="pg-text">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
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
      </div>
      <div className="pg-layout">
        <Feature title={shape.title} body={shape.body}>
          <video
            className="pg-media"
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
        <Feature title={accuracy.title} body={accuracy.body}>
          <img className="pg-media" src="/lp/progress-accuracy.webp" width={782} height={816} alt={accuracy.alt} loading="lazy" />
        </Feature>
        <Feature title={trend.title} body={trend.body}>
          <img className="pg-media" src="/lp/progress-trend.webp" width={782} height={1164} alt={trend.alt} loading="lazy" />
        </Feature>
      </div>
    </section>
  );
}
