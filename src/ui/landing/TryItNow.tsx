import { useEffect, useMemo, useRef, useState } from "react";
import { brand } from "../../brand.ts";
import { captureGameEvent } from "../../analytics/posthog.ts";
import type { AnalyticsEvent } from "../../analytics/session.ts";

type TryNowAction = Extract<AnalyticsEvent, { type: "tool_used"; tool: "try-now" }>;

/** Try it now's funnel, in the site tools' events (global tier, closed values). */
function trackTry(action: TryNowAction["action"], extra: Omit<TryNowAction, "type" | "tool" | "action"> = {}) {
  captureGameEvent({ type: "tool_used", tool: "try-now", action, ...extra });
}
import {
  availableToneCombos,
  availableTones,
  toneComboKey,
  wordsForList,
  wordsForTier,
  wordsFromCatalog,
  type Word,
} from "../../game/words.ts";
import type { Tone } from "../../game/gates.ts";
import { DrillTonePicker, PairComboPicker } from "../ModePickers.tsx";
import type { RunSnapshot } from "../../game/run.ts";
import { GameHud, type OutcomeFlash } from "../GameHud.tsx";
import { nextQuoteIndex } from "../testimonials.ts";
import { DEFAULT_SPEAKER_ID } from "../../data/catalogRows.ts";
import fallback from "../../data/wordsFallback.json";
import { DemoLoop } from "../DemoLoop.tsx";
import { DemoGameOver } from "./DemoGameOver.tsx";
import { Confetti } from "../Confetti.tsx";
import { toneBreakdown, type RunStats } from "../../game/scoring.ts";
import { appHref } from "../appLink.ts";
import { playableSeed, seededRound } from "./demoSeed.ts";
import { InAppMicNotice, MicAllowNote, MicHelpPanel, continueInApp } from "../MicHelp.tsx";
import "./tryItNow.css";

type MiniModule = typeof import("./miniGame.ts");
type MiniGameRun = import("./miniGame.ts").MiniMode;

/** The mic chunk, loaded on the first tap so the second tap can open the mic. */
let modulePromise: Promise<MiniModule> | null = null;
function loadMini(): Promise<MiniModule> {
  modulePromise ??= import("./miniGame.ts");
  modulePromise.catch(() => {
    modulePromise = null;
  });
  return modulePromise;
}

const GATES = 5;
/** How long a gate's reaction stays up: Game.tsx's TOAST_MS. */
const FLASH_MS = 1200;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Words already flown on this page load. In memory only (the demo writes
 * nothing), so "One more round" brings new words until the pool runs out.
 */
const played = new Set<string>();

/** "single": one-syllable words. "pairs": two-syllable words (the Tone Pairs mode). */
type Level = "single" | "pairs";

/**
 * A fresh draw of `GATES` words for one round: none flown earlier on this
 * page load (when the pool allows), in a random order. Single syllables are
 * spread evenly over the four tones. The run flies exactly these, so none
 * repeats in a round.
 */
function draw(pool: Word[], level: Level): Word[] {
  let fresh = pool.filter((w) => !played.has(w.id));
  if (fresh.length < GATES) {
    for (const w of pool) played.delete(w.id);
    fresh = pool;
  }
  if (level === "pairs") {
    const out = shuffle(fresh).slice(0, GATES);
    for (const w of out) played.add(w.id);
    return out;
  }
  const byTone = [1, 2, 3, 4].map((t) => shuffle(fresh.filter((w) => w.tone === t)));
  const out: Word[] = [];
  for (let i = 0; out.length < GATES && byTone.some((g) => i < g.length); i++) {
    for (const g of shuffle(byTone)) if (i < g.length && out.length < GATES) out.push(g[i]);
  }
  for (const w of out) played.add(w.id);
  return shuffle(out);
}
const W = 420;
const H = 640;

type Step =
  | { kind: "loading" }
  | { kind: "pick"; mini: MiniModule; calibrated: boolean }
  | { kind: "choose"; mini: MiniModule; calibrated: boolean }
  | { kind: "preparing" }
  | { kind: "playing" }
  | { kind: "done"; stats: RunStats; quote: number }
  | { kind: "error"; message: string; micKind?: string };

/**
 * The Try it now demo, always inside `src/site/DemoOverlay.tsx` (every demo
 * entry point on the landing page and the site pages opens that dialog). It
 * opens on the CTA's tap: the mic chunk loads and the visitor picks a voice;
 * the voice tap opens the mic (inside that gesture) and five gates from the
 * guest pool fly right here, no account, no calibration. It can fly the
 * page's word first (`seedId`, see `demoSeed.ts`), its signup carries
 * `?src=<page>`, and leaving the run closes the overlay (`onClose`).
 *
 * `mode="drill"` / `"pairs"` (the landing's mode chooser and "Try Tone
 * Pairs") runs the game's own Tone Drill or Tone Pairs: first the game's
 * tone or combo picker (`ModePickers.tsx`), then the voice choice, then that
 * run mode on the guest pool.
 */
export function TryItNow({
  page,
  seedId = null,
  mode = "game",
  onClose,
}: {
  /** The site page the overlay opened on (route path), for `?src=` and tracking; unset on the landing page. */
  page?: string;
  /** A word id to fly first; ignored unless `playableSeed` accepts it. */
  seedId?: string | null;
  /** Classic ("game"), or the game's Tone Drill / Tone Pairs. */
  mode?: "game" | "drill" | "pairs";
  onClose?: () => void;
} = {}) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  /** For the unmount cleanup, which only sees the first render's `step`. */
  const stepRef = useRef(step.kind);
  useEffect(() => {
    stepRef.current = step.kind;
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  /** Bumped on exit, so a run still loading when the visitor left never starts. */
  const attemptRef = useRef(0);
  /** The game's HUD, polled like Game.tsx does (never per frame). */
  const [hud, setHud] = useState<RunSnapshot | null>(null);
  /** The last gate's reaction, as in the game: points, "nice T1", "that was a T3". */
  const [flash, setFlash] = useState<OutcomeFlash | null>(null);
  // Retired on a timer like Game.tsx's (TOAST_MS); a new gate replaces it.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(id);
  }, [flash]);
  const [confettiDone, setConfettiDone] = useState(false);
  /** The live run's mode, for the game's HUD. */
  const [runMode, setRunMode] = useState<"game" | "drill" | "pairs">("game");
  /** The last round's module and voice, so a mic retry starts straight away. */
  const lastRef = useRef<{ mini: MiniModule; voice: "lower" | "higher" } | null>(null);

  /** The app's guest pool: the beginner sampler, single syllables, free clips. */
  const { pools, seed } = useMemo(() => {
    const all = wordsFromCatalog(fallback.rows.map((r) => ({ ...r, speaker_id: DEFAULT_SPEAKER_ID })));
    const guest = wordsForTier(all, "guest");
    return {
      pools: {
        single: wordsForList(guest, null, "beginner"),
        // The guest intermediate sampler's two-syllable words: tone pairs.
        pairs: wordsForList(guest, null, "intermediate").filter((w) => w.syllables === 2),
      },
      seed: playableSeed(all, seedId),
    };
  }, [seedId]);
  /** The seed flies in the first round only; "One more round" uses the pool. */
  const seedUsedRef = useRef(false);
  /** Drill/Pairs: the tone or combo picked on the game's picker (null combo = Shuffle). */
  const [pick, setPick] = useState<{ drillTone: Tone } | { pairCombo: Tone[] | null } | null>(null);
  const pickKey = !pick ? null : "drillTone" in pick ? String(pick.drillTone) : pick.pairCombo ? toneComboKey(pick.pairCombo) : "shuffle";
  /** Added to the overlay's summary and CTA events. */
  const where = { surface: "overlay" as const, page: page ?? null, seeded: seed?.id ?? null, mode, target: pickKey };

  useEffect(
    () => () => {
      attemptRef.current++;
      stopRef.current?.();
      // Closing the overlay mid-run leaves the run, like "Exit demo".
      const left = stepRef.current;
      if (left === "playing" || left === "preparing") trackTry("exited", { stage: left });
    },
    [],
  );

  /** "One more round" and "Try again": back to the voice choice. */
  const open = async () => {
    trackTry("opened");
    setStep({ kind: "loading" });
    await load();
  };

  /** Loads the mic chunk, then offers the voice choice. */
  const load = async () => {
    try {
      const mini = await loadMini();
      // Drill and Pairs start on the game's own picker; a retry keeps the pick.
      const kind = mode !== "game" && !pick ? "pick" : "choose";
      setStep({ kind, mini, calibrated: mini.hasSavedCalibration() });
    } catch {
      trackTry("error");
      setStep({ kind: "error", message: "Couldn't load the game. Check your connection and try again." });
    }
  };

  // The overlay opens on the CTA's tap: load the mic chunk and show the voice choice.
  useEffect(() => {
    trackTry("opened");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roundWords = (level: Level): Word[] => {
    if (level !== "single" || !seed || seedUsedRef.current) return draw(pools[level], level);
    seedUsedRef.current = true;
    played.add(seed.id);
    return seededRound(seed, draw(pools.single.filter((w) => w.id !== seed.id), "single"), GATES);
  };

  /** The pool and run mode for a Drill/Pairs round, from the pick. */
  const modeRun = (): { words: Word[]; run: MiniGameRun; level: Level } | null => {
    if (mode === "game" || !pick) return null;
    if ("drillTone" in pick) {
      const t = pick.drillTone;
      return { words: pools.single.filter((w) => w.tone === t), run: { mode: "drill", drillTone: t }, level: "single" };
    }
    const combo = pick.pairCombo;
    const key = combo && toneComboKey(combo);
    return {
      words: key ? pools.pairs.filter((w) => toneComboKey(w.tones) === key) : pools.pairs,
      run: { mode: "pairs", pairCombo: combo },
      level: "pairs",
    };
  };

  const start = (mini: MiniModule, voice: "lower" | "higher") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const picked = modeRun();
    const level = picked?.level ?? "single";
    setRunMode(picked?.run.mode ?? "game");
    lastRef.current = { mini, voice };
    // Starting here is the in-app notice's "continue here" (brief 27).
    continueInApp();
    setStep({ kind: "preparing" });
    trackTry("started", { voice: mini.hasSavedCalibration() ? "saved" : voice });
    const attempt = ++attemptRef.current;
    const current = () => attempt === attemptRef.current;
    let poll = 0;
    mini
      .startMiniGame({
        canvas,
        width: W,
        height: H,
        words: picked ? picked.words : roundWords(level),
        run: picked?.run,
        voice,
        gates: GATES,
        onGate: (f, snap) => {
          if (!current()) return;
          // The numbers sync on the same beat as the reaction, as in the game.
          setHud(snap);
          setFlash(f);
        },
        onReady: () => {
          if (!current()) return;
          trackTry("ready");
          setStep({ kind: "playing" });
        },
        onEnd: (r) => {
          window.clearInterval(poll);
          setHud(null);
          setFlash(null);
          stopRef.current = null;
          trackTry("finished");
          const acc = Object.fromEntries(toneBreakdown(r.stats).map((b) => [b.tone, b.pct === null ? null : Math.round(b.pct)]));
          const t = r.perTone;
          captureGameEvent({
            type: "tool_summary",
            tool: "try-now",
            level,
            cleared: r.cleared,
            total: r.total,
            unheard: r.unheard,
            t1Gates: t[1].gates,
            t1Cleared: t[1].cleared,
            t1Acc: acc[1] ?? null,
            t2Gates: t[2].gates,
            t2Cleared: t[2].cleared,
            t2Acc: acc[2] ?? null,
            t3Gates: t[3].gates,
            t3Cleared: t[3].cleared,
            t3Acc: acc[3] ?? null,
            t4Gates: t[4].gates,
            t4Cleared: t[4].cleared,
            t4Acc: acc[4] ?? null,
            ...where,
          });
          setConfettiDone(false);
          setStep({ kind: "done", stats: r.stats, quote: nextQuoteIndex() });
        },
      })
      .then((game) => {
        if (!current()) {
          game.stop();
          return;
        }
        stopRef.current = () => {
          window.clearInterval(poll);
          game.stop();
        };
        poll = window.setInterval(() => setHud(game.snapshot()), 100);
      })
      .catch((err: unknown) => {
        window.clearInterval(poll);
        if (!current()) return;
        const kind = mini.micErrorKind(err);
        trackTry(kind === "permission-denied" ? "mic_denied" : "error");
        setStep({ kind: "error", message: mini.micErrorCopy(kind), micKind: kind });
      });
  };

  /** Leave the run at any point: mic off, the overlay closes. */
  const exit = () => {
    attemptRef.current++;
    stopRef.current?.();
    stopRef.current = null;
    setHud(null);
    trackTry("exited", { stage: step.kind === "playing" ? "playing" : "preparing" });
    stepRef.current = "loading"; // tracked just above; the unmount must not track it again
    onClose?.();
  };

  const live = step.kind === "playing";

  return (
    <figure className="sky-screen sky-try sky-try-overlay">
      <div className="sky-try-stage">
        {/* The canvas exists from the first tap so `start` can draw at once. */}
        <div className="stage game-stage sky-try-game" hidden={!live}>
          <canvas
            ref={canvasRef}
            className="sky-try-canvas"
            role="img"
            aria-label="The game: listen to the word, then say it to fly the bird through its corridor."
          />
          {live && (
            <GameHud
              hud={hud}
              flash={flash}
              mode={runMode}
              scored
              showTranslation={false}
              showPinyin
              showToneMarks
              showPause={false}
              onPause={() => {}}
            />
          )}
          {live && (
            <div className="sky-try-progress" role="status" aria-label={`Word ${Math.min(GATES, (hud?.gateLog.length ?? 0) + 1)} of ${GATES}`}>
              <span className="sky-try-progress-bar" aria-hidden="true">
                <span style={{ width: `${((hud?.gateLog.length ?? 0) / GATES) * 100}%` }} />
              </span>
              <span className="sky-try-progress-count">
                {hud?.gateLog.length ?? 0} / {GATES}
              </span>
            </div>
          )}
        </div>
        {!live && step.kind !== "done" && step.kind !== "pick" && <DemoLoop width={340} />}

        {step.kind === "loading" && <p className="sky-try-panel" role="status">Loading the game…</p>}
        {step.kind === "preparing" && (
          <p className="sky-try-panel" role="status">
            Loading the words…
            <span className="sky-small">Turn your sound on: you hear each word before you say it.</span>
          </p>
        )}
        {step.kind === "pick" && (
          // The game's Modes screen (ModeSelect), in the game's own frame.
          <div className="stage game-stage playhome-stage sky-try-game sky-try-pick">
            <div className="playhome-canvas">
              <div className="screen playhome-overlay">
                <h1>Modes</h1>
                {mode === "drill" ? (
                  <DrillTonePicker
                    tones={availableTones(pools.single)}
                    count={(t) => pools.single.filter((w) => w.tone === t).length}
                    onPick={(t) => {
                      setPick({ drillTone: t });
                      setStep({ kind: "choose", mini: step.mini, calibrated: step.calibrated });
                    }}
                  />
                ) : (
                  <PairComboPicker
                    combos={availableToneCombos(pools.pairs)}
                    count={(c) => pools.pairs.filter((w) => toneComboKey(w.tones) === toneComboKey(c)).length}
                    onPick={(c) => {
                      setPick({ pairCombo: c });
                      setStep({ kind: "choose", mini: step.mini, calibrated: step.calibrated });
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
        {step.kind === "choose" && (
          <div className="sky-try-panel">
            <InAppMicNotice surface="demo" />
            <p>
              {step.calibrated
                ? "Listen to each word, then say it to fly through its tunnel."
                : "Pick your voice so the bird fits your range. Then listen to each word and say it back."}
            </p>
            {step.calibrated ? (
              <button className="sky-btn" onClick={() => start(step.mini, "lower")}>
                Start
              </button>
            ) : (
              <div className="sky-try-voices">
                <button className="sky-btn" onClick={() => start(step.mini, "lower")}>
                  Lower voice
                </button>
                <button className="sky-btn" onClick={() => start(step.mini, "higher")}>
                  Higher voice
                </button>
              </div>
            )}
            <MicAllowNote className="sky-small" />
            <p className="sky-small">{brand.requirement}</p>
          </div>
        )}
        {step.kind === "done" && (
          <div className="sky-try-over">
            {!confettiDone && <Confetti onDone={() => setConfettiDone(true)} />}
            <DemoGameOver
              stats={step.stats}
              quote={step.quote}
              onSignup={() => {
                captureGameEvent({ type: "tool_cta_click", tool: "try-now", placement: "demo_gameover_signup", ...where });
                window.location.assign(appHref(undefined, page));
              }}
              onRetry={() => {
                captureGameEvent({ type: "tool_cta_click", tool: "try-now", placement: "demo_gameover_retry", ...where });
                void open();
              }}
            />
          </div>
        )}
        {step.kind === "error" && step.micKind === "permission-denied" && (
          <div className="sky-try-panel">
            <MicHelpPanel
              surface="demo"
              reason="permission-denied"
              onTryAgain={() => {
                const last = lastRef.current;
                // Asks again inside this tap (hard rule 4).
                if (last) start(last.mini, last.voice);
                else void open();
              }}
            />
          </div>
        )}
        {step.kind === "error" && step.micKind !== "permission-denied" && (
          <div className="sky-try-panel" role="alert">
            <p>{step.message}</p>
            <button className="sky-btn sky-btn-ghost" onClick={open}>
              Try again
            </button>
          </div>
        )}
      </div>
      <figcaption>
        {(live || step.kind === "preparing") && (
          <button className="sky-btn sky-btn-ghost sky-btn-small" onClick={exit}>
            Exit demo
          </button>
        )}
      </figcaption>
    </figure>
  );
}
