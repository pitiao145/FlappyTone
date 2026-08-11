import { useEffect, useMemo, useState } from "react";
import { brand } from "../brand.ts";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { loadInventory } from "../audio/inventory.ts";
import type { Tone } from "../game/gates.ts";
import type { Word } from "../game/words.ts";
import { ComingSoon } from "./ComingSoon.tsx";
import { ContourSpark } from "./ContourSpark.tsx";
import { DemoLoop } from "./DemoLoop.tsx";
import { micErrorCopy } from "./micErrors.ts";
import { Nav } from "./Nav.tsx";
import { ToneAverageCard } from "./ToneAverageCard.tsx";

const TONES: Tone[] = [1, 2, 3, 4];

interface Props {
  /** Go to the main game menu (Title). No mic needed — Title opens it itself. */
  onPlay: () => void;
  /** Straight to the visualiser. Mic already open. */
  onVisualiser: () => void;
  /** Straight to the tutorial. Mic already open. */
  onTutorial: () => void;
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
export function Landing({ onPlay, onVisualiser, onTutorial }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<Word[] | null>(null);

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
            <button disabled={busy} onClick={go(onTutorial)}>
              Tutorial
            </button>
          </div>
          <p className="note">{brand.requirement}</p>
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
          {([1, 3] as Tone[]).map((tone) => (
            <ToneAverageCard key={tone} tone={tone} words={wordsByTone.get(tone) ?? []} />
          ))}
        </div>
        <button disabled={busy} onClick={go(onVisualiser)}>
          {brand.visualiser.cta}
        </button>
      </section>

      <section id="how-it-works" className="landing-section">
        <h2>How it works</h2>
        <div className="landing-steps">
          {brand.howItWorks.map((step, i) => (
            <article key={step.title}>
              <span className="step-num">{i + 1}</span>
              {i === 1 && (
                <div className="tone-mark-row" aria-hidden="true">
                  {TONES.map((tone) => (
                    <ContourSpark key={tone} tone={tone} width={30} height={20} />
                  ))}
                </div>
              )}
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
        <div className="tone-average-grid">
          {TONES.map((tone) => (
            <ToneAverageCard key={tone} tone={tone} words={wordsByTone.get(tone) ?? []} />
          ))}
        </div>
        <p className="note">
          Every clip in the inventory, resampled and averaged — the bold line
          is the mean, the faint lines behind it are what she actually said.
        </p>
      </section>

      <section id="play" className="landing-section landing-cta">
        <h2>Play</h2>
        <p>
          A run is a couple of minutes. First time through, a short calibration
          learns your voice — then the tutorial takes one tone at a time.
        </p>
        <button className="primary" disabled={busy} onClick={onPlay}>
          Play now
        </button>
        <button className="link" disabled={busy} onClick={go(onTutorial)}>
          or start with the tutorial
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

      <footer className="landing-footer">
        <p className="note">{brand.attribution}</p>
      </footer>
    </div>
  );
}
