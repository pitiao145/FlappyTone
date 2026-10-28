import { useEffect, useId, useRef } from "react";
import { brand } from "../../brand.ts";
import type { Tone } from "../../game/gates.ts";
import { TONE_LINE_COLOR } from "../toneColors.ts";
import {
  ACCURACY_ALL_TIME,
  NATIVE_T3,
  PAIR_ACCURACY_ALL_TIME,
  T1_PROGRESS,
  T3_EARLIER,
  T3_IS_PLACEHOLDER,
  T3_NOW,
} from "./progressSample.ts";

/**
 * Landing → "See your tones take shape". Three of the stats screens redrawn as
 * plain SVG and CSS from a static snapshot (progressSample.ts): the tone shape
 * against a native speaker (animated), accuracy per tone and the accuracy
 * trend. Close to the in-app look, not the app: nothing here is interactive.
 * Renders its final state without `window`, so the prerender and a no-script
 * visitor see the finished chart.
 */

const COPY = brand.landing.progress;

/** Same vertical crop as the app's shape cards (toneAverageChart.ts). */
const TOP = 5.5;
const BOTTOM = 0.5;
const W = 640;
const H = 300;

const toneVar = (tone: Tone) => ({ "--tone": TONE_LINE_COLOR[tone] }) as React.CSSProperties;

function linePath(line: number[]): string {
  return line
    .map((chao, i) => {
      const x = (i / (line.length - 1)) * W;
      const y = ((TOP - chao) / (TOP - BOTTOM)) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Progress of a phase that runs from `from` to `to` (ms) at time `t`. */
const phase = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));

/** Times in ms: the native curve draws, the earlier line draws, a copy of it morphs to now, hold, fade, loop. */
const T_JANE = [0, 1400] as const;
const T_EARLIER = [1400, 2800] as const;
const T_MORPH = [3200, 5000] as const;
const T_FADE = [9200, 9900] as const;
const T_LOOP = 10200;

function ShapeChart() {
  const maskId = `shape-mask-${useId().replace(/:/g, "")}`;
  const root = useRef<SVGSVGElement>(null);
  const jane = useRef<SVGPathElement>(null);
  const earlierMask = useRef<SVGPathElement>(null);
  const earlier = useRef<SVGPathElement>(null);
  const now = useRef<SVGPathElement>(null);

  useEffect(() => {
    const svg = root.current;
    const janeEl = jane.current;
    const maskEl = earlierMask.current;
    const earlierEl = earlier.current;
    const nowEl = now.current;
    if (!svg || !janeEl || !maskEl || !earlierEl || !nowEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let start = 0;
    let visible = false;

    const frame = (time: number) => {
      if (!start) start = time;
      const t = (time - start) % T_LOOP;
      janeEl.style.strokeDashoffset = String(1 - ease(phase(t, ...T_JANE)));
      maskEl.style.strokeDashoffset = String(1 - ease(phase(t, ...T_EARLIER)));
      const k = ease(phase(t, ...T_MORPH));
      nowEl.setAttribute("d", linePath(T3_EARLIER.map((v, i) => v + (T3_NOW[i] - v) * k)));
      const fade = 1 - phase(t, ...T_FADE);
      nowEl.style.opacity = String(clamp01(phase(t, T_MORPH[0], T_MORPH[0] + 300)) * fade);
      janeEl.style.opacity = String(fade);
      earlierEl.style.opacity = String(fade);
      raf = requestAnimationFrame(frame);
    };
    const play = () => {
      if (!raf) {
        start = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else pause();
    });
    io.observe(svg);
    return () => {
      io.disconnect();
      pause();
    };
  }, []);

  return (
    <svg ref={root} className="pg-shape-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={COPY.shape.alt}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <path ref={earlierMask} d={linePath(T3_EARLIER)} className="pg-mask" pathLength={1} />
        </mask>
      </defs>
      {[1, 2, 3, 4, 5].map((chao) => {
        const y = ((TOP - chao) / (TOP - BOTTOM)) * H;
        return <line key={chao} x1={0} x2={W} y1={y} y2={y} className="pg-grid" />;
      })}
      <path ref={jane} d={linePath(NATIVE_T3)} className="pg-native" pathLength={1} />
      <g mask={`url(#${maskId})`}>
        <path ref={earlier} d={linePath(T3_EARLIER)} className="pg-earlier" />
      </g>
      <path ref={now} d={linePath(T3_NOW)} className="pg-now" />
    </svg>
  );
}

function AccuracyBar({ pct, fill, label, weak }: { pct: number; fill: string; label: React.ReactNode; weak?: boolean }) {
  return (
    <div className="pg-row">
      <span className="pg-row-label">{label}</span>
      <span className="pg-bar" aria-hidden="true">
        <span className="pg-bar-fill" style={{ width: `${pct}%`, background: fill }} />
      </span>
      <span className="pg-pct">{pct}%</span>
      {weak && <span className="pg-weak">{COPY.accuracy.weak}</span>}
    </div>
  );
}

function AccuracyCard() {
  const a = COPY.accuracy;
  const weakest = Math.min(...ACCURACY_ALL_TIME.map((t) => t.pct), ...PAIR_ACCURACY_ALL_TIME.map((p) => p.pct));
  return (
    <article className="sky-panel pg-card">
      <div className="pg-badges">
        {a.badges.map((b) => (
          <span key={b} className="pg-badge">
            {b}
          </span>
        ))}
      </div>
      <h3>{a.title}</h3>
      <div className="pg-toggle" aria-hidden="true">
        <span className="pg-toggle-on">
          {a.toggle[0]} <small>{a.toggleTags[0]}</small>
        </span>
        <span>
          {a.toggle[1]} <small>{a.toggleTags[1]}</small>
        </span>
      </div>
      <div role="img" aria-label={a.alt} className="pg-bars">
        {ACCURACY_ALL_TIME.map((t) => (
          <AccuracyBar
            key={t.tone}
            pct={t.pct}
            fill={TONE_LINE_COLOR[t.tone]}
            weak={t.pct === weakest}
            label={`Tone ${t.tone}`}
          />
        ))}
        <p className="pg-sub" aria-hidden="true">
          {a.pairsHeading}
        </p>
        {PAIR_ACCURACY_ALL_TIME.map((p) => (
          <AccuracyBar
            key={p.tones.join("")}
            pct={p.pct}
            fill={`linear-gradient(90deg, ${TONE_LINE_COLOR[p.tones[0]]}, ${TONE_LINE_COLOR[p.tones[1]]})`}
            weak={p.pct === weakest}
            label={
              <>
                <span style={{ color: TONE_LINE_COLOR[p.tones[0]] }}>{p.tones[0]}</span>
                {" + "}
                <span style={{ color: TONE_LINE_COLOR[p.tones[1]] }}>{p.tones[1]}</span>
              </>
            }
          />
        ))}
      </div>
    </article>
  );
}

const TW = 360;
const TH = 220;
const PAD = { l: 36, r: 14, t: 14, b: 30 };

function TrendChart() {
  const first = T1_PROGRESS[0].day;
  const last = T1_PROGRESS[T1_PROGRESS.length - 1].day;
  const x = (day: number) => PAD.l + ((day - first) / (last - first)) * (TW - PAD.l - PAD.r);
  const y = (pct: number) => PAD.t + ((100 - pct) / 100) * (TH - PAD.t - PAD.b);
  const pts = T1_PROGRESS.map((p) => `${x(p.day).toFixed(1)},${y(p.pct).toFixed(1)}`);
  const area = `M${x(first)},${y(0)} L${pts.join(" L")} L${x(last)},${y(0)} Z`;
  const labelled = [T1_PROGRESS[0], T1_PROGRESS[3], T1_PROGRESS[T1_PROGRESS.length - 1]];
  return (
    <svg className="pg-trend-svg" viewBox={`0 0 ${TW} ${TH}`} role="img" aria-label={COPY.trend.alt} style={toneVar(1)}>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={TW - PAD.r} y1={y(v)} y2={y(v)} className="pg-grid" />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="pg-axis">
            {v}%
          </text>
        </g>
      ))}
      <path d={area} className="pg-area" />
      <path d={`M${pts.join(" L")}`} className="pg-trend-line" />
      {T1_PROGRESS.map((p) => (
        <circle key={p.day} cx={x(p.day)} cy={y(p.pct)} r={5} className="pg-dot" />
      ))}
      {labelled.map((p, i) => (
        <text
          key={p.day}
          x={x(p.day)}
          y={TH - 8}
          textAnchor={i === 0 ? "start" : i === labelled.length - 1 ? "end" : "middle"}
          className="pg-axis"
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

function TrendCard() {
  const t = COPY.trend;
  return (
    <article className="sky-panel pg-card">
      <div className="pg-badges">
        <span className="pg-badge">{t.badge}</span>
      </div>
      <h3>{t.title}</h3>
      <div className="pg-chips" aria-hidden="true">
        {([1, 2, 3, 4] as Tone[]).map((tone) => (
          <span key={tone} className={tone === 1 ? "pg-chip pg-chip-on" : "pg-chip"} style={toneVar(tone)}>
            T{tone}
          </span>
        ))}
      </div>
      <TrendChart />
    </article>
  );
}

export function ProgressSection() {
  const s = COPY.shape;
  return (
    <section id="progress" className="sky-section pg">
      <div className="sky-head">
        <h2>{COPY.title}</h2>
        {!T3_IS_PLACEHOLDER && <p className="sky-small">{COPY.source}</p>}
      </div>
      <article className="sky-panel pg-card pg-shape" style={toneVar(3)}>
        <div className="pg-badges">
          <span className="pg-badge">{s.badge}</span>
        </div>
        <h3>{s.title}</h3>
        <ul className="pg-legend">
          <li>
            <span className="pg-key pg-key-native" aria-hidden="true" />
            {s.legend.native}
          </li>
          <li>
            <span className="pg-key pg-key-now" aria-hidden="true" />
            {s.legend.now}
          </li>
          <li>
            <span className="pg-key pg-key-earlier" aria-hidden="true" />
            {s.legend.earlier}
          </li>
        </ul>
        <ShapeChart />
      </article>
      <div className="pg-cards">
        <AccuracyCard />
        <TrendCard />
      </div>
    </section>
  );
}
