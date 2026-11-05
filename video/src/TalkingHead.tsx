/**
 * A founder talking-head edit: jump-cut A-roll (face + voice), full-screen
 * B-roll that covers the face while the voice keeps playing, word-chunk
 * captions, a title, push-in zooms and a CTA caption. All props, so each
 * video is a JSON file in video/props/ (e.g. origin.json).
 *
 * Every time in the props is a time in a SOURCE take ({ shot, t }: seconds
 * into that shot's file), never an output time. The composition maps it
 * through the cut list, so re-cutting a take never shifts a caption off its word.
 */

import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND, DISPLAY, FPS, SANS } from "./Promo.tsx";

/** One kept piece of a take: [from, to] seconds in shot `shot`'s file. */
export interface Segment {
  shot: number;
  from: number;
  to: number;
  /** A held picture (path under video/public) instead of the shot's video, silent, e.g. a freeze frame. Give it its own shot number, not in `shots`. */
  still?: string;
}

/** A moment in a source take. */
export interface At {
  shot: number;
  t: number;
}

export interface Overlay {
  /** Path under video/public: .mp4/.mov plays muted, anything else is a still. */
  src: string;
  from: At;
  to: At;
  /** For a video: where in it to start, seconds. */
  start?: number;
  /** For a video: play clip second `clipT` at source moment `at` (wins over `start`), e.g. a gate passing on a word. */
  sync?: { at: At; clipT: number };
  /** Slow push-in from 1 to this scale over its time on screen. Stills default to 1.08; videos only push when set. */
  push?: number;
  /** "cover" (default) fills the frame; "contain" letterboxes on a blurred copy. */
  fit?: "cover" | "contain";
  /** Fixed scale under the push, e.g. to fill more of a 9:16 frame with a landscape clip. Default 1. */
  scale?: number;
  /** CSS brightness for a dim recording. Default 1. */
  brightness?: number;
}

export interface THCaption {
  text: string;
  from: At;
  to: At;
}

export interface THZoom {
  from: At;
  to: At;
  /** Scale at `from` and at `to`; it ramps between and holds to the segment end. */
  scaleFrom?: number;
  scaleTo: number;
}

export interface TalkingHeadProps {
  /** shot number → path under video/public (A-roll with its synced voice). */
  shots: Record<string, string>;
  segments: Segment[];
  overlays?: Overlay[];
  captions?: THCaption[];
  title?: { text: string; sub?: string; seconds: number; /** Where the title starts. Default: frame 0. */ at?: At };
  zooms?: THZoom[];
  /** Big caption over a range, e.g. the CTA. */
  cta?: { text: string; from: At; to: At };
  /** Pop-in text over a range, mid-screen by default (`top` in % of the frame height). */
  popups?: { text: string; from: At; to: At; top?: number; /** Font size, px. Default 96. */ size?: number }[];
  /** Captions that start inside a zone sit at `top` (% of the frame height) instead of 68%, e.g. above a pitch line. */
  captionZones?: { from: At; to: At; top: number }[];
  /** Sound effects (path under video/public) at a source moment. */
  sfx?: { src: string; at: At; volume?: number }[];
  [key: string]: unknown;
}

const frames = (s: number) => Math.round(s * FPS);

/** Output start frame of each segment, plus the total. */
export function cutList(p: TalkingHeadProps) {
  let at = 0;
  const cuts = p.segments.map((s) => {
    const len = frames(s.to - s.from);
    const c = { ...s, outFrom: at, len };
    at += len;
    return c;
  });
  return { cuts, total: at };
}

/** Source moment → output frame. A moment cut out snaps forward to the next kept frame. */
function toFrame(cuts: ReturnType<typeof cutList>["cuts"], a: At): number {
  for (const c of cuts) {
    if (c.shot !== a.shot) continue;
    if (a.t < c.from) return c.outFrom;
    if (a.t <= c.to) return c.outFrom + frames(a.t - c.from);
  }
  const last = [...cuts].reverse().find((c) => c.shot === a.shot);
  return last ? last.outFrom + last.len : 0;
}

function ARoll({ p, cuts }: { p: TalkingHeadProps; cuts: ReturnType<typeof cutList>["cuts"] }) {
  const f = useCurrentFrame();
  const { height } = useVideoConfig();
  let scale = 1;
  for (const z of p.zooms ?? []) {
    const a = toFrame(cuts, z.from);
    const b = toFrame(cuts, z.to);
    const seg = cuts.find((c) => c.shot === z.from.shot && f >= c.outFrom && f < c.outFrom + c.len);
    if (!seg || f < a) continue;
    scale = interpolate(f, [a, Math.max(a + 1, b)], [z.scaleFrom ?? 1, z.scaleTo], { extrapolateRight: "clamp" });
  }
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `50% ${height * 0.35}px` }}>
      {cuts.map((c, i) => (
        <Sequence key={i} from={c.outFrom} durationInFrames={c.len} name={`A${c.shot}`}>
          {c.still ? (
            <Img src={staticFile(c.still)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <OffthreadVideo
              src={staticFile(p.shots[String(c.shot)])}
              startFrom={frames(c.from)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

function BRoll({ o, len, start }: { o: Overlay; len: number; start: number }) {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, 3, len - 3, len], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const push = interpolate(f, [0, len], [1, o.push ?? 1.08]);
  const isVideo = /\.(mp4|mov|webm)$/i.test(o.src);
  const media = (style: React.CSSProperties) =>
    isVideo ? (
      <OffthreadVideo src={staticFile(o.src)} startFrom={frames(start)} muted style={style} />
    ) : (
      <Img src={staticFile(o.src)} style={style} />
    );
  return (
    <AbsoluteFill style={{ opacity: fade, background: BRAND.ink, overflow: "hidden" }}>
      {o.fit === "contain" && (
        <AbsoluteFill style={{ filter: "blur(40px) brightness(0.6)", transform: "scale(1.2)" }}>
          {media({ width: "100%", height: "100%", objectFit: "cover" })}
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          transform: `scale(${(o.scale ?? 1) * (isVideo && o.push === undefined ? 1 : push)})`,
          filter: o.brightness ? `brightness(${o.brightness})` : undefined,
        }}
      >
        {media({ width: "100%", height: "100%", objectFit: o.fit ?? "cover" })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Title({ text, sub, len }: { text: string; sub?: string; len: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 14 } });
  const b = spring({ frame: f - 6, fps, config: { damping: 14 } });
  const out = interpolate(f, [len - 8, len], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 170, opacity: out }}>
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: 82,
          lineHeight: 1.08,
          color: BRAND.ink,
          background: BRAND.surface,
          padding: "22px 40px",
          borderRadius: 28,
          maxWidth: "88%",
          textAlign: "center",
          boxShadow: `8px 8px 0 ${BRAND.accent}`,
          opacity: a,
          transform: `translateY(${(1 - a) * -40}px)`,
        }}
      >
        {text}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 26,
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 50,
            color: BRAND.surface,
            background: BRAND.accent,
            padding: "14px 32px",
            borderRadius: 999,
            opacity: b,
            transform: `translateY(${(1 - b) * -20}px)`,
          }}
        >
          {sub}
        </div>
      )}
    </AbsoluteFill>
  );
}

/** A 1–4 word chunk, centre-low. Hard cut in, small pop, so fast chunks stay readable. */
function Chunk({ text, top = 68 }: { text: string; top?: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 12, mass: 0.5 } });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${top}%`,
          maxWidth: "88%",
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 76,
          lineHeight: 1.1,
          textAlign: "center",
          color: "#fff",
          WebkitTextStroke: `10px ${BRAND.ink}`,
          paintOrder: "stroke fill",
          textShadow: "0 6px 18px rgba(36,29,21,0.45)",
          transform: `scale(${0.88 + 0.12 * pop})`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

/** Pop-in text: springs in with a tilt, holds, fades out. */
function Popup({ text, top, len, size = 96 }: { text: string; top: number; len: number; size?: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 9, mass: 0.6 } });
  const out = interpolate(f, [len - 6, len], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${top}%`,
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: size,
          color: BRAND.ink,
          background: BRAND.surface,
          padding: "20px 44px",
          borderRadius: 28,
          boxShadow: `8px 8px 0 ${BRAND.beak}`,
          opacity: out,
          transform: `scale(${a}) rotate(${-4 * a}deg)`,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

function Cta({ text }: { text: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 11 } });
  const bob = Math.sin(f / 6) * 6;
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 220 }}>
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: 92,
          color: BRAND.surface,
          background: BRAND.accent,
          padding: "26px 54px",
          borderRadius: 32,
          boxShadow: `10px 10px 0 ${BRAND.ink}`,
          transform: `scale(${a}) translateY(${bob}px)`,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

export function TalkingHead(p: TalkingHeadProps) {
  const { cuts } = cutList(p);
  const span = (a: At, b: At) => {
    const from = toFrame(cuts, a);
    return { from, len: Math.max(1, toFrame(cuts, b) - from) };
  };
  return (
    <AbsoluteFill style={{ background: BRAND.ink }}>
      <ARoll p={p} cuts={cuts} />
      {(p.overlays ?? []).map((o, i) => {
        const s = span(o.from, o.to);
        const start = o.sync ? o.sync.clipT - (toFrame(cuts, o.sync.at) - s.from) / FPS : (o.start ?? 0);
        return (
          <Sequence key={i} from={s.from} durationInFrames={s.len} name={`B ${o.src}`}>
            <BRoll o={o} len={s.len} start={Math.max(0, start)} />
          </Sequence>
        );
      })}
      {p.title && (
        <Sequence from={p.title.at ? toFrame(cuts, p.title.at) : 0} durationInFrames={frames(p.title.seconds)} name="Title">
          <Title text={p.title.text} sub={p.title.sub} len={frames(p.title.seconds)} />
        </Sequence>
      )}
      {(p.sfx ?? []).map((x, i) => (
        <Sequence key={i} from={toFrame(cuts, x.at)} name={`SFX ${x.src}`}>
          <Audio src={staticFile(x.src)} volume={x.volume ?? 1} />
        </Sequence>
      ))}
      {p.cta &&
        (() => {
          const s = span(p.cta.from, p.cta.to);
          return (
            <Sequence from={s.from} durationInFrames={s.len} name="CTA">
              <Cta text={p.cta.text} />
            </Sequence>
          );
        })()}
      {(p.popups ?? []).map((u, i) => {
        const s = span(u.from, u.to);
        return (
          <Sequence key={i} from={s.from} durationInFrames={s.len} name={`Pop ${u.text}`}>
            <Popup text={u.text} top={u.top ?? 38} len={s.len} size={u.size} />
          </Sequence>
        );
      })}
      {(p.captions ?? []).map((c, i) => {
        const s = span(c.from, c.to);
        const zone = (p.captionZones ?? []).find((z) => s.from >= toFrame(cuts, z.from) && s.from < toFrame(cuts, z.to));
        return (
          <Sequence key={i} from={s.from} durationInFrames={s.len} name={c.text}>
            <Chunk text={c.text} top={zone?.top} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
