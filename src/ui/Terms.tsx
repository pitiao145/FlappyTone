export function Terms({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen howto-screen">
      <button className="link vis-back-link" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15 5 8 12l7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        back
      </button>

      <h2>Terms of Use</h2>
      <p className="note">Last updated: 24 August 2026</p>

      <p>
        FlappyTone is currently free to play. Playing it means you accept the
        terms below.
      </p>

      <section className="howto-section">
        <h3>1. The game</h3>
        <p>
          FlappyTone is provided as-is. It may change, break, or go away
          without notice. It's a solo side project, not a product with an
          SLA.
        </p>
      </section>

      <section className="howto-section">
        <h3>2. The reference audio and tone shapes</h3>
        <p>
          FlappyTone's word audio was recorded by Jane, a native Taiwanese
          Mandarin speaker, specifically for this game and used with her
          permission. The corridors you fly through, the tone-mark shapes in
          the game, are generated directly from that audio, not from generic
          tone templates.
        </p>
        <p>
          That audio, and the tone-shape data derived from it, is not open
          content. Specifically, without prior written permission from
          FlappyTone:
        </p>
        <ul className="terms-bullets">
          <li>
            Don't download, extract, or redistribute the reference audio
            clips or the tone-shape/corridor data, including by scraping them
            from the site or its files.
          </li>
          <li>
            Don't use them in another app, game, dataset, or product,
            including for training or fine-tuning a model.
          </li>
          <li>
            Don't republish or reuse Jane's voice recordings in any other
            context.
          </li>
        </ul>
        <p>
          This applies whether you got the files by playing the game, by
          inspecting the site, or by any other means.
        </p>
        <p>
          If you'd like to license this audio or the tone-shape data for
          something else, email{" "}
          <a href="mailto:pierre@pierrebuilds.dev">
            pierre@pierrebuilds.dev
          </a>
          , happy to talk about it.
        </p>
      </section>

      <section className="howto-section">
        <h3>3. No warranty</h3>
        <p>
          FlappyTone is provided "as is," with no guarantee it will be
          available, accurate, or error-free. Use it at your own risk.
        </p>
      </section>

      <section className="howto-section">
        <h3>4. Changes</h3>
        <p>
          These terms, and how FlappyTone is offered (including pricing), may
          change as the game changes. Continuing to use FlappyTone after an
          update means you accept the new terms.
        </p>
      </section>

      <section className="howto-section">
        <h3>5. Contact</h3>
        <p>
          Questions about these terms, or about licensing the audio/tone-shape
          content:{" "}
          <a href="mailto:pierre@pierrebuilds.dev">
            pierre@pierrebuilds.dev
          </a>
        </p>
      </section>
    </div>
  );
}
