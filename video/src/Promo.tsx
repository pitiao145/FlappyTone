/**
 * The promo edit: a hook card, the gameplay clip (rendered by
 * `npm run render-demo` — the real game) with timed captions, then an end
 * card. Everything is props, so one composition makes every promo; the
 * demo-video skill writes the props file.
 *
 * Remotion drives everything from `useCurrentFrame()` — no CSS animations,
 * no timers — so a frame renders the same in Studio and in `remotion render`.
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
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadHanken } from "@remotion/google-fonts/HankenGrotesk";

export const { fontFamily: DISPLAY } = loadFraunces("normal", { weights: ["600"], subsets: ["latin"] });
export const { fontFamily: SANS } = loadHanken("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });

/** The game's tokens (src/ui/tokens.css), so the edit and the game read as one brand. */
export const BRAND = {
  surface: "#f7f1e3",
  backdrop: "#eee4cc",
  ink: "#241d15",
  accent: "#1c7a63",
  beak: "#c98a3c",
  good: "#2c8f61",
};

export type Format = "9:16" | "1:1" | "16:9";

export const SIZE: Record<Format, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

export interface Caption {
  text: string;
  /** Seconds into the clip (the timing file's marks are in these units). */
  from: number;
  to: number;
  /** A named slot, or the pill's top edge as a fraction of the frame height. */
  position?: "top" | "middle" | "bottom" | number;
  /** "ink" (dark pill, default), "accent" (green) or "highlight" (gold, for a payoff line). */
  tone?: "ink" | "accent" | "highlight";
}

/** A slow push-in on the clip between two clip times, e.g. on a Perfect. */
export interface Zoom {
  from: number;
  to: number;
  /** Peak scale, default 1.12. */
  scale?: number;
  /** Where the zoom centres, as a fraction of the frame height. Default 0.5. */
  originY?: number;
}

export interface PromoProps {
  format: Format;
  /** Path under video/public, e.g. "clips/example.mp4". */
  clip: string;
  /** The clip's length in seconds (from its timing file). */
  clipSeconds: number;
  /** Trim: start/end within the clip, seconds. */
  clipStart?: number;
  clipEnd?: number;
  hook?: { text: string; sub?: string; seconds?: number };
  captions?: Caption[];
  zooms?: Zoom[];
  endCard?: { title: string; subtitle?: string; cta?: string; seconds?: number };
  /** Path under video/public. Plays under the whole edit. */
  music?: string;
  musicVolume?: number;
  /** Volume of the clip's own audio (Jane's cues). Default 1. */
  clipVolume?: number;
  [key: string]: unknown;
}

export const FPS = 30;
/** Frames each section overlaps the next, for the crossfade. */
const XFADE = 8;

export function sections(p: PromoProps) {
  const hook = p.hook ? Math.round((p.hook.seconds ?? 1.8) * FPS) : 0;
  const clipLen = Math.round(((p.clipEnd ?? p.clipSeconds) - (p.clipStart ?? 0)) * FPS);
  const end = p.endCard ? Math.round((p.endCard.seconds ?? 2.5) * FPS) : 0;
  const clipFrom = hook > 0 ? hook - XFADE : 0;
  const endFrom = clipFrom + clipLen - (end > 0 ? XFADE : 0);
  return { hook, clipFrom, clipLen, endFrom, end, total: end > 0 ? endFrom + end : clipFrom + clipLen };
}

function useFadeInOut(len: number) {
  const f = useCurrentFrame();
  return interpolate(f, [0, XFADE, len - XFADE, len], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function Hook({ text, sub, len, compact }: { text: string; sub?: string; len: number; compact: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 14 } });
  const subIn = spring({ frame: f - 8, fps, config: { damping: 16 } });
  const bird = spring({ frame: f - 3, fps, config: { damping: 10, mass: 0.6 } });
  const opacity = useFadeInOut(len + XFADE);
  return (
    <AbsoluteFill style={{ background: BRAND.surface, alignItems: "center", justifyContent: "center", opacity, padding: 80 }}>
      <Img
        src={staticFile("brand/bird.png")}
        style={{
          width: compact ? 150 : 220,
          marginBottom: 40,
          transform: `translateY(${(1 - bird) * 80}px) rotate(${(1 - bird) * -20}deg)`,
          opacity: bird,
        }}
      />
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: compact ? 84 : 104,
          lineHeight: 1.08,
          color: BRAND.ink,
          textAlign: "center",
          transform: `scale(${0.85 + 0.15 * pop})`,
          opacity: pop,
        }}
      >
        {text}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 600,
            fontSize: compact ? 40 : 48,
            color: BRAND.accent,
            marginTop: 32,
            textAlign: "center",
            opacity: subIn,
            transform: `translateY(${(1 - subIn) * 30}px)`,
          }}
        >
          {sub}
        </div>
      )}
    </AbsoluteFill>
  );
}

const CAPTION_BG: Record<NonNullable<Caption["tone"]>, { bg: string; fg: string }> = {
  ink: { bg: BRAND.ink, fg: BRAND.surface },
  accent: { bg: BRAND.accent, fg: BRAND.surface },
  highlight: { bg: BRAND.beak, fg: "#fff" },
};

export function CaptionPill({ c, len }: { c: Caption; len: number }) {
  const f = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const inS = spring({ frame: f, fps, config: { damping: 13, mass: 0.7 } });
  const out = interpolate(f, [len - 6, len], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const top = typeof c.position === "number" ? c.position : c.position === "bottom" ? 0.72 : c.position === "middle" ? 0.45 : 0.2;
  const col = CAPTION_BG[c.tone ?? "ink"];
  return (
    <AbsoluteFill style={{ alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: height * top,
          maxWidth: "86%",
          padding: "22px 40px",
          borderRadius: 28,
          background: col.bg,
          color: col.fg,
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: 58,
          lineHeight: 1.15,
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(36,29,21,0.25)",
          opacity: inS * out,
          transform: `translateY(${(1 - inS) * 40}px) scale(${0.9 + 0.1 * inS})`,
        }}
      >
        {c.text}
      </div>
    </AbsoluteFill>
  );
}

function Gameplay({ p, len }: { p: PromoProps; len: number }) {
  const f = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = f / fps + (p.clipStart ?? 0);
  let scale = 1;
  let originY = 0.5;
  for (const z of p.zooms ?? []) {
    if (t < z.from - 0.4 || t > z.to + 0.4) continue;
    const k = interpolate(t, [z.from - 0.4, z.from, z.to, z.to + 0.4], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    scale = 1 + ((z.scale ?? 1.12) - 1) * k;
    originY = z.originY ?? 0.5;
  }
  const opacity = interpolate(f, [0, XFADE], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: BRAND.backdrop, opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `50% ${originY * height}px` }}>
        <OffthreadVideo
          src={staticFile(p.clip)}
          startFrom={Math.round((p.clipStart ?? 0) * fps)}
          endAt={p.clipEnd !== undefined ? Math.round(p.clipEnd * fps) : undefined}
          volume={p.clipVolume ?? 1}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </AbsoluteFill>
      {(p.captions ?? []).map((c, i) => {
        const from = Math.round((c.from - (p.clipStart ?? 0)) * fps);
        const to = Math.round((c.to - (p.clipStart ?? 0)) * fps);
        if (to <= 0 || from >= len) return null;
        return (
          <Sequence key={i} from={Math.max(0, from)} durationInFrames={to - Math.max(0, from)} layout="none">
            <CaptionPill c={c} len={to - Math.max(0, from)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

function EndCard({ title, subtitle, cta, compact }: { title: string; subtitle?: string; cta?: string; compact: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = interpolate(f, [0, XFADE], [0, 1], { extrapolateRight: "clamp" });
  const a = spring({ frame: f - 2, fps, config: { damping: 14 } });
  const b = spring({ frame: f - 10, fps, config: { damping: 14 } });
  const c = spring({ frame: f - 18, fps, config: { damping: 11 } });
  return (
    <AbsoluteFill style={{ background: BRAND.surface, alignItems: "center", justifyContent: "center", opacity: fade, padding: 80 }}>
      <Img src={staticFile("brand/bird.png")} style={{ width: compact ? 130 : 180, marginBottom: 36, transform: `scale(${a})` }} />
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: compact ? 88 : 110, color: BRAND.ink, opacity: a, transform: `translateY(${(1 - a) * 30}px)`, textAlign: "center" }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: compact ? 40 : 48, color: BRAND.ink, opacity: b * 0.75, marginTop: 24, textAlign: "center" }}>
          {subtitle}
        </div>
      )}
      {cta && (
        <div
          style={{
            marginTop: 56,
            padding: "26px 56px",
            borderRadius: 999,
            background: BRAND.accent,
            color: BRAND.surface,
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: compact ? 40 : 48,
            transform: `scale(${c})`,
          }}
        >
          {cta}
        </div>
      )}
    </AbsoluteFill>
  );
}

export function Promo(p: PromoProps) {
  const s = sections(p);
  const compact = p.format !== "9:16";
  return (
    <AbsoluteFill style={{ background: BRAND.surface }}>
      {p.music && <Audio src={staticFile(p.music)} volume={p.musicVolume ?? 0.35} loop />}
      {p.hook && (
        <Sequence durationInFrames={s.hook} name="Hook">
          <Hook text={p.hook.text} sub={p.hook.sub} len={s.hook - XFADE} compact={compact} />
        </Sequence>
      )}
      <Sequence from={s.clipFrom} durationInFrames={s.clipLen} name="Gameplay">
        <Gameplay p={p} len={s.clipLen} />
      </Sequence>
      {p.endCard && (
        <Sequence from={s.endFrom} durationInFrames={s.end} name="End card">
          <EndCard title={p.endCard.title} subtitle={p.endCard.subtitle} cta={p.endCard.cta} compact={compact} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
