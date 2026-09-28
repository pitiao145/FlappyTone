import { useEffect, useMemo, useRef, useState } from "react";
import { fetchShapes } from "../data/shapes.ts";
import type { Tone } from "../game/gates.ts";
import {
  averageUpTo,
  keysWithData,
  localDay,
  MIN_ATTEMPTS_TO_SHOW,
  monthsAgo,
  type ShapeRow,
} from "../game/playerShape.ts";
import { AVERAGED_PAIR_SHAPE, AVERAGED_TONE_SHAPE } from "../game/toneAverages.ts";
import { drawPlayerShapeChart, TONE_AVERAGE_COLOR } from "./toneAverageChart.ts";

const CARD_W = 200;
const CARD_H = 120;
/** A combo has no single tone to key a color off. */
const COMBO_TINT = "hsla(210, 35%, 38%,";

type Compare = "none" | "1m" | "2m" | "date";

/**
 * Progress → "See how your tones evolve over time", for Pro (spec B). Per
 * tone and per combo the player has data for: Jane's average, the player's
 * average up to today, and optionally the average up to an earlier day,
 * fainter. Rows come from `player_tone_shapes` (owner-only read); the maths
 * is `playerShape.ts`'s.
 */
export function PlayerToneEvolution() {
  const [rows, setRows] = useState<ShapeRow[] | null>(null);
  const [compare, setCompare] = useState<Compare>("1m");
  const [date, setDate] = useState(() => monthsAgo(1));

  useEffect(() => {
    let alive = true;
    void fetchShapes().then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, []);

  const today = localDay();
  const thenDay =
    compare === "1m" ? monthsAgo(1) : compare === "2m" ? monthsAgo(2) : compare === "date" ? date : null;

  const charts = useMemo(() => {
    if (!rows) return [];
    return keysWithData(rows)
      .map((key) => {
        const now = averageUpTo(rows, key, today);
        const then = thenDay ? averageUpTo(rows, key, thenDay) : null;
        return { key, now, then };
      })
      .filter((c) => c.now && c.now.count >= MIN_ATTEMPTS_TO_SHOW);
  }, [rows, today, thenDay]);

  if (rows === null) return <p className="note">Loading your tone shapes…</p>;

  if (charts.length === 0) {
    return (
      <p className="note player-shape-empty">
        Play a few runs to see your own shape. Each tone appears here after {MIN_ATTEMPTS_TO_SHOW} heard
        attempts.
      </p>
    );
  }

  return (
    <>
      <div className="player-shape-controls">
        <label>
          Compare with{" "}
          <select value={compare} onChange={(e) => setCompare(e.target.value as Compare)}>
            <option value="none">nothing</option>
            <option value="1m">1 month ago</option>
            <option value="2m">2 months ago</option>
            <option value="date">a date…</option>
          </select>
        </label>
        {compare === "date" && (
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        )}
      </div>
      <p className="note player-shape-legend">
        <span className="player-shape-key player-shape-key-jane" /> Jane&apos;s average ·{" "}
        <span className="player-shape-key player-shape-key-now" /> yours now
        {thenDay && (
          <>
            {" "}
            · <span className="player-shape-key player-shape-key-then" /> yours up to {thenDay}
          </>
        )}
      </p>
      <div className="tone-average-grid">
        {charts.map(({ key, now, then }) => (
          <ShapeCard
            key={key}
            shapeKey={key}
            now={now!}
            then={then && then.count >= MIN_ATTEMPTS_TO_SHOW ? then : null}
            thenDay={thenDay}
          />
        ))}
      </div>
    </>
  );
}

function ShapeCard({
  shapeKey,
  now,
  then,
  thenDay,
}: {
  shapeKey: string;
  now: { line: number[]; count: number };
  then: { line: number[]; count: number } | null;
  thenDay: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const single = !shapeKey.includes("-");
  const jane = single ? AVERAGED_TONE_SHAPE[Number(shapeKey) as Tone] : (AVERAGED_PAIR_SHAPE[shapeKey] ?? null);
  const tint = single ? TONE_AVERAGE_COLOR[Number(shapeKey) as Tone] : COMBO_TINT;
  const label = single ? `Tone ${shapeKey}` : `Tones ${shapeKey.replace("-", " + ")}`;

  useEffect(() => {
    if (ref.current) {
      drawPlayerShapeChart(ref.current, { jane, now: now.line, then: then?.line ?? null }, tint, CARD_W, CARD_H);
    }
  }, [jane, now, then, tint]);

  return (
    <figure className="tone-average-card player-shape-card">
      <canvas
        ref={ref}
        style={{ width: CARD_W, height: CARD_H }}
        role="img"
        aria-label={`${label}: your average pitch shape drawn over Jane's.`}
      />
      <figcaption>
        <span className="syllable">{label}</span>
        <span className="cue">
          based on {now.count} attempts
          {thenDay && (then ? ` · ${then.count} by ${thenDay}` : ` · too few by ${thenDay}`)}
        </span>
      </figcaption>
    </figure>
  );
}
