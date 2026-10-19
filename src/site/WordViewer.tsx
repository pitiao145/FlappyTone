import { useEffect, useRef, useState } from "react";
import { corridorChaoAt } from "../game/gates.ts";
import { TONE_LINE_COLOR } from "../ui/toneColors.ts";
import { EXAMPLE_CLIPS } from "./exampleClips.ts";
import { Pip } from "./Pip.tsx";
import { clipUrl } from "./wordAudio.ts";

const W = 360;
const H = 200;
const PAD_X = 28;
const PAD_Y = 18;
const STEPS = 80;

const x = (t: number) => PAD_X + t * (W - 2 * PAD_X);
const y = (chao: number) => PAD_Y + ((5 - chao) / 4) * (H - 2 * PAD_Y);

export interface ViewerWord {
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  tone: 0 | 1 | 2 | 3 | 4;
}

/**
 * "See it": a read-only replay of one example word. Plays the recording and
 * flies Pip along the same measured contour the game's tunnel is built from,
 * timed to the clip (it holds through the lead-in, then traces the tone
 * window). The frame loop writes SVG attributes through refs — no React state
 * per frame (CLAUDE.md hard rule 1). Loaded lazily on the tap that opens it.
 */
export function WordViewer({
  word,
  onClose,
}: {
  word: ViewerWord;
  onClose: () => void;
}) {
  const clip = EXAMPLE_CLIPS[word.id];
  const dialog = useRef<HTMLDialogElement>(null);
  const trail = useRef<SVGPolylineElement>(null);
  const bird = useRef<SVGGElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const [failed, setFailed] = useState(false);
  const [run, setRun] = useState(0);

  const points = Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    return [x(t), y(corridorChaoAt(clip, t))] as const;
  });
  const color = TONE_LINE_COLOR[word.tone];

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const place = (t: number) => {
      const n = Math.round(Math.min(1, Math.max(0, t)) * STEPS);
      trail.current?.setAttribute(
        "points",
        points
          .slice(0, n + 1)
          .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
          .join(" "),
      );
      const [px, py] = points[n];
      bird.current?.setAttribute(
        "transform",
        `translate(${px - 18} ${py - 18})`,
      );
    };
    place(0);
    void clipUrl(word.id).then((url) => {
      if (cancelled) return;
      if (!url) {
        setFailed(true);
        return;
      }
      const a = new Audio(url);
      audio.current = a;
      const frame = () => {
        place((a.currentTime - clip.onsetS) / clip.durationS);
        if (!a.ended && !a.paused) raf.current = requestAnimationFrame(frame);
        else
          place(a.ended ? 1 : (a.currentTime - clip.onsetS) / clip.durationS);
      };
      a.play()
        .then(() => {
          raf.current = requestAnimationFrame(frame);
        })
        .catch(() => setFailed(true));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      audio.current?.pause();
    };
    // `run` replays; the word does not change while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return (
    <dialog
      ref={dialog}
      className="word-viewer"
      aria-label={`${word.hanzi} ${word.pinyin}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="word-viewer-head">
        <span className="hanzi" lang="zh-Hant-TW">
          {word.hanzi}
        </span>
        <span className="pinyin" style={{ color }}>
          {word.pinyin}
        </span>
        <span className="english">{word.english}</span>
      </div>
      <svg
        className="word-viewer-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Pitch contour of ${word.pinyin}`}
      >
        {[1, 2, 3, 4, 5].map((c) => (
          <g key={c}>
            <line
              className="grid"
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y(c)}
              y2={y(c)}
            />
            <text className="axis" x={PAD_X - 10} y={y(c) + 4} textAnchor="end">
              {c}
            </text>
          </g>
        ))}
        <polyline
          className="ghost"
          points={points
            .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
            .join(" ")}
        />
        <polyline ref={trail} className="trail" style={{ stroke: color }} />
        <g ref={bird}>
          <Pip size={36} />
        </g>
      </svg>
      <p className="word-viewer-note">
        {failed
          ? "The recording didn't load. The line is still the shape she said."
          : "Pip flies the pitch of the recording. In the game, your own voice flies it."}
      </p>
      <div className="word-viewer-actions">
        <button
          type="button"
          className="site-play"
          onClick={() => setRun((r) => r + 1)}
        >
          Play again
        </button>
        <button
          type="button"
          className="site-play"
          onClick={() => dialog.current?.close()}
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
