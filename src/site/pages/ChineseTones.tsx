import { appHref } from "../../ui/appLink.ts";

/**
 * Placeholder for the /chinese-tones hub (SEO S1). It exists to prove the
 * route-table pipeline; S2 replaces the copy and drops `noindex`.
 *
 * The CTA is a real link built by `appHref`, so it carries `?src=` like every
 * other route-table CTA.
 */
export function ChineseTones() {
  return (
    <div className="screen legal-screen">
      <div className="legal-body">
        <h1>Chinese tones</h1>
        <p>
          Mandarin has four main tones. Each one is a pitch shape: high and level, rising, dipping,
          or falling. The same syllable with a different tone is a different word.
        </p>
        <p>
          FlappyTone lets you practise the tones out loud. Your voice steers a bird through a
          corridor shaped like the tone, so you can see your own pitch as you speak.
        </p>
        <p>
          <a className="primary" href={appHref(undefined, "/chinese-tones")}>
            Try it in your browser
          </a>
        </p>
      </div>
    </div>
  );
}
