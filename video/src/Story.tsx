/**
 * The long promo: a list of scenes, each a card, a chart or a video, with
 * captions timed in scene seconds. `Promo` edits one gameplay clip; this
 * strings many together. Props: video/props/story-*.json.
 */

import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AVERAGED_TONE_SHAPE } from "../../src/game/toneAverages.ts";
import { TONE_LINE_COLOR } from "../../src/ui/toneColors.ts";
import { BRAND, CaptionPill, DISPLAY, FPS, SANS, type Caption, type Zoom } from "./Promo.tsx";

type Scene =
  | { kind: "pip"; seconds: number; captions?: Caption[] }
  | { kind: "tones"; seconds: number; captions?: Caption[] }
  | { kind: "visualiser"; seconds: number; captions?: Caption[] }
  | { kind: "pro"; seconds: number; captions?: Caption[] }
  | { kind: "end"; seconds: number; title: string; subtitle?: string }
  | {
      kind: "video";
      seconds: number;
      src: string;
      start?: number;
      volume?: number;
      /** "cover" crops to fill (for footage not shot 9:16), default "contain". */
      fit?: "cover" | "contain";
      captions?: Caption[];
      zooms?: (Zoom & { originX?: number })[];
    };

export interface StoryProps {
  scenes: Scene[];
  [key: string]: unknown;
}

export const storyFrames = (p: StoryProps) => p.scenes.reduce((n, s) => n + Math.round(s.seconds * FPS), 0);

const W = 1080;
const H = 1920;

function Captions({ list }: { list?: Caption[] }) {
  return (
    <>
      {(list ?? []).map((c, i) => {
        const from = Math.round(c.from * FPS);
        const len = Math.round((c.to - c.from) * FPS);
        return (
          <Sequence key={i} from={from} durationInFrames={len} layout="none">
            <CaptionPill c={c} len={len} />
          </Sequence>
        );
      })}
    </>
  );
}

function Pip() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 9, mass: 0.6 } });
  const bob = Math.sin(f / 7) * 26;
  const flap = Math.sin(f / 3.5) * 8;
  return (
    <AbsoluteFill style={{ background: BRAND.surface, alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile("brand/bird.png")} style={{ width: 360, transform: `translateY(${bob + 120}px) rotate(${flap}deg) scale(${pop})` }} />
    </AbsoluteFill>
  );
}

/** A chao 1–5 chart: x = 0..1 through the syllable. */
function Chart({ x, y, w, h, title, lines, draw, labels = true }: {
  x: number; y: number; w: number; h: number; title: string;
  lines: { pts: [number, number][]; color: string; width?: number; dash?: string; opacity?: number; label?: string }[];
  draw: number; labels?: boolean;
}) {
  const px = (t: number) => x + t * w;
  const py = (c: number) => y + h - ((c - 1) / 4) * h;
  return (
    <g>
      <text x={x + w / 2} y={y - 34} textAnchor="middle" fontFamily={DISPLAY} fontWeight={600} fontSize={46} fill={BRAND.ink}>{title}</text>
      {labels && <rect x={x} y={y} width={w} height={h} fill="#fffaf0" rx={18} />}
      {labels && [1, 2, 3, 4, 5].map((c) => (
        <g key={c}>
          <line x1={x} x2={x + w} y1={py(c)} y2={py(c)} stroke={BRAND.ink} strokeOpacity={0.12} strokeWidth={2} />
          {labels && <text x={x - 16} y={py(c) + 12} textAnchor="end" fontFamily={SANS} fontSize={32} fill={BRAND.ink} fillOpacity={0.5}>{c}</text>}
        </g>
      ))}
      {lines.map((l, i) => {
        const d = l.pts.map(([t, c], k) => `${k ? "L" : "M"}${px(t).toFixed(1)},${py(c).toFixed(1)}`).join(" ");
        const end = l.pts[Math.max(0, Math.floor((l.pts.length - 1) * draw))];
        return (
          <g key={i} opacity={l.opacity ?? 1}>
            <path d={d} fill="none" stroke={l.color} strokeWidth={l.width ?? 12} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={l.dash ?? "4000"} strokeDashoffset={l.dash ? 0 : 4000 * (1 - draw)} pathLength={l.dash ? undefined : 4000} />
            {l.label && draw > 0.95 && (
              <text x={px(end[0]) - 6} y={py(end[1]) - 22} textAnchor="end" fontFamily={SANS} fontWeight={700} fontSize={32} fill={l.color}>{l.label}</text>
            )}
          </g>
        );
      })}
    </g>
  );
}

const jane = (tone: 1 | 2 | 3 | 4): [number, number][] =>
  AVERAGED_TONE_SHAPE.textbook[tone].map((c, k, a) => [k / (a.length - 1), c]);

/** The textbook 55 / 35 / 214 / 51 marks, drawn as the usual teaching chart does. */
const TEXTBOOK: Record<1 | 2 | 3 | 4, [number, number][]> = {
  1: [[0, 5], [1, 5]],
  2: [[0, 3], [1, 5]],
  3: Array.from({ length: 31 }, (_, k) => {
    const t = k / 30;
    return [t, t < 0.45 ? 2 - Math.sin((t / 0.45) * Math.PI / 2) : 1 + 3 * ((t - 0.45) / 0.55) ** 1.4] as [number, number];
  }),
  4: [[0, 5], [1, 1]],
};

function useDraw(delay = 6, frames = 36) {
  const f = useCurrentFrame();
  return interpolate(f, [delay, delay + frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function Tones() {
  const a = useDraw(4);
  const b = useDraw(30);
  const tones = [1, 2, 3, 4] as const;
  return (
    <AbsoluteFill style={{ background: BRAND.surface }}>
      <svg width={W} height={H}>
        <Chart x={150} y={620} w={860} h={430} title="Textbook" draw={a}
          lines={tones.map((t) => ({ pts: TEXTBOOK[t], color: TONE_LINE_COLOR[t], label: `T${t}` }))} />
        <Chart x={150} y={1230} w={860} h={430} title="A native speaker (Jane)" draw={b}
          lines={tones.map((t) => ({ pts: jane(t), color: TONE_LINE_COLOR[t], label: `T${t}` }))} />
        <text x={W / 2} y={1730} textAnchor="middle" fontFamily={SANS} fontSize={30} fill={BRAND.ink} fillOpacity={0.55}>
          Average of Jane's recorded words · pitch on the 1–5 tone scale
        </text>
      </svg>
    </AbsoluteFill>
  );
}

/** The visualiser's idea: a learner's T2 and T3 attempts over Jane's two shapes — nearly the same line. */
function Visualiser() {
  const f = useCurrentFrame();
  const a = useDraw(4, 40);
  const b = useDraw(40, 40);
  const wob = (pts: [number, number][], s: number) =>
    pts.map(([t, c]) => [t, c + 0.18 * Math.sin(t * 9 + s) + 0.1 * Math.sin(t * 23 + s * 2)] as [number, number]);
  const pulse = 0.6 + 0.4 * Math.sin(f / 6);
  return (
    <AbsoluteFill style={{ background: BRAND.surface }}>
      <svg width={W} height={H}>
        <Chart x={150} y={760} w={860} h={640} title="Tone 2 or Tone 3?" draw={1}
          lines={[
            { pts: jane(2), color: TONE_LINE_COLOR[2], width: 46, opacity: 0.18 },
            { pts: jane(3), color: TONE_LINE_COLOR[3], width: 46, opacity: 0.18 },
          ]} />
        <Chart x={150} y={760} w={860} h={640} title="" labels={false} draw={a}
          lines={[{ pts: wob(jane(2), 1), color: TONE_LINE_COLOR[2], width: 10, label: "your T2" }]} />
        <Chart x={150} y={760} w={860} h={640} title="" labels={false} draw={b}
          lines={[{ pts: wob(jane(3), 4), color: TONE_LINE_COLOR[3], width: 10, label: "your T3" }]} />
        <circle cx={150 + 860 * a} cy={1460} r={0} />
        <text x={W / 2} y={1640} textAnchor="middle" fontFamily={SANS} fontWeight={600} fontSize={38} fill={BRAND.ink} fillOpacity={pulse * (b > 0.9 ? 1 : 0)}>
          Same dip. Same rise. Which was which?
        </text>
      </svg>
    </AbsoluteFill>
  );
}

/** Pro's tone evolution: the player's T3 a month ago, now, and Jane's. Example data, labelled. */
function Pro() {
  const a = useDraw(4, 30);
  const b = useDraw(36, 40);
  const j = jane(3);
  const before = j.map(([t, c]) => [t, 2.9 + (c - 2.9) * 0.35 + 0.15 * Math.sin(t * 7)] as [number, number]);
  const now = j.map(([t, c]) => [t, c * 0.88 + 0.3 + 0.06 * Math.sin(t * 9)] as [number, number]);
  return (
    <AbsoluteFill style={{ background: BRAND.surface }}>
      <svg width={W} height={H}>
        <rect x={380} y={560} width={320} height={64} rx={32} fill={BRAND.accent} />
        <text x={540} y={604} textAnchor="middle" fontFamily={SANS} fontWeight={700} fontSize={34} fill={BRAND.surface}>PRO · Tone evolution</text>
        <Chart x={150} y={760} w={860} h={640} title="Your Tone 3" draw={1}
          lines={[{ pts: j, color: BRAND.ink, width: 6, dash: "14 12", opacity: 0.5 }]} />
        <Chart x={150} y={760} w={860} h={640} title="" labels={false} draw={a}
          lines={[{ pts: before, color: TONE_LINE_COLOR[3], width: 8, opacity: 0.35, label: "1 month ago" }]} />
        <Chart x={150} y={760} w={860} h={640} title="" labels={false} draw={b}
          lines={[{ pts: now, color: TONE_LINE_COLOR[3], width: 12, label: "now" }]} />
        <text x={W / 2} y={1470} textAnchor="middle" fontFamily={SANS} fontSize={32} fill={BRAND.ink} fillOpacity={0.6}>
          - - - Jane's Tone 3 · example data
        </text>
      </svg>
    </AbsoluteFill>
  );
}

function Video({ s }: { s: Extract<Scene, { kind: "video" }> }) {
  const f = useCurrentFrame();
  const t = f / FPS;
  let scale = 1, ox = 0.5, oy = 0.5;
  for (const z of s.zooms ?? []) {
    if (t < z.from - 0.4 || t > z.to + 0.4) continue;
    const k = interpolate(t, [z.from - 0.4, z.from, z.to, z.to + 0.4], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    scale = 1 + ((z.scale ?? 1.12) - 1) * k;
    ox = z.originX ?? 0.5;
    oy = z.originY ?? 0.5;
  }
  return (
    <AbsoluteFill style={{ background: BRAND.backdrop }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${ox * W}px ${oy * H}px` }}>
        <OffthreadVideo src={staticFile(s.src)} startFrom={Math.round((s.start ?? 0) * FPS)} volume={s.volume ?? 1}
          style={{ width: "100%", height: "100%", objectFit: s.fit ?? "contain" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function End({ title, subtitle }: { title: string; subtitle?: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: BRAND.surface, alignItems: "center", justifyContent: "center", padding: 80 }}>
      <Img src={staticFile("brand/bird.png")} style={{ width: 200, marginBottom: 40, transform: `scale(${a})` }} />
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 84, color: BRAND.ink, textAlign: "center", opacity: a }}>{title}</div>
      {subtitle && <div style={{ fontFamily: SANS, fontSize: 44, color: BRAND.ink, opacity: 0.7 * a, marginTop: 24, textAlign: "center" }}>{subtitle}</div>}
    </AbsoluteFill>
  );
}

export function Story({ scenes }: StoryProps) {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: BRAND.surface }}>
      {scenes.map((s, i) => {
        const len = Math.round(s.seconds * FPS);
        const from = at;
        at += len;
        return (
          <Sequence key={i} from={from} durationInFrames={len} name={s.kind}>
            {s.kind === "pip" && <Pip />}
            {s.kind === "tones" && <Tones />}
            {s.kind === "visualiser" && <Visualiser />}
            {s.kind === "pro" && <Pro />}
            {s.kind === "video" && <Video s={s} />}
            {s.kind === "end" && <End title={s.title} subtitle={s.subtitle} />}
            {"captions" in s && <Captions list={s.captions} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
