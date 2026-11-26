import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../analytics/client.ts";
import { useTier } from "../data/tier.ts";
import { addWeeks, keyName, TONE_NAME, todayLocal, weekEnd, weekLabel, weekStart } from "../game/comeBack.ts";
import type { Tone } from "../game/gates.ts";
import { averageInPeriod, MIN_ATTEMPTS_TO_SHOW, type ShapeRow } from "../game/playerShape.ts";
import { effectiveSpeechStyle } from "../game/settings.ts";
import { averagedShapes } from "../game/toneAccuracy.ts";
import { compareCaption, mockWeekLines, shapeDistance } from "../game/toneCompare.ts";
import { drawCompareChart } from "./toneAverageChart.ts";

const TONES: Tone[] = [1, 2, 3, 4];
const TAB_LABEL: Record<Tone, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth" };
const SHORT: Record<string, string> = { "1": "first", "2": "second", "3": "third", "4": "fourth" };
/** The mock-up's sample pairs (a free player sees these). */
const MOCK_PAIRS = ["3-2", "2-3", "4-1", "1-4"];
/** "3-2" → "third + second". */
const pairLabel = (key: string) => key.split("-").map((t) => SHORT[t] ?? t).join(" + ");

interface Props {
  /** "pro": the player's own weekly shapes. "mock": a sample, for a free player (brief 55). */
  mode: "pro" | "mock";
  /** Pro: every stored `player_tone_shapes` row (null while loading). Ignored for mock. */
  rows?: ShapeRow[] | null;
  initialTone?: Tone;
}

/**
 * The weekly tone-compare view (brief 55): tabs per tone, one big chart with
 * three lines (Jane, this week, last week), a caption with the distance to
 * Jane, and a ‹ week › picker. Weeks only, never months.
 */
export function ToneCompare({ mode, rows = null, initialTone = 3 }: Props) {
  const tier = useTier();
  const style = effectiveSpeechStyle(tier);
  const thisWeek = weekStart(todayLocal());
  // A single tone ("3") or a pair ("3-2"), the same keys as player_tone_shapes.
  const [key, setKey] = useState<string>(String(initialTone));
  const [week, setWeek] = useState(thisWeek);
  const isPair = key.includes("-");
  const avg = averagedShapes();
  const jane = (isPair ? avg.pair[style][key] : avg.tone[style][Number(key) as Tone]) ?? null;
  /** Pairs to offer: the player's own (any attempt stored), or the mock-up's samples. */
  const pairs = useMemo(() => {
    if (mode === "mock") return MOCK_PAIRS.filter((k) => avg.pair[style][k]);
    const have = new Set((rows ?? []).filter((r) => r.key.includes("-")).map((r) => r.key));
    return [...have].filter((k) => /^[1-4]-[1-4]$/.test(k) && avg.pair[style][k]).sort();
  }, [mode, rows, avg, style]);

  /** The earliest week with any of the player's rows: the picker stops there. */
  const firstWeek = useMemo(() => {
    if (mode === "mock") return addWeeks(thisWeek, -3);
    const days = (rows ?? []).map((r) => r.day).sort();
    return days.length ? weekStart(days[0]) : thisWeek;
  }, [mode, rows, thisWeek]);

  const lines = useMemo(() => {
    if (mode === "mock") return mockWeekLines(jane, key);
    const prev = addWeeks(week, -1);
    const a = averageInPeriod(rows ?? [], key, week, weekEnd(week));
    const b = averageInPeriod(rows ?? [], key, prev, weekEnd(prev));
    return {
      thisWeek: a && a.count >= MIN_ATTEMPTS_TO_SHOW ? a.line : null,
      lastWeek: b && b.count >= MIN_ATTEMPTS_TO_SHOW ? b.line : null,
      thisCount: a?.count ?? 0,
    };
  }, [mode, rows, key, week, jane]);

  const caption = compareCaption(
    week === thisWeek ? "last week" : "the week before",
    shapeDistance(lines.thisWeek, jane),
    shapeDistance(lines.lastWeek, jane),
  );

  useEffect(() => {
    track({ type: "tone_compare_viewed", tone: Number(key[0]), key, week, mode });
  }, [key, week, mode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const draw = () => {
      const w = c.clientWidth || 320;
      drawCompareChart(c, { jane, thisWeek: lines.thisWeek, lastWeek: lines.lastWeek }, w, w * 0.625);
    };
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [jane, lines]);

  if (mode === "pro" && rows === null) return <p className="note">Loading your tone shapes…</p>;

  return (
    <div className="tone-compare">
      <div className="tone-compare-tabs" role="group" aria-label="Tone">
        {TONES.map((t) => (
          <button
            key={t}
            type="button"
            className="tone-compare-tab"
            aria-pressed={key === String(t)}
            aria-label={TONE_NAME[t]}
            onClick={() => setKey(String(t))}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {pairs.length > 0 && (
        <div className="tone-compare-pairs" role="group" aria-label="Tone pairs">
          <span className="tone-compare-pairs-label">Pairs</span>
          {pairs.map((k) => (
            <button
              key={k}
              type="button"
              className="tone-compare-pair"
              aria-pressed={key === k}
              aria-label={keyName(k)}
              onClick={() => setKey(k)}
            >
              {pairLabel(k)}
            </button>
          ))}
        </div>
      )}
      <p className="tone-compare-caption">{caption}</p>
      <canvas
        ref={canvasRef}
        className="tone-compare-canvas"
        role="img"
        aria-label={`Your ${keyName(key)} this week and last week, drawn over Jane's.`}
      />
      <p className="tone-compare-legend">
        <span>
          <i className="tone-compare-key tone-compare-key-jane" aria-hidden /> Jane
        </span>
        <span>
          <i className="tone-compare-key tone-compare-key-this" aria-hidden />{" "}
          {week === thisWeek ? "this week" : "that week"}
        </span>
        <span>
          <i className="tone-compare-key tone-compare-key-last" aria-hidden /> the week before
        </span>
      </p>
      <WeekPicker week={week} onChange={setWeek} firstWeek={firstWeek} />
      {mode === "mock" && <p className="note">Example data. Yours fills in as you play.</p>}
    </div>
  );
}

/** The shared ‹ week › picker, for Progress's other weekly views. */
export function WeekPicker({
  week,
  onChange,
  firstWeek,
}: {
  week: string;
  onChange: (week: string) => void;
  firstWeek: string;
}) {
  const thisWeek = weekStart(todayLocal());
  return (
    <div className="week-picker" role="group" aria-label="Week">
      <button type="button" aria-label="Previous week" disabled={week <= firstWeek} onClick={() => onChange(addWeeks(week, -1))}>
        ‹
      </button>
      <span className="week-picker-label">{weekLabel(week, thisWeek)}</span>
      <button type="button" aria-label="Next week" disabled={week >= thisWeek} onClick={() => onChange(addWeeks(week, 1))}>
        ›
      </button>
    </div>
  );
}
