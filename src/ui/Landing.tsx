import { useState } from "react";
import { brand } from "../brand.ts";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { TONE_INFO } from "../game/gates.ts";
import type { Tone } from "../game/gates.ts";
import { ContourSpark } from "./ContourSpark.tsx";
import { DemoLoop } from "./DemoLoop.tsx";
import { micErrorCopy } from "./micErrors.ts";
import { Nav } from "./Nav.tsx";

const TONES: Tone[] = [1, 2, 3, 4];

interface Props {
  /** Enter the app proper. The mic is already open when this fires. */
  onPlay: () => void;
  /** Straight to the visualiser. Mic already open. */
  onVisualiser: () => void;
  /** The launcher screen — tutorial, settings, how-to. No mic needed. */
  onMenu: () => void;
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
export function Landing({ onPlay, onVisualiser, onMenu }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <Nav variant="landing" onNavigate={() => {}} onPlay={go(onPlay)} disabled={busy} />

      <header id="top" className="landing-hero">
        {/* The h1 is the headline, not the brand name — see brand.headline. */}
        <h1>{brand.headline}</h1>
        <p className="hero-tagline">{brand.tagline}</p>
        <p className="hero-pitch">{brand.pitch}</p>
        <div className="hero-actions">
          <button className="primary" disabled={busy} onClick={go(onPlay)}>
            Play
          </button>
          <button disabled={busy} onClick={onMenu}>
            Tutorial &amp; settings
          </button>
        </div>
        <p className="note">{brand.requirement}</p>
        {error && <p className="error">{error}</p>}
      </header>

      <section id="demo" className="landing-section landing-demo">
        <DemoLoop />
        <p className="note">
          No sound, no microphone — this is just the game playing itself.
        </p>
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
        <ul className="tone-list">
          {TONES.map((tone) => (
            <li key={tone}>
              <ContourSpark tone={tone} />
              <span className="syllable">{TONE_INFO[tone].pinyin}</span>
              <span className="hanzi">{TONE_INFO[tone].hanzi}</span>
              <span className="cue">
                ({tone}) {TONE_INFO[tone].cue}
              </span>
            </li>
          ))}
        </ul>
        <p className="note">
          These curves are measured from a native speaker, not traced from the
          tone marks.
        </p>
      </section>

      <section id="play" className="landing-section landing-cta">
        <h2>Play</h2>
        <p>
          A run is a couple of minutes. First time through, a short calibration
          learns your voice — then the tutorial takes one tone at a time.
        </p>
        <button className="primary" disabled={busy} onClick={go(onPlay)}>
          Play now
        </button>
        <button className="link" disabled={busy} onClick={onMenu}>
          or start with the tutorial
        </button>
      </section>

      <section id="visualiser" className="landing-section">
        <h2>{brand.visualiser.title}</h2>
        <p>{brand.visualiser.body}</p>
        <button disabled={busy} onClick={go(onVisualiser)}>
          {brand.visualiser.cta}
        </button>
      </section>

      <section id="mobile" className="landing-section">
        <h2>{brand.mobile.title}</h2>
        <details className="landing-details">
          <summary>{brand.mobile.summary}</summary>
          <p>{brand.mobile.body}</p>
          <p>{brand.mobile.meantime}</p>
          <ul className="facts">
            <li>{brand.mobile.ios}</li>
            <li>{brand.mobile.android}</li>
          </ul>
          <p className="note">{brand.mobile.note}</p>
        </details>
      </section>

      <section id="limits" className="landing-section">
        <h2>What it doesn't do</h2>
        <ul className="facts">
          {brand.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <footer className="landing-footer">
        <p className="note">{brand.attribution}</p>
      </footer>
    </div>
  );
}
