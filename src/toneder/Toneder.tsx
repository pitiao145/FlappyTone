/**
 * TONEder, the swipe-the-tone listening game: one component for the public
 * page (`/tools/tone-test`) and the app's TONEder tab, so a UI change happens
 * in one place. The pure parts (words, rounds, scoring, swipe maths) live in
 * `toneTest.ts`. No mic, no `src/audio/`: clips play through the site's
 * `wordAudio.ts`, a lazy chunk.
 *
 * The host decides the word pool, the swipe budget and what the end screen
 * offers next; this component never writes stats, XP or the DB.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import { TONE_LINE_COLOR } from "../ui/toneColors.ts";
import { ContourSpark } from "../ui/ContourSpark.tsx";
import { absoluteUrl } from "../site/routes.ts";
import { Pip } from "../site/Pip.tsx";
import { toZhuyin } from "../site/zhuyin.ts";
import { toneName } from "../site/toneNames.ts";
import { PROFILES } from "./profiles.ts";
import {
  buildRound,
  loadLastRound,
  saveLastRound,
  CORNER,
  keyTone,
  moveRing,
  releaseTone,
  cornerFor,
  scoreRound,
  shareLine,
  takeSpare,
  TEST_WORDS,
  TONES,
  type Answer,
  type RoundResult,
  type TestStyle,
  type TestWord,
  type Tone,
  type ToneTestReporter,
} from "./toneTest.ts";

type AudioModule = typeof import("../site/wordAudio.ts");

/** The clip player: a small lazy chunk, loaded after mount (no network until a clip is asked for). */
let audioPromise: Promise<AudioModule> | null = null;
let audioLoaded: AudioModule | null = null;
function loadAudio(): Promise<AudioModule> {
  audioPromise ??= import("../site/wordAudio.ts").then((m) => {
    audioLoaded = m;
    return m;
  });
  audioPromise.catch(() => {
    audioPromise = null;
  });
  return audioPromise;
}

const NAME: Record<Tone, string> = { 1: "high, level", 2: "rising", 3: "low, dipping", 4: "falling" };
/** How long the card takes to fly into its corner before the reveal (ms). */
const FLY_MS = 280;
/** How long the MATCH / NOPE stamp shows on the card before it flies (ms). */
const STAMP_MS = 420;
/** Tries per card slot before the round gives up on audio. */
const MAX_FAILS = 3;

type Phase = "intro" | "loading" | "card" | "flying" | "answered" | "done" | "error" | "cap";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface Round {
  cards: TestWord[];
  spares: TestWord[];
  index: number;
  answers: Answer[];
}

/** The listening game: a card in the middle, a tone in each corner. */
export interface TonederProps {
  /** The pool rounds are drawn from (default: the public page's 40). */
  words?: readonly TestWord[];
  /** The pool for Spoken rounds, when not every word has a natural take (default: `words`). */
  spokenWords?: readonly TestWord[];
  /** The public page's analytics; the app reports through `onSwipe`/`onRoundDone`. */
  reporter?: ToneTestReporter;
  /** The page "Share my score" links to. */
  sharePath: string;
  /** Swipes left today. At 0 the next card shows `capScreen`. Default: no cap. */
  swipesLeft?: number;
  /** After each answer (one swipe spent). */
  onSwipe?: (a: Answer, style: TestStyle) => void;
  /** After the last card of a round. */
  onRoundDone?: (result: RoundResult, style: TestStyle) => void;
  /** Shown in place of a card once `swipesLeft` is 0. */
  capScreen?: ReactNode;
  /** Spoken is locked (shown, not selectable); a tap on it calls `onSpokenLocked`. */
  spokenLocked?: boolean;
  onSpokenLocked?: () => void;
  /** What the end screen offers next, under the score (the CTA slot). */
  doneCta?: (result: RoundResult, answers: readonly Answer[]) => ReactNode;
}

const NO_REPORTER: ToneTestReporter = {
  started() {},
  answered() {},
  roundDone() {},
  style() {},
  summary() {},
};

/** The listening game: a card in the middle, a tone in each corner. */
export function Toneder({
  words = TEST_WORDS,
  spokenWords,
  reporter = NO_REPORTER,
  sharePath,
  swipesLeft = Infinity,
  onSwipe,
  onRoundDone,
  capScreen,
  spokenLocked = false,
  onSpokenLocked,
  doneCta,
}: TonederProps) {
  const [style, setStyle] = useState<TestStyle>("standard");
  const [phase, setPhase] = useState<Phase>("intro");
  const [round, setRound] = useState<Round | null>(null);
  const [hot, setHot] = useState<Tone | null>(null);
  const [stamp, setStamp] = useState<"match" | "nope" | null>(null);
  const [ring, setRing] = useState<Tone | null>(null);
  const [last, setLast] = useState<Answer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [shared, setShared] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const roundRef = useRef<Round | null>(null);
  const styleRef = useRef(style);
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    lx: number;
    ly: number;
    lt: number;
    v: number;
  } | null>(null);

  useEffect(() => {
    void loadAudio();
  }, []);

  const card = round ? round.cards[round.index] : null;

  /**
   * Plays the current card's clip. A clip that fails is swapped for a spare
   * word (same tone) and tried again; the player never sees a broken card.
   */
  const playCurrent = useCallback(async (): Promise<void> => {
    const mod = audioLoaded ?? (await loadAudio().catch(() => null));
    if (!mod) return;
    for (let fails = 0; fails < MAX_FAILS; fails++) {
      const r = roundRef.current;
      if (!r) return;
      const w = r.cards[r.index];
      const clipStyle = styleRef.current === "spoken" ? "natural" : "textbook";
      setPlaying(true);
      const ok = await mod.playWord(w.id, clipStyle);
      setPlaying(false);
      if (roundRef.current !== r) return;
      if (ok) {
        // Only now fetch the next card's clip: one request at a time.
        const next = r.cards[r.index + 1];
        if (next) void mod.clipUrl(next.id, clipStyle);
        return;
      }
      const spare = takeSpare(r.spares, w.tone);
      if (!spare) break;
      const cards = r.cards.slice();
      cards[r.index] = spare;
      const nr = { ...r, cards };
      roundRef.current = nr;
      setRound(nr);
    }
    setPhase("error");
  }, []);

  const resetCard = () => {
    const el = cardRef.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
      el.style.opacity = "";
    }
    setHot(null);
    setStamp(null);
  };

  /** Inside the tap: unlock audio first (iOS), then the round. */
  const start = () => {
    audioLoaded?.unlockAudio();
    if (swipesLeft <= 0) {
      setPhase("cap");
      return;
    }
    reporter.style(styleRef.current);
    reporter.started();
    const { cards, spares } = buildRound(
      Math.random,
      styleRef.current === "spoken" ? (spokenWords ?? words) : words,
      loadLastRound(),
    );
    saveLastRound(cards.map((w) => w.id));
    const r: Round = { cards, spares, index: 0, answers: [] };
    roundRef.current = r;
    setRound(r);
    setLast(null);
    setShared(false);
    setRing(null);
    resetCard();
    setPhase("card");
    void playCurrent();
  };

  const answer = (picked: Tone) => {
    const r = roundRef.current;
    if (!r || phase !== "card") return;
    const w = r.cards[r.index];
    const a: Answer = { tone: w.tone, picked };
    reporter.answered(a);
    onSwipe?.(a, styleRef.current);
    audioLoaded?.stopWord();
    const nr = { ...r, answers: [...r.answers, a] };
    roundRef.current = nr;
    setRound(nr);
    setLast(a);
    setHot(picked);
    setStamp(picked === w.tone ? "match" : "nope");
    setPhase("flying");
    const el = cardRef.current;
    const stage = stageRef.current;
    const reduced = prefersReducedMotion();
    // The stamp lands on the card first, then the card flies to its corner.
    window.setTimeout(() => {
      if (el && stage && !reduced) {
        const s = stage.getBoundingClientRect();
        const c = CORNER[picked];
        el.style.transition = `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms ease-in`;
        el.style.transform = `translate(${c.x * s.width * 0.45}px, ${c.y * s.height * 0.45}px) rotate(${c.x * 22}deg) scale(0.45)`;
        el.style.opacity = "0";
        window.setTimeout(() => setPhase("answered"), FLY_MS);
      } else {
        setPhase("answered");
      }
    }, STAMP_MS);
  };

  const next = () => {
    const r = roundRef.current;
    if (!r) return;
    resetCard();
    setRing(null);
    if (r.index + 1 >= r.cards.length) {
      reporter.roundDone();
      onRoundDone?.(scoreRound(r.answers), styleRef.current);
      setPhase("done");
      return;
    }
    if (swipesLeft <= 0) {
      setPhase("cap");
      return;
    }
    const nr = { ...r, index: r.index + 1 };
    roundRef.current = nr;
    setRound(nr);
    setLast(null);
    setPhase("card");
    void playCurrent();
  };

  const hearAgain = () => {
    const r = roundRef.current;
    if (!r || !audioLoaded) return;
    const w = r.cards[r.index];
    void audioLoaded.playWord(w.id, styleRef.current === "spoken" ? "natural" : "textbook");
  };

  // Keyboard: 1–4 answer, arrows move a ring, Enter answers it / goes on,
  // Space or R replays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (phase === "card") {
        const t = keyTone(e.key);
        if (t) {
          e.preventDefault();
          answer(t);
        } else if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          setRing((r) => moveRing(r, e.key));
        } else if (e.key === "Enter" && ring) {
          e.preventDefault();
          answer(ring);
        } else if (e.key === " " || e.key === "r") {
          if (target?.tagName === "BUTTON" && e.key === " ") return;
          e.preventDefault();
          void playCurrent();
        }
      } else if (phase === "answered") {
        if (e.key === "Enter" || e.key === "ArrowRight") {
          if (target?.tagName === "BUTTON" || target?.tagName === "A") return;
          e.preventDefault();
          next();
        } else if (e.key === "r") {
          e.preventDefault();
          hearAgain();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (phase !== "card" || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      lt: e.timeStamp,
      v: 0,
    };
    if (cardRef.current) cardRef.current.style.transition = "none";
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dt = Math.max(1, e.timeStamp - d.lt);
    d.v = Math.hypot(e.clientX - d.lx, e.clientY - d.ly) / dt;
    d.lx = e.clientX;
    d.ly = e.clientY;
    d.lt = e.timeStamp;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (cardRef.current) {
      cardRef.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
    }
    const t = cornerFor(dx, dy);
    setHot((h) => (h === t ? h : t));
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    // A pause before letting go is not a flick.
    const v = e.timeStamp - d.lt > 80 ? 0 : d.v;
    const s = stageRef.current?.getBoundingClientRect();
    const reach = s ? Math.hypot(s.width / 2, s.height / 2) : 300;
    const t = releaseTone(dx, dy, reach, v);
    if (t) {
      answer(t);
      return;
    }
    const el = cardRef.current;
    if (el) {
      el.style.transition = "transform 180ms ease-out";
      el.style.transform = "";
    }
    setHot(null);
  };

  const result = round && phase === "done" ? scoreRound(round.answers) : null;

  const share = async () => {
    if (!result) return;
    const text = shareLine(result.correct, result.total, style);
    const url = absoluteUrl(sharePath);
    try {
      if (navigator.share) await navigator.share({ text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
    } catch {
      // Cancelled or not allowed: nothing to do.
    }
  };

  // Icon pills like a dating app's top switch: a book for the slow textbook
  // recordings, a speech bubble for everyday speech. The label under it
  // names the one chosen.
  const styleToggle = (
    <div className="tt-style-wrap">
      <div className="tt-style" role="radiogroup" aria-label="Recordings">
        {(["standard", "spoken"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={style === s}
            aria-label={
              s === "standard"
                ? "Standard: slow, clear recordings"
                : `Spoken: everyday speed${spokenLocked && s === "spoken" ? " (Pro)" : ""}`
            }
            title={s === "standard" ? "Standard (slow)" : `Spoken (everyday speed)${spokenLocked ? ", Pro" : ""}`}
            className={spokenLocked && s === "spoken" ? "tt-style-locked" : undefined}
            disabled={phase === "card" || phase === "flying" || phase === "answered"}
            onClick={() => {
              if (spokenLocked && s === "spoken") {
                onSpokenLocked?.();
                return;
              }
              styleRef.current = s;
              setStyle(s);
            }}
          >
            {s === "standard" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.6 0 1.1.3 1.5.6z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm4 5.5a1.5 1.5 0 1 0 0 .01zm4 0a1.5 1.5 0 1 0 0 .01zm4 0a1.5 1.5 0 1 0 0 .01z" />
              </svg>
            )}
          </button>
        ))}
      </div>
      <span className="tt-style-label">
        {style === "standard" ? "Standard · slow and clear" : "Spoken · everyday speed"}
      </span>
    </div>
  );

  const showCorners = phase === "card" || phase === "flying" || phase === "intro";

  return (
    <div className="tt-tool" role="group" aria-label="TONEder, a Chinese tones listening test">
      <div className="tt-bar">
        <span className="tt-logo" aria-hidden="true">
          <svg viewBox="0 0 100 100" className="tt-logo-bird">
            <circle cx="44" cy="52" r="36" fill="#338773" />
            <circle cx="54" cy="34" r="7" fill="#f3efe2" />
            <circle cx="56" cy="34" r="3.4" fill="#241d15" />
            <path d="M78 46 L98 52 L78 58 z" fill="#c98a3c" />
            <path
              d="M42 46c2 8 12 12 12 24a12 12 0 0 1-24 0c0-6 4-10 6-14 2 4 2 6 6 8 0-8-2-12 0-18z"
              fill="url(#tt-flame)"
            />
            <defs>
              <linearGradient id="tt-flame" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#ff655b" />
                <stop offset="1" stopColor="#fd297b" />
              </linearGradient>
            </defs>
          </svg>
          <span>
            <b>TONE</b>der
          </span>
        </span>
        {styleToggle}
      </div>
      <div className="tt-stage" ref={stageRef}>
        {showCorners &&
          TONES.map((t) => {
            const c = CORNER[t];
            const cls = [
              "tt-corner",
              c.y < 0 ? "tt-top" : "tt-bottom",
              c.x < 0 ? "tt-left" : "tt-right",
              hot === t ? "tt-hot" : "",
              ring === t ? "tt-ring" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={t}
                type="button"
                className={cls}
                style={{ color: TONE_LINE_COLOR[t] }}
                disabled={phase !== "card"}
                onClick={() => answer(t)}
                aria-label={`${toneName(t, true)}, ${NAME[t]} (key ${t})`}
              >
                <span className="tt-corner-shape" aria-hidden="true">
                  <ContourSpark tone={t} width={200} height={90} />
                </span>
                <span className="tt-corner-num">{toneName(t, true)}</span>
                <span className="tt-corner-name">{NAME[t]}</span>
              </button>
            );
          })}

        {(phase === "intro" || phase === "loading") && (
          <div className="tt-card tt-card-intro">
            <Pip size={72} tilt={-8} />
            <p className="tt-card-title">Ten words want to meet you.</p>
            <p className="tt-note">Listen to each one and swipe it to the tone it matches.</p>
            <button type="button" className="sticker-button tt-start" onClick={start}>
              Start the test
            </button>
            <p className="tt-note">
              10 words · sound on · no microphone
              {Number.isFinite(swipesLeft) && ` · ${Math.max(0, swipesLeft)} swipes left today`}
            </p>
          </div>
        )}

        {(phase === "card" || phase === "flying") && card && round && (
          <div
            ref={cardRef}
            className="tt-card tt-card-word"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {stamp && (
              <span className={`tt-stamp tt-stamp-${stamp}`} aria-hidden="true">
                {stamp === "match" ? "MATCH" : "NOPE"}
              </span>
            )}
            <div className="tt-photo">
              <div className="tt-dots" aria-hidden="true">
                {round.cards.map((_, i) => (
                  <span key={i} className={i === round.index ? "tt-dot-on" : undefined} />
                ))}
              </div>
              <Pip size={110} tilt={-6} className={playing ? "tt-pip-sing" : undefined} />
              <div className="tt-profile">
                {/* The "name" is the word itself, blurred until the reveal. */}
                <p className="tt-name" aria-hidden="true">
                  <span lang="zh-Hant-TW">{card.hanzi}</span>, {card.pinyin}
                </p>
                <p className="tt-bio">
                  {round.index + 1} of {round.cards.length} · Which tone am I?
                </p>
              </div>
            </div>
            <div className="tt-actions">
              <span className="tt-note">Swipe me to my tone</span>
              <button
                type="button"
                className="tt-play"
                onClick={() => void playCurrent()}
                aria-label="Play the word again"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 6.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 9 6.5z" />
                </svg>
              </button>
              <span className="tt-note tt-note-right">Tap to hear again</span>
            </div>
          </div>
        )}

        {phase === "answered" && card && last && (
          <Reveal word={card} answer={last} onNext={next} onHear={hearAgain} last={round!.index + 1 >= round!.cards.length} />
        )}

        {phase === "cap" && capScreen}

        {phase === "error" && (
          <div className="tt-card">
            <p className="tt-card-title">Couldn't load the audio.</p>
            <p className="tt-note">Check your connection, then try again.</p>
            <button type="button" className="sticker-button tt-start" onClick={start}>
              Try again
            </button>
          </div>
        )}

        {phase === "done" && result && (
          <div className="tt-card tt-done">
            <p className="tt-score">
              {result.correct}
              <span>/{result.total}</span>
            </p>
            <p className="tt-card-title">
              {result.correct === result.total
                ? "Perfect ear!"
                : result.correct >= 8
                  ? "Great ear."
                  : result.correct >= 5
                    ? "Getting there."
                    : "Your ear is warming up."}
            </p>
            <ul className="tt-per-tone">
              {TONES.map((t) => (
                <li key={t} style={{ color: TONE_LINE_COLOR[t] }}>
                  <b>{toneName(t, true)}</b> {result.perTone[t].correct}/{result.perTone[t].cards}
                </li>
              ))}
            </ul>
            {result.mixUp && (
              <p className="tt-mixup">
                You mix up the <b style={{ color: TONE_LINE_COLOR[result.mixUp[0]] }}>{toneName(result.mixUp[0])}</b>{" "}
                and the <b style={{ color: TONE_LINE_COLOR[result.mixUp[1]] }}>{toneName(result.mixUp[1])}</b>.
              </p>
            )}
            <div className="tt-done-actions">
              <button type="button" className="sticker-button" onClick={start}>
                Play again
              </button>
              <button type="button" className="tc-button" onClick={() => void share()}>
                {shared ? "Shared!" : "Share my score"}
              </button>
            </div>
            {round && doneCta?.(result, round.answers)}
          </div>
        )}
      </div>
      <p className="tt-keys">
        Keyboard: <kbd>1</kbd>–<kbd>4</kbd> answer, arrows + <kbd>Enter</kbd> pick a corner,{" "}
        <kbd>R</kbd> replay, <kbd>Enter</kbd> next.
      </p>
    </div>
  );
}

function Reveal({
  word,
  answer,
  onNext,
  onHear,
  last,
}: {
  word: TestWord;
  answer: Answer;
  onNext: () => void;
  onHear: () => void;
  last: boolean;
}) {
  const match = answer.picked === answer.tone;
  const color = TONE_LINE_COLOR[word.tone];
  const profile = PROFILES[word.id];
  return (
    <div className={match ? "tt-reveal tt-match" : "tt-reveal tt-nomatch"} role="status">
      {match ? (
        <div className="tt-match-head">
          <div className="tt-burst" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} style={{ "--i": i, background: TONE_LINE_COLOR[TONES[i % 4]] } as CSSProperties} />
            ))}
          </div>
          <p className="tt-match-title">It's a match!</p>
          <p className="tt-match-sub">
            You heard the <b style={{ color }}>{toneName(word.tone)}</b>. Your ear and {word.hanzi} like each other.
          </p>
        </div>
      ) : (
        <div className="tt-miss-head">
          <span className="tt-miss-x" aria-hidden="true">✕</span>
          <p className="tt-miss-title">No match this time</p>
          <p className="tt-match-sub">
            That was the <b style={{ color }}>{toneName(word.tone)}</b>. You swiped the {toneName(answer.picked)}.
          </p>
        </div>
      )}
      <div className="tt-profile-card">
        <div className="tt-photo tt-photo-full">
          <span className="tt-photo-tone" aria-hidden="true">
            <ContourSpark tone={word.tone} width={240} height={110} />
          </span>
          <Pip size={104} tilt={match ? -14 : 0} className={match ? "tt-pip-hop" : undefined} />
          {profile && (
            <span className="tt-prop" aria-hidden="true">
              {profile.prop}
            </span>
          )}
          <div className="tt-profile">
            <p className="tt-name-shown">
              <span lang="zh-Hant-TW">{word.hanzi}</span>
            </p>
            <p className="tt-bio">{word.pinyin} · <span lang="zh-Hant-TW">{toZhuyin(word.pinyin)}</span></p>
          </div>
        </div>
        <div className="tt-profile-body">
          <ul className="tt-facts">
            <li>
              <span aria-hidden="true">📖</span> Means “{word.english}”
            </li>
            <li style={{ color }}>
              <ContourSpark tone={word.tone} width={40} height={18} /> {toneName(word.tone, true)}, {NAME[word.tone]}
            </li>
          </ul>
          {profile && (
            <section className="tt-about">
              <h3>About me</h3>
              <p>{profile.bio}</p>
            </section>
          )}
          <div className="tt-reveal-actions">
            <button type="button" className="tc-button" onClick={onHear}>
              Hear it again
            </button>
            <button type="button" className="tt-next" onClick={onNext} autoFocus>
              {last ? "See my score" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
