import { useState } from "react";
import { inventoryNow } from "../audio/inventory.ts";
import { MicError } from "../audio/mic.ts";
import { ensurePlaybackCtx } from "../audio/reference.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import type { Tone } from "../game/gates.ts";
import { availableTones, availableToneCombos, resolvedPool, toneComboKey, wordsForTier } from "../game/words.ts";
import type { PlayIntent } from "./PlayHome.tsx";
import { micErrorCopy } from "./micErrors.ts";
import { useTier } from "../data/tier.ts";
import { tierLimits } from "../game/tiers.ts";
import { ShuffleIcon, ToneMarkIcon, type ToneOrNeutral } from "./toneIcons.tsx";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 11V7a4 4 0 0 1 8 0v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ALL_TONES: Tone[] = [1, 2, 3, 4];

interface Props {
  /** An error raised elsewhere (e.g. a failed Retry) — shown alongside any error of this screen's own. */
  error: string | null;
  /** Called once the mic is open, exactly like PlayHome's onStart. */
  onStart: (
    intent: PlayIntent,
    opts?: { drillTone?: Tone; pairCombo?: Tone[] | null },
  ) => void;
  onBack: () => void;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The Modes picker: Classic (today's random-tone run, offered here for
 * symmetry with Play), Tone Drill (every gate is one chosen tone), and Learn
 * (hum along with the sine demo — see Game.tsx's forceSynth wiring — no
 * pronunciation required). Two steps at most: pick a mode, then — Drill gets
 * a tone picker, Learn gets a one-screen explainer before the mic opens, so
 * a first-timer doesn't wonder why the demo stopped playing real speech.
 * Mirrors PlayHome's own "open the mic inside the click handler, then hand
 * off" pattern, since this tap is the iOS gesture that has to carry
 * `ensureMic()`.
 */
export function ModeSelect({ error: externalError, onStart, onBack, canvasWidth, canvasHeight }: Props) {
  const tier = useTier();
  const [step, setStep] = useState<"mode" | "tone" | "learn" | "pairs">("mode");
  const [ownError, setOwnError] = useState<string | null>(null);
  const [pending, setPending] = useState<PlayIntent | null>(null);
  const busy = pending !== null;
  const error = ownError ?? externalError;

  // Whatever the catalog read has produced by now, narrowed to what this tier
  // may see — a drill tile must not offer a tone whose only words are locked.
  // Empty (not yet loaded) means "don't know yet" — offer all four rather than
  // greying every tile.
  const words = inventoryNow();
  const tierWords = words ? wordsForTier(words, tier) : null;
  // Tone Drill reads the same tier/level-restricted pool `resolvedPool`
  // builds for mode "drill" (sampler for guest, TOCFL1+2 for free, everything
  // for pro) — not the raw tier pool — so a tone offered here is a tone the
  // run can actually draw from once it starts.
  const drillWords = words ? resolvedPool(words, tier, "drill", "beginner", null) : null;
  const tones = drillWords && drillWords.length ? availableTones(drillWords) : ALL_TONES;
  // Same idea for pairs: only combos this tier's own words can build a gate
  // for. Unlike single tones, there is no "offer all" fallback — an empty
  // list renders the Tone pairs card locked, not hidden (see below). Guest
  // always gets an empty list regardless of combos — docs/Tiers.csv's
  // "Available modes" row: guest gets Tone drill/Learn only, Tone pairs
  // starts at free.
  const combos = tier !== "guest" && tierWords ? availableToneCombos(tierWords) : [];

  const go = (
    intent: PlayIntent,
    opts?: { drillTone?: Tone; pairCombo?: Tone[] | null },
  ) => async () => {
    if (busy) return;
    setPending(intent);
    setOwnError(null);
    try {
      void ensurePlaybackCtx(); // resume cue-playback ctx in-gesture (reference.ts)
      await ensureMic();
      onStart(intent, opts);
    } catch (err) {
      if (!(err instanceof MicCancelled)) {
        setOwnError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="stage game-stage playhome-stage">
      <div
        className="playhome-canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <div className="screen playhome-overlay">
          <h1>Modes</h1>

          {step === "mode" && (
            <>
              <p className="note">Pick how you want to play.</p>
              <div className="mode-select-cards">
                <button
                  type="button"
                  className="mode-card mode-card-classic"
                  disabled={busy}
                  onClick={go("game")}
                >
                  <span className="mode-card-title">
                    {pending === "game" ? "Opening mic…" : "Classic"}
                  </span>
                  <span className="mode-card-desc">
                    Classic game mode: random words.
                  </span>
                </button>
                <button
                  type="button"
                  className="mode-card mode-card-drill"
                  disabled={busy}
                  onClick={() => setStep("tone")}
                >
                  <span className="mode-card-title">Tone Drill</span>
                  <span className="mode-card-desc">
                    Choose one tone you want to drill, for focused practice.
                  </span>
                </button>
                <button
                  type="button"
                  className="mode-card mode-card-learn"
                  disabled={busy}
                  onClick={() => setStep("learn")}
                >
                  <span className="mode-card-title">Learn</span>
                  <span className="mode-card-desc">
                    Hum along with the demo's shape, great for learning the tones.
                  </span>
                </button>
                <button
                  type="button"
                  className="mode-card mode-card-pairs"
                  disabled={busy || combos.length === 0}
                  onClick={() => setStep("pairs")}
                >
                  <span className="mode-card-title">
                    Tone pairs
                    {combos.length === 0 && <LockIcon className="mode-card-lock" />}
                  </span>
                  <span className="mode-card-desc">
                    {combos.length === 0
                      ? tier === "guest"
                        ? "Sign up to unlock tone-pair practice."
                        : "No pairs available yet."
                      : "Practice tone-pairs here!"}
                  </span>
                </button>
              </div>
            </>
          )}

          {step === "tone" && (
            <>
              <p className="note">Which tone do you want to drill?</p>
              <div className="choice">
                {ALL_TONES.map((tone) => {
                  const disabled = !tones.includes(tone) || busy;
                  return (
                    <button
                      key={tone}
                      className="choice-option"
                      disabled={disabled}
                      onClick={go("drill", { drillTone: tone })}
                    >
                      {pending === "drill" ? (
                        "…"
                      ) : (
                        <>
                          <ToneMarkIcon tone={tone} className="tone-mark-icon" />
                          {tone}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              <button type="button" className="link" disabled={busy} onClick={() => setStep("mode")}>
                ← Back
              </button>
            </>
          )}

          {step === "pairs" && (
            <>
              <p className="note">Shuffle across every pair, or drill one combo.</p>
              {tier === "free" && (
                <p className="note">
                  {tierLimits().free.wordsPerTone} words available per tone pair. Go Pro for full access!
                </p>
              )}
              <div className="tone-pair-selection">
                <div className="pair-combo-grid">
                  {combos.map((combo) => (
                    <button
                      key={toneComboKey(combo)}
                      className="pair-combo-tile"
                      disabled={busy}
                      onClick={go("pairs", { pairCombo: combo })}
                    >
                      {pending === "pairs" ? (
                        "…"
                      ) : (
                        combo.map((tone, i) => (
                          <ToneMarkIcon key={i} tone={tone as ToneOrNeutral} className="pair-combo-tone-icon" />
                        ))
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="pair-combo-shuffle"
                  disabled={busy}
                  onClick={go("pairs", { pairCombo: null })}
                >
                  <ShuffleIcon className="pair-combo-shuffle-icon" />
                  {pending === "pairs" ? "…" : "Shuffle"}
                </button>
              </div>
              <button type="button" className="link" disabled={busy} onClick={() => setStep("mode")}>
                ← Back
              </button>
            </>
          )}

          {step === "learn" && (
            <>
              <p className="note">
              No words yet. Just hum each tone and match its shape as it appears. It is the fastest way to feel the pitch changes and build the muscle memory before you add real syllables.
              </p>
              <div className="menu playhome-menu">
                <button className="primary" disabled={busy} onClick={go("learn")}>
                  {pending === "learn" ? "Opening mic…" : "Start"}
                </button>
              </div>
              <button type="button" className="link" disabled={busy} onClick={() => setStep("mode")}>
                ← Back
              </button>
            </>
          )}

          {error && <p className="error">{error}</p>}

          {step === "mode" && (
            <button type="button" className="link" disabled={busy} onClick={onBack}>
              ← Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
