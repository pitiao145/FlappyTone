import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../analytics/client.ts";
import { useTier } from "../data/tier.ts";
import { addWeeks, keyName, todayLocal, weekEnd, weekLabel, weekStart } from "../game/comeBack.ts";
import type { Tone } from "../game/gates.ts";
import { averageInPeriod, MIN_ATTEMPTS_TO_SHOW, type ShapeRow } from "../game/playerShape.ts";
import { effectiveSpeechStyle } from "../game/settings.ts";
import { averagedShapes } from "../game/toneAccuracy.ts";
import { compareCaption, mockWeekLines, shapeDistance } from "../game/toneCompare.ts";
import { drawCompareChart } from "./toneAverageChart.ts";
import { ToneMarkIcon } from "./toneIcons.tsx";

const TONES: Tone[] = [1, 2, 3, 4];
/** How far back the compare line can go, in weeks. */
const COMPARE_BACK = [1, 2, 4, 8];

/** "last week" / "2 weeks ago" from this week; "the week before" / "4 weeks before" otherwise. */
function compareLabel(week: string, compareWeek: string, thisWeek: string): string {
  const back = Math.round((Date.parse(week) - Date.parse(compareWeek)) / (7 * 86_400_000));
  if (week === thisWeek) return back === 1 ? "last week" : `${back} weeks ago`;
  return back === 1 ? "the week before" : `${back} weeks before`;
}

/** The mock-up's sample pairs (a free player sees these). */
const MOCK_PAIRS = ["3-2", "2-3", "4-1", "1-4"];


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
  // The week it is compared with: any earlier week (default the one before).
  const [compareBack, setCompareBack] = useState(1);
  const compareWeek = addWeeks(week, -compareBack);
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
    const prev = compareWeek;
    const a = averageInPeriod(rows ?? [], key, week, weekEnd(week));
    const b = averageInPeriod(rows ?? [], key, prev, weekEnd(prev));
    return {
      thisWeek: a && a.count >= MIN_ATTEMPTS_TO_SHOW ? a.line : null,
      lastWeek: b && b.count >= MIN_ATTEMPTS_TO_SHOW ? b.line : null,
      thisCount: a?.count ?? 0,
    };
  }, [mode, rows, key, week, compareWeek, jane]);

  const caption = compareCaption(
    compareLabel(week, compareWeek, thisWeek),
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
      <ToneKeyPicker keys={[...TONES.map(String), ...pairs]} active={key} onPick={setKey} />
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
          <i className="tone-compare-key tone-compare-key-last" aria-hidden /> {compareLabel(week, compareWeek, thisWeek)}
        </span>
      </p>
      <div className="tone-compare-weeks">
        <span className="tone-compare-weeks-label">Week</span>
        <WeekPicker week={week} onChange={(w) => setWeek(w)} firstWeek={addWeeks(firstWeek, 1)} />
        <span className="tone-compare-weeks-label">Compare with</span>
        <div className="compare-back" role="group" aria-label="Compare with">
          {COMPARE_BACK.map((n) => (
            <button
              key={n}
              type="button"
              className="compare-back-pill"
              aria-pressed={compareBack === n}
              disabled={mode === "pro" && addWeeks(week, -n) < firstWeek}
              onClick={() => setCompareBack(n)}
            >
              {n === 1 ? "1 week before" : `${n} weeks before`}
            </button>
          ))}
        </div>
      </div>
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

/**
 * Pick a tone or a pair with the tone-mark icons (brief 55 feedback): the 4
 * tones on one row, pairs in a scrolling row under them. Names stay in the
 * aria labels. Shared by the compare view and Progress's accuracy trend.
 */
export function ToneKeyPicker({
  keys,
  active,
  onPick,
}: {
  keys: string[];
  active: string | null;
  onPick: (key: string) => void;
}) {
  const tones = keys.filter((k) => !k.includes("-"));
  const pairKeys = keys.filter((k) => k.includes("-"));
  return (
    <div className="tone-compare tone-key-picker">
      {tones.length > 0 && (
        <div className="tone-compare-tabs" role="group" aria-label="Tone">
          {tones.map((k) => (
            <button
              key={k}
              type="button"
              className="tone-compare-tab"
              aria-pressed={active === k}
              aria-label={keyName(k)}
              onClick={() => onPick(k)}
            >
              <ToneMarkIcon tone={Number(k) as Tone} className="tone-compare-icon" />
            </button>
          ))}
        </div>
      )}
      {pairKeys.length > 0 && (
        <div className="tone-compare-pairs" role="group" aria-label="Tone pairs">
          <span className="tone-compare-pairs-label">Pairs</span>
          {pairKeys.map((k) => (
            <button
              key={k}
              type="button"
              className="tone-compare-pair"
              aria-pressed={active === k}
              aria-label={keyName(k)}
              onClick={() => onPick(k)}
            >
              {k.split("-").map((t, i) => (
                <ToneMarkIcon key={i} tone={Number(t) as Tone} className="tone-compare-icon" />
              ))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
