/**
 * TonyStory: a ~45s cartoon promo. Tony asks for 水餃 (dumplings), says 睡覺
 * (sleep), gets a pillow; the FlappyTone bird comes to the rescue, shows him the
 * two tone shapes (turning into the dumpling bird for the right one); he practises
 * in the real game; he asks again and gets dumplings.
 *
 * Assets: video/public/clips/tony-story.mp4 (demo/scenarios/tony-story.json),
 * video/public/audio/ (Jane's clips, pulled from R2, gitignored),
 * video/public/sfx/ (generated, gitignored: `sh video/make-sfx.sh`).
 *
 * Text stays inside the IG/TikTok safe area: below y≈250, above y≈1450,
 * clear of the right-hand button column.
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
import { getLength, getPointAtLength } from "@remotion/paths";
import { CAST, DumplingPip, Pillow, Steamer, Tony, Vendor } from "./Characters.tsx";
import { DISPLAY, FPS, SANS } from "./Promo.tsx";
import { CAPS, GAME, GAME_START, S, SCENE_ORDER, gameFrame, type SceneKey } from "./tonyStoryScript.ts";
import { createContext, useContext } from "react";

const HAN = `${SANS}, "PingFang TC", "Noto Sans TC", sans-serif`;
const RED = "#a3341f"; // --danger, tone 4's line colour
const GREEN = "#2c8f61";

export { TONY_STORY_FRAMES } from "./tonyStoryScript.ts";

/** What a render includes: captions off + one audio lane at a time gives CapCut its stems. */
export interface TonyStoryProps {
  captions?: boolean;
  voices?: boolean;
  sfx?: boolean;
  [key: string]: unknown;
}
const Layers = createContext<Required<Pick<TonyStoryProps, "captions" | "voices" | "sfx">>>({ captions: true, voices: true, sfx: true });

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function usePop(delay = 0, damping = 11) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, mass: 0.6 } });
}

/** A sound effect at frame `at` of the current scene. */
function Sfx({ name, at, volume = 0.6 }: { name: string; at: number; volume?: number }) {
  if (!useContext(Layers).sfx) return null;
  return (
    <Sequence from={at} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}

/** A voice clip from video/public/audio: Jane's, or the Tony recordings. */
function Jane({ word, at }: { word: string; at: number }) {
  if (!useContext(Layers).voices) return null;
  return (
    <Sequence from={at} layout="none">
      <Audio src={staticFile(`audio/${word}.wav`)} />
    </Sequence>
  );
}

// ---------------------------------------------------------------- shared bits

function Caption({ text, from, to, y = 270, tone = "ink" }: { text: string; from: number; to: number; y?: number; tone?: "ink" | "accent" | "highlight" }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { captions } = useContext(Layers);
  if (!captions || f < from || f >= to) return null;
  const pop = spring({ frame: f - from, fps, config: { damping: 12, mass: 0.6 } });
  const out = interpolate(f, [to - 6, to], [1, 0], clamp);
  const bg = tone === "accent" ? CAST.accent : tone === "highlight" ? CAST.beak : CAST.ink;
  return (
    <div style={{ position: "absolute", left: 70, right: 130, top: y, display: "flex", justifyContent: "center", opacity: out }}>
      <div
        style={{
          background: bg,
          color: CAST.paper,
          fontFamily: HAN,
          fontWeight: 700,
          fontSize: 54,
          lineHeight: 1.25,
          textAlign: "center",
          padding: "22px 40px",
          borderRadius: 44,
          scale: `${pop}`,
          boxShadow: "0 10px 0 rgba(36,29,21,0.25)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function SceneCaptions({ scene }: { scene: SceneKey }) {
  return (
    <>
      {CAPS[scene].map((c, i) => (
        <Caption key={i} {...c} />
      ))}
    </>
  );
}

type Tail = "left" | "right" | "side";

function SpeechBubble({
  x,
  y,
  han,
  pinyin,
  en,
  delay = 0,
  tail = "left",
  hanSize = 92,
}: {
  x: number;
  y: number;
  han: string;
  pinyin?: string;
  en?: string;
  delay?: number;
  tail?: Tail;
  hanSize?: number;
}) {
  const pop = usePop(delay, 9);
  const origin = tail === "left" ? "15% 100%" : tail === "right" ? "85% 100%" : "0% 50%";
  return (
    <div style={{ position: "absolute", left: x, top: y, scale: `${pop}`, transformOrigin: origin }}>
      <div style={{ background: CAST.paper, border: `10px solid ${CAST.ink}`, borderRadius: 56, padding: "20px 44px", textAlign: "center" }}>
        <div style={{ fontFamily: HAN, fontSize: hanSize, fontWeight: 800, color: CAST.ink, lineHeight: 1.1, whiteSpace: "pre" }}>{han}</div>
        {pinyin && <div style={{ fontFamily: SANS, fontSize: 50, fontWeight: 600, color: CAST.accent }}>{pinyin}</div>}
        {en && <div style={{ fontFamily: SANS, fontSize: 42, fontWeight: 600, color: CAST.ink, opacity: 0.7, fontStyle: "italic" }}>“{en}”</div>}
      </div>
      {tail === "side" ? (
        <svg width="60" height="80" style={{ position: "absolute", left: -50, top: "40%" }}>
          <path d="M60 0 L4 30 L60 60" fill={CAST.paper} stroke={CAST.ink} strokeWidth={10} strokeLinejoin="round" />
          <rect x="54" y="0" width="6" height="64" fill={CAST.paper} />
        </svg>
      ) : (
        <svg width="80" height="60" style={{ position: "absolute", bottom: -50, [tail]: 70 } as React.CSSProperties}>
          <path d={tail === "left" ? "M0 0 L20 56 L60 0" : "M20 0 L60 56 L80 0"} fill={CAST.paper} stroke={CAST.ink} strokeWidth={10} strokeLinejoin="round" />
          <rect x="0" y="0" width="80" height="6" fill={CAST.paper} />
        </svg>
      )}
    </div>
  );
}

function Stall({ dim = 0 }: { dim?: number }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#2a2440" }}>
      <svg width="1080" height="1920" style={{ position: "absolute" }}>
        <path d="M-20 140 Q540 260 1100 140" stroke={CAST.ink} strokeWidth={6} fill="none" />
        {[120, 330, 540, 750, 960].map((x, i) => {
          const y = 140 + 120 * (1 - ((x - 540) / 560) ** 2);
          return (
            <g key={x} style={{ transformOrigin: `${x}px ${y}px`, rotate: `${Math.sin(f / 15 + i) * 5}deg` }}>
              <circle cx={x} cy={y + 60} r="80" fill={RED} opacity={0.25} />
              <ellipse cx={x} cy={y + 60} rx="44" ry="52" fill={RED} stroke={CAST.ink} strokeWidth={8} />
              <rect x={x - 22} y={y + 2} width="44" height="12" rx="4" fill={CAST.beak} />
            </g>
          );
        })}
        <rect x="480" y="560" width="560" height="900" fill="#3b3354" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M${460 + i * 86} 520 L${546 + i * 86} 520 L${546 + i * 86} 600 Q${503 + i * 86} 650 ${460 + i * 86} 600 Z`} fill={i % 2 ? CAST.paper : RED} stroke={CAST.ink} strokeWidth={8} strokeLinejoin="round" />
        ))}
        <rect x="430" y="1250" width="660" height="80" rx="12" fill={CAST.beak} stroke={CAST.ink} strokeWidth={10} />
        <rect x="460" y="1330" width="600" height="420" fill="#8a5a2a" stroke={CAST.ink} strokeWidth={10} />
        <text x="740" y="1450" textAnchor="middle" fontFamily={HAN} fontSize="100" fontWeight={900} fill={CAST.paper}>水餃</text>
        <text x="740" y="1515" textAnchor="middle" fontFamily={SANS} fontSize="46" fontWeight={700} fill={CAST.paper} opacity={0.85}>shuǐjiǎo · dumplings</text>
        <rect x="0" y="1740" width="1080" height="180" fill="#1d1830" />
      </svg>
      <AbsoluteFill style={{ background: "#000", opacity: dim }} />
    </AbsoluteFill>
  );
}

/** Draws a multi-subpath `d` front to back: dash offsets reset per subpath, so each one gets its share of `progress`. */
function TracedPath({ d, progress, ...rest }: { d: string; progress: number } & React.SVGProps<SVGPathElement>) {
  const parts = d.split(/(?=M)/).map((p) => p.trim()).filter(Boolean);
  const lens = parts.map((p) => getLength(p));
  const total = lens.reduce((a, b) => a + b, 0);
  let before = 0;
  return (
    <>
      {parts.map((p, i) => {
        const local = Math.min(1, Math.max(0, (progress * total - before) / lens[i]));
        before += lens[i];
        return <path key={i} d={p} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - local} {...rest} />;
      })}
    </>
  );
}

/** Chao 1..5 → y inside a 300px-tall box. */
const cy = (chao: number) => 300 - ((chao - 1) / 4) * 300;
/** Both T4s drawn identically (high fall), for simplicity. */
const T4 = (x: number) => `M${x} ${cy(5)} C ${x + 90} ${cy(5)} ${x + 180} ${cy(1.6)} ${x + 270} ${cy(1)}`;
const SAID = `${T4(0)} ${T4(330)}`;
const MEANT = `M0 ${cy(3)} C 90 ${cy(3)} 200 ${cy(4.6)} 270 ${cy(5)} M330 ${cy(2.2)} C 400 ${cy(1)} 480 ${cy(1)} 600 ${cy(4)}`;

function ToneLine({
  d,
  progress,
  color,
  label,
  han,
  pinyin,
  tones,
}: {
  d: string;
  progress: number;
  color: string;
  label: string;
  han: string;
  pinyin: string;
  /** Tone number over each syllable's half; shown once that half is drawn. */
  tones: [string, string];
}) {
  return (
    <div style={{ position: "relative", width: 640, height: 430, padding: "24px 30px", boxSizing: "content-box", background: "rgba(20,16,35,0.88)", borderRadius: 40, border: `6px solid ${CAST.ink}` }}>
      <div style={{ fontFamily: HAN, fontSize: 44, fontWeight: 700, color: CAST.paper }}>
        {label} <span style={{ color, fontSize: 56 }}>{han}</span> <span style={{ fontFamily: SANS, color }}>{pinyin}</span>
      </div>
      <svg width="640" height="340" viewBox="-20 -20 640 340" style={{ overflow: "visible", filter: `drop-shadow(0 0 18px ${color})` }}>
        {[1, 2, 3, 4, 5].map((c) => (
          <line key={c} x1="-20" x2="620" y1={cy(c)} y2={cy(c)} stroke={CAST.paper} strokeOpacity={0.12} strokeWidth={3} />
        ))}
        <TracedPath d={d} progress={progress} stroke={color} strokeWidth={22} fill="none" strokeLinecap="round" />
      </svg>
      {tones.map((t, i) => {
        const shown = progress > (i === 0 ? 0.05 : 0.55);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 30 + 135 + i * 330 - 34,
              bottom: 2,
              width: 68,
              height: 68,
              borderRadius: 999,
              background: color,
              color: CAST.paper,
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `5px solid ${CAST.paper}`,
              opacity: shown ? 1 : 0,
            }}
          >
            {t}
          </div>
        );
      })}
    </div>
  );
}

function BrandPip({ size }: { size: number }) {
  const f = useCurrentFrame();
  const phase = Math.sin(f / 3.2);
  return (
    <Img
      src={staticFile("brand/bird.png")}
      style={{ width: size, height: size, translate: `0px ${phase * size * 0.05}px`, rotate: `${phase * 4}deg`, scale: `${1 + phase * 0.06} ${1 - phase * 0.06}` }}
    />
  );
}

function Puff({ at }: { at: number }) {
  const f = useCurrentFrame() - at;
  if (f < 0 || f > 16) return null;
  const t = f / 16;
  return (
    <svg width="400" height="400" viewBox="-200 -200 400 400" style={{ position: "absolute", left: -60, top: -60 }}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 150 * t} cy={Math.sin((a * Math.PI) / 180) * 150 * t} r={40 * (1 - t) + 6} fill={CAST.paper} opacity={1 - t} />
      ))}
      <circle r={120 * t} fill="none" stroke={CAST.beak} strokeWidth={14 * (1 - t)} />
    </svg>
  );
}

// ---------------------------------------------------------------- scenes

/** Taipei 101, flat silhouette: base, eight stacked flared blocks, spire. */
function Taipei101() {
  const fill = "#c98a5a";
  const blocks = Array.from({ length: 8 }, (_, i) => {
    const y = 950 - i * 78;
    return <path key={i} d={`M150 ${y} L250 ${y} L268 ${y - 78} L132 ${y - 78} Z`} fill={fill} stroke={CAST.ink} strokeWidth={6} strokeLinejoin="round" />;
  });
  return (
    <svg width="1080" height="1920" style={{ position: "absolute", opacity: 0.85 }}>
      <path d="M120 1500 L280 1500 L262 950 L138 950 Z" fill={fill} stroke={CAST.ink} strokeWidth={6} strokeLinejoin="round" />
      {blocks}
      <rect x="170" y="230" width="60" height="96" fill={fill} stroke={CAST.ink} strokeWidth={6} />
      <path d="M200 230 L200 120" stroke={CAST.ink} strokeWidth={8} strokeLinecap="round" />
    </svg>
  );
}

function PlaneScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const plane = spring({ frame: f, fps, config: { damping: 16 } });
  const step = spring({ frame: f - 32, fps, config: { damping: 9, mass: 0.7 } });
  const hop = Math.abs(Math.sin(interpolate(f, [32, 62], [0, Math.PI * 2], clamp))) * -60;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(#f2b77a, #f7e3c0 60%)" }}>
      <Sfx name="plane" at={0} volume={0.5} />
      <Sfx name="boing" at={34} volume={0.35} />
      <Sfx name="pop" at={12} />
      <div style={{ position: "absolute", left: 640, top: 520, width: 200, height: 200, borderRadius: 999, background: "#fff3b8" }} />
      <Taipei101 />
      <svg width="1080" height="1920" style={{ position: "absolute", translate: `${interpolate(plane, [0, 1], [900, 0])}px 0px` }}>
        <rect x="0" y="1500" width="1080" height="420" fill="#9a8f7a" />
        <path d="M0 1700 L1080 1700" stroke={CAST.paper} strokeWidth={14} strokeDasharray="80 60" />
        <path d="M420 900 L1200 900 L1200 1240 L460 1240 Q300 1240 300 1070 Q300 900 420 900 Z" fill={CAST.paper} stroke={CAST.ink} strokeWidth={12} />
        <path d="M640 1240 L760 1430 L900 1430 L840 1240 Z" fill={CAST.accent} stroke={CAST.ink} strokeWidth={12} strokeLinejoin="round" />
        {[560, 680, 920, 1040].map((x) => (
          <ellipse key={x} cx={x} cy="1000" rx="34" ry="40" fill="#86d0f2" stroke={CAST.ink} strokeWidth={8} />
        ))}
        <rect x="740" y="960" width="120" height="240" rx="20" fill="#3b3354" stroke={CAST.ink} strokeWidth={10} />
        <path d="M300 1060 L420 1060" stroke={CAST.accent} strokeWidth={30} />
        <path d="M740 1200 L560 1560 L620 1560 L800 1200 Z" fill={CAST.beak} stroke={CAST.ink} strokeWidth={10} strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", left: interpolate(step, [0, 1], [700, 300]), top: interpolate(step, [0, 1], [880, 1040]) + hop, opacity: f > 26 ? 1 : 0 }}>
        <Tony expression="happy" size={560} />
      </div>
      <SceneCaptions scene="plane" />
    </AbsoluteFill>
  );
}

function StallScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pillow = spring({ frame: f - 205, fps, config: { damping: 10 } });
  const asleep = f >= 232;
  const lie = spring({ frame: f - 232, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill>
      <Stall />
      <Sfx name="pop" at={22} volume={0.4} />
      <Jane word="tony-sleep" at={26} />
      <Jane word="shuijiao44" at={136} />
      <Sfx name="pop" at={135} volume={0.4} />
      <Sfx name="whoosh" at={205} />
      <Sfx name="wahwah" at={215} volume={0.45} />
      <Sfx name="thud" at={238} />
      <Sfx name="snore" at={250} volume={0.5} />
      <div style={{ position: "absolute", left: 600, top: 760 }}>
        <Vendor expression={f >= 130 && f < 215 ? "confused" : "friendly"} size={560} />
      </div>
      <div style={{ position: "absolute", left: 470, top: 1090 }}>
        <Steamer size={250} />
      </div>
      {!asleep ? (
        <div style={{ position: "absolute", left: 30, top: 1120 }}>
          <Tony expression={f >= 215 ? "crushed" : "hopeful"} talking={f > 24 && f < 90} size={620} />
        </div>
      ) : (
        <div style={{ position: "absolute", left: 30, top: 1400 }}>
          <div style={{ position: "absolute", left: 0, top: 170 }}>
            <Pillow size={340} />
          </div>
          <div style={{ position: "absolute", left: 140, top: -90, rotate: `${interpolate(lie, [0, 1], [0, -90])}deg`, transformOrigin: "50% 60%" }}>
            <Tony expression="neutral" eyesClosed size={480} />
          </div>
          <div style={{ position: "absolute", left: 60, top: -10, fontFamily: SANS, fontWeight: 900, fontSize: 80, color: CAST.paper, opacity: interpolate(f, [246, 256], [0, 1], clamp), translate: `0px ${-((f % 40) / 40) * 40}px` }}>
            z Z z
          </div>
        </div>
      )}
      <Sequence from={22} durationInFrames={106} layout="none">
        <SpeechBubble x={40} y={720} han="我要水餃!" pinyin="Wǒ yào shuǐjiǎo!" en="I want dumplings!" hanSize={84} />
      </Sequence>
      <Sequence from={135} durationInFrames={80} layout="none">
        <SpeechBubble x={480} y={440} han="睡覺?" pinyin="Shuìjiào?" en="Sleep?" tail="right" />
      </Sequence>
      {f >= 205 && !asleep && (
        <div
          style={{
            position: "absolute",
            left: interpolate(pillow, [0, 1], [720, 60]),
            top: interpolate(pillow, [0, 1], [1100, 1570]) - Math.sin(pillow * Math.PI) * 250,
            rotate: `${interpolate(pillow, [0, 1], [0, -360])}deg`,
          }}
        >
          <Pillow size={340} />
        </div>
      )}
      <SceneCaptions scene="stall" />
    </AbsoluteFill>
  );
}

/** The four tone marks the bird flies through, as one path across the sky. */
const HERO_PATH = "M70 860 L290 860 M360 1080 Q470 1100 560 800 M640 820 Q700 1140 760 1110 Q820 1100 860 820 M920 780 L1000 1140";
const HERO_LEN = getLength(HERO_PATH);

function HeroScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = spring({ frame: f, fps, config: { damping: 10, mass: 0.8 } });
  const trace = interpolate(f, [25, 100], [0, 1], clamp);
  const { x: px, y: py } = getPointAtLength(HERO_PATH, Math.max(0.01, trace * HERO_LEN)) ?? { x: 70, y: 860 };
  const flying = f >= 25 && f < 104;
  const end = spring({ frame: f - 104, fps, config: { damping: 11 } });
  // Resting pose: centre (260, 1300), scale 1.5 → beak tip at ≈ (485, 1300).
  const restX = interpolate(end, [0, 1], [1000, 260]);
  const restY = interpolate(end, [0, 1], [1140, 1300]);
  const cx = f < 25 ? 540 : flying ? px : restX;
  const cyy = f < 25 ? 1000 : flying ? py : restY;
  const sc = f < 25 ? interpolate(zoom, [0, 1], [3, 1]) : flying ? 1 : interpolate(end, [0, 1], [1, 1.5]);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(#5aa9e0, #a9dcf5 55%, #f7e3c0)" }}>
      <Sfx name="whoosh" at={0} volume={0.8} />
      <Sfx name="sparkle" at={25} volume={0.4} />
      <Sfx name="whoosh" at={60} volume={0.5} />
      <Sfx name="pop" at={118} />
      {[[140, 420, 1.1], [660, 330, 0.8], [520, 1500, 1.3], [60, 1650, 0.9]].map(([x, y, s], i) => (
        <div key={i} style={{ position: "absolute", left: x + Math.sin(f / 30 + i) * 20, top: y, width: 300 * s, height: 110 * s, borderRadius: 999, background: CAST.paper, opacity: 0.9 }} />
      ))}
      {f < 25 &&
        Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: 0, top: 300 + i * 130, width: 1080, height: 8, background: CAST.paper, opacity: 0.5 * (1 - f / 25), translate: `${((f * 90 + i * 200) % 1600) - 600}px 0px` }} />
        ))}
      <svg width="1080" height="1920" style={{ position: "absolute", filter: `drop-shadow(0 0 16px ${CAST.beak})`, opacity: interpolate(f, [104, 118], [1, 0.35], clamp) }}>
        <TracedPath d={HERO_PATH} progress={trace} stroke={CAST.beak} strokeWidth={26} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", left: cx - 150, top: cyy - 150, scale: `${sc}`, opacity: f < 2 ? 0 : 1 }}>
        <BrandPip size={300} />
      </div>
      <Sequence from={118} layout="none">
        <SpeechBubble x={540} y={1170} han={"Leave your\ntones to me!"} hanSize={58} tail="side" />
      </Sequence>
      <SceneCaptions scene="hero" />
    </AbsoluteFill>
  );
}

function ShapesScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flyIn = spring({ frame: f, fps, config: { damping: 13 } });
  const said = interpolate(f, [25, 85], [0, 1], clamp);
  const morph = 120;
  const meant = interpolate(f, [138, 195], [0, 1], clamp);
  const isDumpling = f >= morph + 3;
  const pipX = f < 85 ? interpolate(said, [0, 1], [200, 760]) : f < 138 ? 760 : interpolate(meant, [0, 1], [200, 760]);
  const pipY = f < 138 ? 400 : 900;
  return (
    <AbsoluteFill>
      <Stall dim={0.55} />
      <Sfx name="whoosh" at={0} />
      <Jane word="shuijiao44" at={25} />
      <Sfx name="puff" at={morph} />
      <Sfx name="sparkle" at={morph} volume={0.5} />
      <Jane word="shuijiao23" at={140} />
      <Sfx name="ding" at={200} />
      <div style={{ position: "absolute", left: 150, top: 400 }}>
        <ToneLine d={SAID} progress={said} color={RED} label="what he said" han="睡覺" pinyin="shuìjiào" tones={["4", "4"]} />
      </div>
      {f >= 130 && (
        <div style={{ position: "absolute", left: 150, top: 900 }}>
          <ToneLine d={MEANT} progress={meant} color={CAST.beak} label="what he meant" han="水餃" pinyin="shuǐjiǎo" tones={["2", "3"]} />
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: interpolate(flyIn, [0, 1], [-300, 0]) + pipX - 140,
          top: pipY - 140,
          translate: `0px ${f >= 85 && f < 138 ? interpolate(f, [100, 132], [0, 500], clamp) : 0}px`,
        }}
      >
        <div style={{ scale: `${f >= morph && f < morph + 6 ? interpolate(f, [morph, morph + 3, morph + 6], [1, 1.35, 1]) : 1}` }}>
          {isDumpling ? <DumplingPip size={260} /> : <BrandPip size={260} />}
        </div>
        <Puff at={morph} />
      </div>
      <div style={{ position: "absolute", left: 20, top: 1380 }}>
        <Tony expression={f >= 200 ? "epiphany" : "crushed"} size={520} />
      </div>
      <SceneCaptions scene="shapes" />
    </AbsoluteFill>
  );
}

/** The word card's text area, repainted (水餃 isn't in the catalog; and the card lags the next cue). */
function CardPatch({ pinyin, han, marks }: { pinyin: string; han: string; marks: "23" | "44" }) {
  const col = marks === "44" ? RED : CAST.accent;
  return (
    <>
      <div style={{ position: "absolute", left: 292, top: 150, width: 300, height: 165, background: "rgb(236,229,205)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 58, color: CAST.ink, lineHeight: 1.1 }}>{pinyin}</div>
        <div style={{ fontFamily: HAN, fontSize: 44, color: "#6b6151" }}>{han}</div>
      </div>
      <svg width="130" height="60" style={{ position: "absolute", left: 630, top: 245, background: "rgb(236,229,205)" }}>
        {marks === "44" ? (
          <path d="M10 14 L50 44 M70 14 L110 44" stroke={col} strokeWidth={6} fill="none" strokeLinecap="round" />
        ) : (
          <path d="M10 44 L50 14 M70 22 Q90 54 112 18" stroke={col} strokeWidth={6} fill="none" strokeLinecap="round" />
        )}
      </svg>
    </>
  );
}

function GameScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 14 } });
  const tony = spring({ frame: f - 8, fps, config: { damping: 11 } });
  const inTurn = (f >= gameFrame(GAME.turn1) && f < gameFrame(GAME.flown1)) || (f >= gameFrame(GAME.turn2) && f < gameFrame(GAME.flown2));
  const listening = (f >= gameFrame(GAME.listen1) && f < gameFrame(GAME.turn1)) || (f >= gameFrame(GAME.listen2) && f < gameFrame(GAME.turn2));
  return (
    <AbsoluteFill style={{ background: CAST.ink }}>
      <AbsoluteFill style={{ opacity: interpolate(pop, [0, 1], [0, 1]) }}>
        <OffthreadVideo src={staticFile("clips/tony-story.mp4")} startFrom={Math.round(GAME_START * FPS)} muted />
      </AbsoluteFill>
      {/* gate 1: the 2+3 stand-in, voiced as 水餃 */}
      <Jane word="shuijiao23" at={gameFrame(1.1)} />
      <Jane word="tony-shuijiao23" at={gameFrame(GAME.turn1) + 4} />
      {/* gate 2: Jane's real 睡覺 clip at its own cue (the file has its lead-in) */}
      <Jane word="shuijiao44" at={gameFrame(GAME.listen2)} />
      <Jane word="tony-shuijiao44" at={gameFrame(GAME.turn2) + 4} />
      <Sfx name="ding" at={gameFrame(GAME.turn2)} />
      <Sfx name="ding" at={gameFrame(10.6)} />
      {f < gameFrame(GAME.listen2) && pop > 0.97 && <CardPatch pinyin="shuǐ jiǎo" han="水餃" marks="23" />}
      {f >= gameFrame(GAME.listen2) && f < gameFrame(GAME.turn2) && <CardPatch pinyin="shuì jiào" han="睡覺" marks="44" />}
      {/* Tony practising on his phone, bottom-right (the bird flies at the left): listens, then talks on his turn */}
      <div style={{ position: "absolute", left: 600, top: 1110, translate: `${interpolate(tony, [0, 1], [500, 0])}px 0px` }}>
        <div style={{ position: "absolute", left: 20, top: 30, width: 330, height: 330, borderRadius: 999, background: CAST.paper, border: `10px solid ${inTurn ? CAST.accent : listening ? CAST.beak : CAST.ink}` }} />
        <div style={{ position: "relative" }}>
          <Tony expression={inTurn ? "hopeful" : "neutral"} holding="phone" talking={inTurn} size={450} />
        </div>
      </div>
      <SceneCaptions scene="game" />
    </AbsoluteFill>
  );
}

function RetryScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(f, [8, 88], [0, 1], clamp);
  const green = f >= 94;
  const basket = spring({ frame: f - 106, fps, config: { damping: 11 } });
  return (
    <AbsoluteFill>
      <Stall />
      <Sfx name="pop" at={2} volume={0.4} />
      <Jane word="tony-dumplings" at={4} />
      <Sfx name="ding" at={94} />
      <Sfx name="whoosh" at={106} />
      <Sfx name="thud" at={122} volume={0.4} />
      <div style={{ position: "absolute", left: 600, top: 760 }}>
        <Vendor expression="friendly" size={560} />
      </div>
      <div style={{ position: "absolute", left: 30, top: 1120 }}>
        <Tony expression={f >= 118 ? "happy" : "hopeful"} talking={f > 4 && f < 90} size={620} />
      </div>
      <Sequence from={0} durationInFrames={100} layout="none">
        <SpeechBubble x={40} y={760} han="我要水餃!" pinyin="Wǒ yào shuǐjiǎo!" en="I want dumplings!" hanSize={84} />
      </Sequence>
      <div style={{ position: "absolute", left: 150, top: 270, scale: `${green ? interpolate(f, [94, 100, 106], [1, 1.08, 1], clamp) : 1}` }}>
        <ToneLine d={MEANT} progress={draw} color={green ? GREEN : CAST.beak} label={green ? "✓ right tones" : "Listening…"} han="水餃" pinyin="shuǐjiǎo" tones={["2", "3"]} />
      </div>
      <div style={{ position: "absolute", left: 700, top: 760 - 300 }}>
        <DumplingPip size={200} />
      </div>
      {f >= 106 && (
        <div style={{ position: "absolute", left: interpolate(basket, [0, 1], [700, 230]), top: interpolate(basket, [0, 1], [1140, 1080]) - Math.sin(basket * Math.PI) * 160 }}>
          <Steamer size={320} />
        </div>
      )}
    </AbsoluteFill>
  );
}

const CONFETTI = Array.from({ length: 60 }, (_, i) => ({
  x: (i * 137.5) % 1080,
  delay: (i * 7) % 20,
  speed: 14 + ((i * 31) % 12),
  color: [CAST.accent, CAST.beak, RED, "#3b6fa0", CAST.paper][i % 5],
  spin: ((i * 53) % 360) - 180,
}));

function PartyScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({ frame: f - 30, fps, config: { damping: 12 } });
  const bird = spring({ frame: f - 42, fps, config: { damping: 8 } });
  return (
    <AbsoluteFill>
      <Stall dim={0.2} />
      <Sfx name="tada" at={0} volume={0.5} />
      <Sfx name="pop" at={4} volume={0.4} />
      <Sfx name="pop" at={9} volume={0.4} />
      <Sfx name="pop" at={30} />
      <Sfx name="boing" at={42} volume={0.35} />
      <div style={{ position: "absolute", left: 60, top: 1100, translate: `0px ${-Math.abs(Math.sin(f / 5)) * 50}px` }}>
        <Tony expression="happy" size={640} />
      </div>
      <div style={{ position: "absolute", left: 560, top: 1050 }}>
        <Steamer size={340} />
      </div>
      <div style={{ position: "absolute", left: 660, top: 860 + Math.sin(f / 4) * 40, rotate: `${Math.sin(f / 6) * 15}deg` }}>
        <DumplingPip size={260} flapSpeed={1.8} />
      </div>
      <svg width="1080" height="1920" style={{ position: "absolute" }}>
        {CONFETTI.map((c, i) => {
          const t = f - c.delay;
          if (t < 0) return null;
          return <rect key={i} x={c.x} y={-40 + t * c.speed} width="22" height="34" rx="4" fill={c.color} style={{ transformBox: "fill-box", transformOrigin: "center", rotate: `${c.spin * t * 0.1}deg` }} />;
        })}
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 560, paddingRight: 60 }}>
        <div style={{ position: "relative", scale: `${card}` }}>
          <div style={{ position: "absolute", left: "50%", top: -300, marginLeft: -190, scale: `${bird}`, translate: `0px ${Math.sin(f / 5) * 10}px` }}>
            <BrandPip size={380} />
          </div>
          <div style={{ background: CAST.paper, border: `12px solid ${CAST.ink}`, borderRadius: 56, padding: "50px 64px", textAlign: "center", boxShadow: "0 16px 0 rgba(0,0,0,0.3)" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 96, color: CAST.ink, lineHeight: 1.05 }}>Fix your tones.</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 96, color: CAST.accent, lineHeight: 1.05 }}>Free.</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 56, color: CAST.beak, marginTop: 22 }}>flappytone.com</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function TonyStory({ captions, voices, sfx }: TonyStoryProps) {
  const COMPONENT: Record<SceneKey, () => React.JSX.Element> = {
    plane: PlaneScene,
    stall: StallScene,
    hero: HeroScene,
    shapes: ShapesScene,
    game: GameScene,
    retry: RetryScene,
    party: PartyScene,
  };
  const scenes = SCENE_ORDER.map((k) => [k, COMPONENT[k]] as const);
  let from = 0;
  return (
    <Layers.Provider value={{ captions: captions ?? true, voices: voices ?? true, sfx: sfx ?? true }}>
    <AbsoluteFill style={{ background: CAST.ink }}>
      {scenes.map(([key, Scene]) => {
        const at = from;
        from += S[key];
        return (
          <Sequence key={key} from={at} durationInFrames={S[key]} name={key}>
            <Scene />
          </Sequence>
        );
      })}
    </AbsoluteFill>
    </Layers.Provider>
  );
}
