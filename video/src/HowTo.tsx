/**
 * A simple how-to promo cut from real screen recordings: a Pip intro card,
 * numbered steps (each a trimmed clip under a caption band), a short card,
 * and a Pip outro with the CTA. Props: video/props/howto-*.json.
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

/** A box to blur, in fractions of the clip's own frame, keyframed in clip seconds. */
interface Blur {
  from: number;
  to: number;
  at: number[];
  top: number[];
  bottom: number[];
}

type Scene =
  | { kind: "intro"; seconds: number; title: string }
  | { kind: "card"; seconds: number; title: string }
  | { kind: "outro"; seconds: number; title: string; subtitle?: string }
  | {
      kind: "clip";
      src: string;
      /** Clip seconds to keep. */
      start: number;
      end: number;
      step?: number;
      caption: string;
      /** Continues the previous clip's section: hard cut, caption already in place. */
      cont?: boolean;
      /** Clip's width / height. */
      aspect: number;
      /** Source pixel size and a horizontal crop of it (x, w), for footage with side bars. */
      src_w?: number;
      src_h?: number;
      crop?: { x: number; w: number };
      /** A region of the source (e.g. a face cam over a side bar) drawn again on top, its right edge at the frame's. */
      cam?: { x: number; y: number; w: number; h: number };
      volume?: number;
      blur?: Blur[];
      /** Push-ins, clip seconds; x/y are fractions of the frame to zoom toward. */
      zooms?: { from: number; to: number; scale: number; x: number; y: number }[];
      /** Finger taps, clip seconds, at fractions of the frame. */
      taps?: { at: number; x: number; y: number }[];
      /** Confetti bursts, clip seconds. */
      confetti?: number[];
    };

export interface HowToProps {
  scenes: Scene[];
  /** Sound effects, `at` in seconds of the whole video. */
  sfx?: { src: string; at: number; volume?: number }[];
  [key: string]: unknown;
}

const secondsOf = (s: Scene) => (s.kind === "clip" ? s.end - s.start : s.seconds);
export const howToFrames = (p: HowToProps) => p.scenes.reduce((n, s) => n + Math.round(secondsOf(s) * FPS), 0);

const W = 1080;
const H = 1920;
const BAND = 300;
const FADE = 6;

function useFade(len: number, fadeIn = true, fadeOut = true) {
  const f = useCurrentFrame();
  const a = fadeIn ? interpolate(f, [0, FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const b = fadeOut ? interpolate(f, [len - FADE, len], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return Math.min(a, b);
}

/** Pip on a looping path; `away` sends it off the top right. */
function FlyingPip({ away = 0, size = 300 }: { away?: number; size?: number }) {
  const f = useCurrentFrame();
  const x = W / 2 + Math.sin(f / 22) * 260 + away * 900;
  const y = 1150 + Math.sin(f / 11) * 90 - away * 1500;
  const tilt = Math.cos(f / 11) * -14 - away * 20;
  const flap = 1 + Math.sin(f / 2.2) * 0.05;
  return (
    <Img
      src={staticFile("brand/bird.png")}
      style={{ position: "absolute", width: size, left: x - size / 2, top: y - size / 2, transform: `rotate(${tilt}deg) scaleY(${flap})` }}
    />
  );
}

function Title({ text, sub, y }: { text: string; sub?: string; y: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f - 4, fps, config: { damping: 12 } });
  return (
    <div style={{ position: "absolute", top: y, left: 80, right: 80, textAlign: "center", opacity: a, transform: `translateY(${(1 - a) * 40}px)` }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 92, lineHeight: 1.1, color: BRAND.ink }}>{text}</div>
      {sub && <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 50, color: BRAND.accent, marginTop: 30 }}>{sub}</div>}
    </div>
  );
}

function Intro({ s, len }: { s: Extract<Scene, { kind: "intro" }>; len: number }) {
  return (
    <AbsoluteFill style={{ background: BRAND.surface, opacity: useFade(len) }}>
      <BackBirds />
      <Title text={s.title} y={330} />
      <FlyingPip size={340} />
    </AbsoluteFill>
  );
}

function Card({ s, len }: { s: Extract<Scene, { kind: "card" }>; len: number }) {
  return (
    <AbsoluteFill style={{ background: BRAND.surface, opacity: useFade(len) }}>
      <BackBirds />
      <Title text={s.title} y={820} />
      <Confetti since={useCurrentFrame() / FPS - 0.2} />
    </AbsoluteFill>
  );
}

function Outro({ s, len }: { s: Extract<Scene, { kind: "outro" }>; len: number }) {
  const f = useCurrentFrame();
  const away = interpolate(f, [len * 0.35, len * 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: BRAND.surface, opacity: interpolate(f, [0, FADE], [0, 1], { extrapolateRight: "clamp" }) }}>
      <FlyingPip away={away ** 1.6} size={260} />
      <Title text={s.title} sub={s.subtitle} y={560} />
    </AbsoluteFill>
  );
}

const CONFETTI_COLORS = ["#1c7a63", "#c98a3c", "#e0b84a", "#d9604c", "#5b8fd6", "#8a63c9"];

/** A burst from the top of the frame: deterministic pieces, gravity, spin. */
function Confetti({ since }: { since: number }) {
  if (since < 0 || since > 2.6) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 90 }, (_, i) => {
        const r = (n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
        const x0 = W / 2 + (r(1) - 0.5) * 200;
        const vx = (r(2) - 0.5) * 1500;
        const vy = -600 - r(3) * 500;
        const t = since;
        const x = x0 + vx * t;
        const y = 650 + vy * t + 1500 * t * t;
        const rot = (r(4) - 0.5) * 1400 * t;
        const op = interpolate(t, [0, 1.8, 2.6], [1, 1, 0], { extrapolateRight: "clamp" });
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: 14 + r(5) * 12, height: 8 + r(6) * 8, background: CONFETTI_COLORS[i % 6],
          borderRadius: 3, opacity: op, transform: `rotate(${rot}deg)` }} />;
      })}
    </AbsoluteFill>
  );
}

/** Small birds drifting across the background, behind the clip. */
function BackBirds() {
  const f = useCurrentFrame();
  const birds = [
    { y: 330, speed: 2.2, size: 70, phase: 0 },
    { y: 1250, speed: 1.6, size: 56, phase: 700 },
    { y: 1700, speed: 2.8, size: 64, phase: 300 },
    { y: 820, speed: 1.9, size: 50, phase: 1100 },
  ];
  return (
    <>
      {birds.map((b, i) => {
        const span = W + 300;
        const x = ((f * b.speed + b.phase) % span) - 150;
        const y = b.y + Math.sin((f + b.phase) / 9) * 18;
        return <Img key={i} src={staticFile("brand/bird.png")} style={{ position: "absolute", left: x, top: y, width: b.size, opacity: 0.55,
          transform: `rotate(${Math.cos((f + b.phase) / 9) * -10}deg) scaleY(${1 + Math.sin(f / 2.2 + i) * 0.06})` }} />;
      })}
    </>
  );
}

/** A tap: a dot that presses in, then a ring that spreads. */
function Tap({ since, x, y }: { since: number; x: number; y: number }) {
  if (since < -0.35 || since > 0.7) return null;
  const dot = interpolate(since, [-0.35, -0.1, 0, 0.3, 0.5], [0, 1, 0.8, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ring = interpolate(since, [0, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <div style={{ position: "absolute", left: x - 34, top: y - 34, width: 68, height: 68, borderRadius: 34, background: "rgba(255,255,255,0.75)",
        border: "4px solid rgba(28,122,99,0.9)", opacity: dot, transform: `scale(${0.6 + 0.4 * dot})`, boxShadow: "0 4px 18px rgba(0,0,0,0.25)" }} />
      {since >= 0 && <div style={{ position: "absolute", left: x - 70, top: y - 70, width: 140, height: 140, borderRadius: 70,
        border: "6px solid rgba(28,122,99,0.85)", opacity: 1 - ring, transform: `scale(${0.4 + ring})` }} />}
    </>
  );
}

function Clip({ s, len, nextCont }: { s: Extract<Scene, { kind: "clip" }>; len: number; nextCont: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = s.start + f / fps;
  const aspect = s.crop && s.src_h ? s.crop.w / s.src_h : s.aspect;
  const boxH = H - BAND - 40;
  const boxW = Math.min(W - 60, boxH * aspect);
  const h = boxW / aspect;
  // Px per source px, and the full source frame's placement inside the box.
  const k = s.crop && s.src_w ? boxW / s.crop.w : 1;
  const full = s.crop && s.src_w && s.src_h
    ? { position: "absolute" as const, left: -s.crop.x * k, top: 0, width: s.src_w * k, height: s.src_h * k }
    : { position: "absolute" as const, inset: 0 };
  const left = (W - boxW) / 2;
  const top = BAND + (H - BAND - 40 - h) / 2;
  const capIn = s.cont ? 1 : spring({ frame: f - 2, fps, config: { damping: 13 } });
  const badge = s.cont ? 1 : spring({ frame: f - 6, fps, config: { damping: 7, mass: 0.6 } });
  const enter = s.cont ? 1 : spring({ frame: f, fps, config: { damping: 14, mass: 0.8 } });
  // A slow drift, plus any push-in (eased in and out over 0.5s).
  let zoom = 1 + 0.03 * (f / len), zx = 0.5, zy = 0.5;
  for (const z of s.zooms ?? []) {
    const k2 = interpolate(t, [z.from, z.from + 0.5, z.to - 0.5, z.to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (k2 > 0) { zoom *= 1 + (z.scale - 1) * (k2 * k2 * (3 - 2 * k2)); zx = z.x; zy = z.y; }
  }
  const startFrom = Math.round(s.start * fps);
  const video = (filter?: string, muted = false) => (
    <div style={full}>
      <OffthreadVideo src={staticFile(s.src)} startFrom={startFrom} volume={filter || muted ? 0 : s.volume ?? 1}
        style={{ width: "100%", height: "100%", filter }} />
    </div>
  );
  const cam = s.cam;
  return (
    <AbsoluteFill style={{ background: BRAND.surface, opacity: useFade(len, !s.cont, !nextCont) }}>
      <BackBirds />
      <div style={{ position: "absolute", top: 70, left: 60, right: 60, height: BAND - 110, display: "flex", alignItems: "center", justifyContent: "center", gap: 28,
        opacity: capIn, transform: `translateY(${(1 - capIn) * 30}px)` }}>
        {s.step && (
          <div style={{ flex: "none", width: 96, height: 96, borderRadius: 48, background: BRAND.accent, color: BRAND.surface, fontFamily: SANS, fontWeight: 700, fontSize: 56,
            display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${badge}) rotate(${(1 - badge) * -40}deg)` }}>{s.step}</div>
        )}
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 60, lineHeight: 1.12, color: BRAND.ink }}>{s.caption}</div>
      </div>
      <div style={{ position: "absolute", left, top, width: boxW, height: h, borderRadius: 36, overflow: "hidden", boxShadow: "0 20px 60px rgba(36,29,21,0.28)",
        transform: `translateY(${(1 - enter) * 120}px) scale(${0.9 + 0.1 * enter}) rotate(${(1 - enter) * 2}deg)` }}>
       <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: `${zx * 100}% ${zy * 100}%` }}>
        {video()}
        {(s.blur ?? []).filter((b) => t >= b.from && t <= b.to).map((b, i) => {
          const y0 = interpolate(t, b.at, b.top, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const y1 = interpolate(t, b.at, b.bottom, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ position: "absolute", inset: 0, clipPath: `inset(${y0 * 100}% 0 ${(1 - y1) * 100}% 0)` }}>
              {video("blur(28px)")}
            </div>
          );
        })}
        {(s.taps ?? []).map((p, i) => <Tap key={i} since={t - p.at} x={p.x * boxW} y={p.y * h} />)}
       </div>
      </div>
      {(s.confetti ?? []).map((c, i) => <Confetti key={i} since={t - c} />)}
      {cam && (() => {
        // Drawn 12% larger than the region, right-aligned and centred on it, so it hides the original cam.
        const z = k * 1.12;
        return (
          <div style={{ position: "absolute", left: left + boxW - cam.w * z, top: top + (cam.y + cam.h / 2) * k - (cam.h * z) / 2, width: cam.w * z, height: cam.h * z,
            borderRadius: 40, overflow: "hidden", boxShadow: "0 12px 40px rgba(36,29,21,0.35)" }}>
            <div style={{ position: "absolute", left: -cam.x * z, top: -cam.y * z, width: (s.src_w ?? 0) * z, height: (s.src_h ?? 0) * z }}>
              <OffthreadVideo src={staticFile(s.src)} startFrom={startFrom} volume={0} style={{ width: "100%", height: "100%" }} />
            </div>
          </div>
        );
      })()}
    </AbsoluteFill>
  );
}

export function HowTo({ scenes, sfx }: HowToProps) {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: BRAND.surface }}>
      {scenes.map((s, i) => {
        const len = Math.round(secondsOf(s) * FPS);
        const from = at;
        at += len;
        return (
          <Sequence key={i} from={from} durationInFrames={len} name={s.kind}>
            {s.kind === "intro" && <Intro s={s} len={len} />}
            {s.kind === "card" && <Card s={s} len={len} />}
            {s.kind === "outro" && <Outro s={s} len={len} />}
            {s.kind === "clip" && <Clip s={s} len={len} nextCont={(() => { const n = scenes[i + 1]; return !!n && n.kind === "clip" && !!n.cont; })()} />}
          </Sequence>
        );
      })}
      {(sfx ?? []).map((x, i) => (
        <Sequence key={`sfx${i}`} from={Math.round(x.at * FPS)} layout="none">
          <Audio src={staticFile(x.src)} volume={x.volume ?? 0.6} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
