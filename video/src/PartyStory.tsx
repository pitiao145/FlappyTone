/**
 * PartyStory: a ≈32s cartoon promo in TonyStory's style. Bored Tony phones
 * Kai, who answers 我們在排隊 páiduì (we're queueing); Tony hears 派對 pàiduì (party), gets
 * ready, and finds a 雞排 queue; the FlappyTone bird comes to the rescue and
 * Tony practises both tone patterns in the real game; the queue throws a party
 * anyway; end card.
 *
 * Assets: video/public/clips/tony-paidui.mp4 (demo/scenarios/tony-paidui.json,
 * audio off: the stand-in clips would give the trick away), video/public/sfx/
 * (`sh video/make-sfx.sh`). Both gitignored. No voice lines.
 *
 * Text stays inside the IG/TikTok safe area: below y≈250, above y≈1450,
 * clear of the right-hand button column.
 */

import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CAST, Kai, Tony } from "./Characters.tsx";
import { DISPLAY, FPS, SANS } from "./Promo.tsx";
import { BrandPip, Caption, CardPatch, HAN, Layers, Puff, RED, Sfx, SpeechBubble, clamp, type TonyStoryProps } from "./TonyStory.tsx";
import { P, PARTY_ORDER, PCAPS, PGAME, PGAME_START, pGameFrame, type PartyScene } from "./partyStoryScript.ts";

export { PARTY_STORY_FRAMES } from "./partyStoryScript.ts";

const BLUE = "#3b6fa0";
const PURPLE = "#7a5aa0";

function SceneCaptions({ scene }: { scene: PartyScene }) {
  return (
    <>
      {PCAPS[scene].map((c, i) => (
        <Caption key={i} {...c} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- sets

/** Tony's living room: wallpaper, window, shelf, floor, the sofa's back. */
function LivingRoom() {
  return (
    <AbsoluteFill style={{ background: "#e6d8bb" }}>
      <svg width="1080" height="1920" style={{ position: "absolute" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={i * 96} y="0" width="40" height="1420" fill="#dccdae" />
        ))}
        <rect x="700" y="840" width="260" height="260" rx="16" fill="#a9dcf5" stroke={CAST.ink} strokeWidth={10} />
        <path d="M830 840 L830 1100 M700 970 L960 970" stroke={CAST.ink} strokeWidth={8} />
        <rect x="0" y="1420" width="1080" height="500" fill="#9a8f7a" />
        <rect x="60" y="1120" width="900" height="300" rx="60" fill={BLUE} stroke={CAST.ink} strokeWidth={10} />
      </svg>
    </AbsoluteFill>
  );
}

/** The sofa's seat and arms, drawn over Tony so he sits in it. */
function SofaFront() {
  return (
    <svg width="1080" height="1920" style={{ position: "absolute", left: 0, top: 0 }}>
      <rect x="60" y="1400" width="900" height="170" rx="30" fill={BLUE} stroke={CAST.ink} strokeWidth={10} />
      <rect x="20" y="1240" width="130" height="340" rx="50" fill={BLUE} stroke={CAST.ink} strokeWidth={10} />
      <rect x="870" y="1240" width="130" height="340" rx="50" fill={BLUE} stroke={CAST.ink} strokeWidth={10} />
      <path d="M100 1580 L100 1640 M920 1580 L920 1640" stroke={CAST.ink} strokeWidth={22} strokeLinecap="round" />
    </svg>
  );
}

/** A Taipei street at dusk with a 雞排 stand on the right. */
function Street({ dim = 0 }: { dim?: number }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "linear-gradient(#f2a96b, #f7d9a8 60%)" }}>
      <svg width="1080" height="1920" style={{ position: "absolute" }}>
        {/* buildings */}
        {[[-20, 420, 260], [230, 300, 220], [440, 380, 240]].map(([x, y, w], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={1400 - y} fill={i % 2 ? "#c98a5a" : "#b77a52"} stroke={CAST.ink} strokeWidth={6} />
            {Array.from({ length: 5 }, (_, r) =>
              [0, 1].map((c) => <rect key={`${r}-${c}`} x={x + 34 + c * (w / 2)} y={y + 50 + r * 120} width={w / 2 - 60} height={60} rx="6" fill="#ffe3a0" opacity={0.8} />),
            )}
          </g>
        ))}
        <rect x="0" y="1400" width="1080" height="520" fill="#8f8572" />
        <path d="M0 1560 L1080 1560" stroke={CAST.paper} strokeWidth={10} strokeDasharray="70 50" opacity={0.6} />
        {/* the stand */}
        <rect x="700" y="760" width="400" height="660" fill="#3b3354" stroke={CAST.ink} strokeWidth={10} />
        <rect x="720" y="560" width="330" height="170" rx="18" fill={RED} stroke={CAST.ink} strokeWidth={10} />
        <text x="885" y="690" textAnchor="middle" fontFamily={HAN} fontSize="124" fontWeight={900} fill={CAST.paper}>雞排</text>
        {Array.from({ length: 5 }, (_, i) => (
          <path key={i} d={`M${690 + i * 80} 740 L${770 + i * 80} 740 L${770 + i * 80} 810 Q${730 + i * 80} 856 ${690 + i * 80} 810 Z`} fill={i % 2 ? CAST.paper : RED} stroke={CAST.ink} strokeWidth={8} strokeLinejoin="round" />
        ))}
        <rect x="690" y="1120" width="400" height="70" rx="12" fill={CAST.beak} stroke={CAST.ink} strokeWidth={10} />
        <rect x="710" y="1190" width="370" height="230" fill="#8a5a2a" stroke={CAST.ink} strokeWidth={10} />
        {[800, 880, 960].map((x, i) => (
          <path key={x} d={`M${x} 1100 q-18 -40 0 -80 q18 -40 0 -80`} stroke={CAST.paper} strokeWidth={8} fill="none" strokeLinecap="round" opacity={0.6} style={{ translate: `0px ${-((f * 2 + i * 20) % 40)}px` }} />
        ))}
      </svg>
      <AbsoluteFill style={{ background: "#000", opacity: dim }} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- the queue

type Hair = "bun" | "bob" | "spiky" | "cap";

/** A queue extra: front-facing, simple, `size` px tall. */
function Folk({ shirt, hair, skin = CAST.skin, size = 420 }: { shirt: string; hair: Hair; skin?: string; size?: number }) {
  const s = { stroke: CAST.ink, strokeWidth: 9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 200 400" width={size / 2} height={size} style={{ overflow: "visible" }}>
      <path d="M80 300 L76 380 M120 300 L124 380" {...s} strokeWidth={26} />
      <path d="M80 300 L76 380 M120 300 L124 380" stroke="#4a4038" strokeWidth={10} strokeLinecap="round" />
      <rect x="44" y="170" width="112" height="150" rx="44" fill={shirt} {...s} />
      {hair === "bob" && <path d="M38 118 Q38 30 100 30 Q162 30 162 118 L162 150 L38 150 Z" fill={CAST.ink} />}
      <circle cx="100" cy="100" r="62" fill={skin} {...s} />
      {hair === "bun" && (
        <>
          <circle cx="100" cy="30" r="24" fill={CAST.ink} />
          <path d="M40 96 Q44 40 100 40 Q156 40 160 96 Q130 70 100 72 Q70 70 40 96 Z" fill={CAST.ink} />
        </>
      )}
      {hair === "bob" && <path d="M40 100 Q44 36 100 36 Q156 36 160 100 Q120 74 60 86 Z" fill={CAST.ink} />}
      {hair === "spiky" && <path d="M40 96 L50 40 L72 66 L90 30 L108 62 L128 32 L140 66 L158 46 L160 96 Q100 70 40 96 Z" fill={CAST.ink} />}
      {hair === "cap" && (
        <>
          <path d="M38 92 Q44 32 100 32 Q156 32 162 92 Z" fill={RED} {...s} />
          <path d="M100 86 Q160 76 186 92 Q160 102 100 96 Z" fill={RED} {...s} />
        </>
      )}
      <circle cx="80" cy="106" r="7" fill={CAST.ink} />
      <circle cx="120" cy="106" r="7" fill={CAST.ink} />
      <path d="M84 132 Q100 144 116 132" {...s} strokeWidth={6} fill="none" />
    </svg>
  );
}

/** Left (back of the line) to right (the stand). Kai is the null slot. */
const QUEUE: ({ x: number; shirt: string; hair: Hair } | null)[] = [
  { x: 190, shirt: PURPLE, hair: "bun" },
  { x: 290, shirt: CAST.beak, hair: "cap" },
  null,
  { x: 510, shirt: RED, hair: "bob" },
  { x: 600, shirt: CAST.accent, hair: "spiky" },
  { x: 690, shirt: BLUE, hair: "bob" },
];
const KAI_X = 360;

/** The queue, standing or dancing (from frame `danceFrom`); Kai waves when `wave`. */
function Queue({ danceFrom = Infinity, wave = false }: { danceFrom?: number; wave?: boolean }) {
  const f = useCurrentFrame();
  const dancing = f >= danceFrom;
  const groove = (i: number) => (dancing ? { translate: `0px ${-Math.abs(Math.sin((f - danceFrom) / 4.8 + i)) * 40}px`, rotate: `${Math.sin((f - danceFrom) / 4.8 + i) * 8}deg` } : {});
  return (
    <>
      {QUEUE.map((p, i) =>
        p ? (
          <div key={i} style={{ position: "absolute", left: p.x, top: 1000, transformOrigin: "50% 100%", ...groove(i) }}>
            <Folk shirt={p.shirt} hair={p.hair} />
          </div>
        ) : (
          <div key={i} style={{ position: "absolute", left: KAI_X, top: 960, transformOrigin: "50% 100%", ...groove(i) }}>
            <Kai expression={wave || dancing ? "grin" : "neutral"} size={480} reach={dancing ? 100 + Math.sin(f / 2.4) * 40 : wave ? 120 + Math.sin(f / 2.5) * 25 : 0} />
          </div>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------- scenes

function HookLine({ pop, who, word, han, color }: { pop: number; who: string; word: string; han: string; color: string }) {
  return (
    <div style={{ scale: `${pop}`, textAlign: "center" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 104, lineHeight: 1.05, color: CAST.ink }}>
        {who} <span style={{ color }}>{word}</span>
      </div>
      <div style={{ fontFamily: HAN, fontWeight: 900, fontSize: 84, color, marginTop: 10 }}>{han}</div>
    </div>
  );
}

/** The title, before we meet Tony. */
function HookScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: CAST.paper, alignItems: "center", justifyContent: "center", gap: 80, paddingRight: 60 }}>
      <Sfx name="pop" at={4} volume={0.5} />
      <Sfx name="pop" at={24} volume={0.5} />
      <HookLine pop={spring({ frame: f - 4, fps, config: { damping: 11 } })} who="He heard" word="“party.”" han="派對 🎉" color={RED} />
      <HookLine pop={spring({ frame: f - 24, fps, config: { damping: 11 } })} who="They said" word="“queue.”" han="排隊" color={CAST.accent} />
    </AbsoluteFill>
  );
}

/** A wall clock whose hands race: time dragging. */
function Clock({ f }: { f: number }) {
  return (
    <svg width="200" height="200" viewBox="-100 -100 200 200" style={{ position: "absolute", left: 150, top: 540 }}>
      <circle r="88" fill={CAST.paper} stroke={CAST.ink} strokeWidth={10} />
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx={Math.cos((i * Math.PI) / 6) * 68} cy={Math.sin((i * Math.PI) / 6) * 68} r="5" fill={CAST.ink} />
      ))}
      <path d="M0 0 L0 -40" stroke={CAST.ink} strokeWidth={10} strokeLinecap="round" style={{ rotate: `${f * 6}deg` }} />
      <path d="M0 0 L0 -64" stroke={RED} strokeWidth={6} strokeLinecap="round" style={{ rotate: `${f * 30}deg` }} />
    </svg>
  );
}

const TONY_SOFA = { left: 230, top: 880, size: 640 };
const DIAL = 54;

function BoredScene() {
  const f = useCurrentFrame();
  const dialing = f >= DIAL;
  return (
    <AbsoluteFill>
      <LivingRoom />
      <Clock f={f} />
      <Sfx name="pop" at={DIAL} volume={0.4} />
      <Sfx name="ding" at={DIAL + 12} volume={0.35} />
      <Sfx name="ding" at={DIAL + 24} volume={0.35} />
      <div style={{ position: "absolute", ...TONY_SOFA }}>
        <Tony expression={dialing ? "neutral" : "bored"} holding={dialing ? "phone" : undefined} size={TONY_SOFA.size} />
      </div>
      <SofaFront />
      {!dialing && (
        <div style={{ position: "absolute", left: 560, top: 900 - (f % 40) * 2, opacity: interpolate(f % 40, [0, 8, 32, 40], [0, 0.8, 0.8, 0]), fontFamily: SANS, fontStyle: "italic", fontWeight: 700, fontSize: 58, color: CAST.ink }}>
          sigh…
        </div>
      )}
      {dialing && (
        <div style={{ position: "absolute", left: 600, top: 860, padding: "12px 30px", borderRadius: 999, background: CAST.paper, border: `6px solid ${CAST.ink}`, fontFamily: SANS, fontWeight: 700, fontSize: 46, color: CAST.ink }}>
          📞 Calling Kai{".".repeat(1 + (Math.floor((f - DIAL) / 8) % 3))}
        </div>
      )}
      <SceneCaptions scene="bored" />
    </AbsoluteFill>
  );
}

/** Kai on the other end of the line: his head in a circle, top left. */
function KaiOnPhone() {
  return (
    <div style={{ position: "absolute", left: 50, top: 520 }}>
      <div style={{ width: 260, height: 260, borderRadius: 999, overflow: "hidden", background: "#f2a96b", border: `10px solid ${CAST.ink}`, position: "relative" }}>
        <div style={{ position: "absolute", left: -18, top: 6 }}>
          <Kai expression="grin" size={440} />
        </div>
      </div>
      <div style={{ marginTop: 14, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 44, color: CAST.ink }}>📞 Kai</div>
    </div>
  );
}

/** Kai's line on the phone: 排隊 ↗, or (misheard) 派對 ↘. */
function PhoneLine({ misheard }: { misheard: boolean }) {
  const col = misheard ? RED : CAST.accent;
  return (
    <>
      我們在<span style={{ color: col }}>{misheard ? "派對" : "排隊"}</span>
      {misheard && " 🎉"}
      <div style={{ fontFamily: SANS, fontSize: 50, fontWeight: 700, color: col, marginTop: 6 }}>wǒmen zài {misheard ? "pàiduì ↘" : "páiduì ↗"}</div>
      <div style={{ fontFamily: SANS, fontSize: 42, fontWeight: 600, fontStyle: "italic", color: CAST.ink, opacity: 0.7 }}>{misheard ? "“We're at a party!”" : "“We're lining up.”"}</div>
    </>
  );
}

const KAI_REPLY = 60;

function CallScene() {
  const f = useCurrentFrame();
  const asking = f < KAI_REPLY - 4;
  return (
    <AbsoluteFill>
      <LivingRoom />
      <Sfx name="pop" at={4} volume={0.5} />
      <Sfx name="pop" at={KAI_REPLY} volume={0.5} />
      <div style={{ position: "absolute", ...TONY_SOFA }}>
        <Tony expression={asking ? "hopeful" : "neutral"} holding="phone" talking={f > 6 && f < 44} size={TONY_SOFA.size} />
      </div>
      <SofaFront />
      {asking && (
        <Sequence from={4} layout="none">
          <SpeechBubble x={150} y={560} tail="left" han="你們在幹嘛?" pinyin="Nǐmen zài gànma?" en="What are you up to?" hanSize={84} />
        </Sequence>
      )}
      {f >= KAI_REPLY && (
        <Sequence from={KAI_REPLY} layout="none">
          <KaiOnPhone />
          <SpeechBubble x={360} y={540} tail="side" han={<PhoneLine misheard={false} />} hanSize={84} />
        </Sequence>
      )}
      <SceneCaptions scene="call" />
    </AbsoluteFill>
  );
}

/** What Kai said against what Tony heard. */
function SaidHeard({ said, heard }: { said: number; heard: number }) {
  const row = (pop: number, label: string, han: string, py: string, mean: string, color: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "14px 0", scale: `${pop}`, transformOrigin: "0% 50%" }}>
      <div style={{ width: 170, fontFamily: SANS, fontWeight: 800, fontSize: 38, lineHeight: 1.1, color: CAST.ink, opacity: 0.7 }}>{label}</div>
      <div style={{ fontFamily: HAN, fontWeight: 900, fontSize: 104, color }}>{han}</div>
      <div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 52, color }}>{py}</div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 42, color: CAST.ink }}>{mean}</div>
      </div>
    </div>
  );
  return (
    <div style={{ position: "absolute", left: 70, width: 800, top: 470, background: CAST.paper, border: `10px solid ${CAST.ink}`, borderRadius: 48, padding: "14px 40px", scale: `${said}`, boxShadow: "0 12px 0 rgba(36,29,21,0.25)" }}>
      {row(1, "KAI SAID", "排隊", "páiduì ↗", "= line up", CAST.accent)}
      <div style={{ height: 6, borderRadius: 3, background: CAST.ink, opacity: 0.15 }} />
      {row(heard, "TONEY HEARD", "派對", "pàiduì ↘", "= party 🎉", RED)}
    </div>
  );
}

const FLIP = 24;
const COMPARE = 50;

function MishearScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wobble = f < FLIP ? Math.sin(f * 1.3) * interpolate(f, [0, FLIP], [3, 9]) : Math.sin(f * 0.9) * 2 * Math.exp(-(f - FLIP) / 8);
  const jump = spring({ frame: f - FLIP - 2, fps, config: { damping: 7, mass: 0.6 } });
  const misheard = f >= FLIP;
  const said = spring({ frame: f - COMPARE, fps, config: { damping: 12 } });
  const heard = spring({ frame: f - COMPARE - 14, fps, config: { damping: 10 } });
  return (
    <AbsoluteFill>
      <LivingRoom />
      <Sfx name="boing" at={0} volume={0.45} />
      <Sfx name="sparkle" at={FLIP} volume={0.5} />
      <Sfx name="pop" at={FLIP} />
      <Sfx name="pop" at={COMPARE} volume={0.5} />
      <Sfx name="pop" at={COMPARE + 14} volume={0.5} />
      <div style={{ position: "absolute", ...TONY_SOFA, translate: `0px ${misheard ? -Math.sin(jump * Math.PI) * 120 : 0}px` }}>
        <Tony expression={misheard ? "shocked" : "neutral"} holding="phone" size={TONY_SOFA.size} />
      </div>
      <SofaFront />
      {f < COMPARE && (
        <div style={{ position: "absolute", inset: 0, opacity: interpolate(f, [COMPARE - 6, COMPARE], [1, 0], clamp) }}>
          <KaiOnPhone />
          <div style={{ position: "absolute", inset: 0, rotate: `${wobble}deg`, scale: `${misheard ? interpolate(f, [FLIP, FLIP + 3, FLIP + 7], [1, 1.12, 1], clamp) : 1}`, transformOrigin: "600px 700px" }}>
            <SpeechBubble x={360} y={540} tail="side" han={<PhoneLine misheard={misheard} />} hanSize={84} delay={-30} />
          </div>
        </div>
      )}
      {f >= COMPARE && <SaidHeard said={said} heard={heard} />}
      <SceneCaptions scene="mishear" />
    </AbsoluteFill>
  );
}

const RAY_COLORS = [CAST.beak, RED, CAST.accent, PURPLE, BLUE, CAST.beak];

const BEAT = 25;

function GlowUpScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Tony at (L, T), 700 px tall: his eyes sit at (202, 196) × 700/600.
  const L = 307;
  const T = 860;
  const k = 700 / 600;
  const shadesDrop = interpolate(f, [0, 8], [-400, T + 196 * k - 20], clamp);
  const ball = spring({ frame: f - 2 * BEAT, fps, config: { damping: 9 } });
  const beat = Math.min(2, Math.floor(f / BEAT));
  const flash = interpolate(f % BEAT, [0, 4], [0.5, 0], clamp);
  return (
    <AbsoluteFill style={{ background: CAST.ink }}>
      <svg width="1080" height="1920" style={{ position: "absolute" }}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = ((i * 30 + f * 3) * Math.PI) / 180;
          const b = a + Math.PI / 12;
          return <path key={i} d={`M540 1160 L${540 + Math.cos(a) * 2000} ${1160 + Math.sin(a) * 2000} L${540 + Math.cos(b) * 2000} ${1160 + Math.sin(b) * 2000} Z`} fill={RAY_COLORS[(i + beat) % RAY_COLORS.length]} opacity={0.55} />;
        })}
      </svg>
      {[0, BEAT, 2 * BEAT].map((at) => (
        <Sfx key={at} name="pop" at={at + 6} volume={0.6} />
      ))}
      <Sfx name="sparkle" at={2 * BEAT} volume={0.5} />
      {beat === 2 && (
        <svg width="1080" height="1920" style={{ position: "absolute", mixBlendMode: "screen" }}>
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={(i * 211 + f * 25) % 1080} cy={500 + ((i * 137) % 1200)} r={30 + (i % 3) * 14} fill={CAST.paper} opacity={0.35} />
          ))}
        </svg>
      )}
      <div style={{ position: "absolute", left: L, top: T, scale: `${1 + flash * 0.1}` }}>
        <Tony expression={beat === 2 ? "happy" : "hopeful"} hat={beat >= 1 ? "party" : "cap"} shades={f >= 8} size={700} />
        <div style={{ position: "absolute", left: 202 * k - 140, top: 40 * k - 140 }}>
          <Puff at={BEAT} />
        </div>
      </div>
      {f < 8 && (
        <svg width="200" height="60" viewBox="130 176 144 48" style={{ position: "absolute", left: L + 202 * k - 100, top: shadesDrop - 30 }}>
          <rect x="138" y="178" width="64" height="40" rx="16" fill={CAST.ink} />
          <rect x="202" y="178" width="64" height="40" rx="16" fill={CAST.ink} />
        </svg>
      )}
      {f >= 2 * BEAT && (
        <div style={{ position: "absolute", left: 800, top: interpolate(ball, [0, 1], [-200, 440]) }}>
          <div style={{ position: "absolute", left: 88, top: -600, width: 6, height: 600, background: CAST.paper }} />
          <svg width="180" height="180" viewBox="-90 -90 180 180" style={{ rotate: `${f * 6}deg` }}>
            <circle r="84" fill="#b9c2cc" stroke={CAST.ink} strokeWidth={8} />
            {Array.from({ length: 7 }, (_, r) =>
              Array.from({ length: 7 }, (_, c) => <rect key={`${r}-${c}`} x={-77 + c * 22} y={-77 + r * 22} width="18" height="18" fill={(r + c + Math.floor(f / 3)) % 3 ? "#dfe6ec" : CAST.paper} opacity={0.9} />),
            )}
          </svg>
        </div>
      )}
      <AbsoluteFill style={{ background: CAST.paper, opacity: flash }} />
      <SceneCaptions scene="glowup" />
    </AbsoluteFill>
  );
}

const SCRATCH = 20;

function RevealScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const walk = spring({ frame: f, fps, config: { damping: 14 } });
  const droop = interpolate(f, [44, 70], [0, 1], clamp);
  const punch = interpolate(f, [SCRATCH, SCRATCH + 3, SCRATCH + 10], [1, 1.08, 1.03], clamp);
  const expr = f < SCRATCH ? "happy" : f < 44 ? "shocked" : "crushed";
  return (
    <AbsoluteFill style={{ scale: `${punch}`, rotate: `${f >= SCRATCH ? -1.5 : 0}deg` }}>
      <Street />
      <Sfx name="scratch" at={SCRATCH} volume={0.8} />
      <Sfx name="wahwah" at={46} volume={0.4} />
      <Queue wave={f >= 30} />
      <div style={{ position: "absolute", left: -40, top: 1080, translate: `${interpolate(walk, [0, 1], [-500, 0])}px ${f < SCRATCH ? -Math.abs(Math.sin(f / 2.5)) * 30 : 0}px` }}>
        <Tony expression={expr} hat="party" hatDroop={droop} shades={f < SCRATCH} size={600} />
      </div>
      {f >= SCRATCH && f < SCRATCH + 12 && <AbsoluteFill style={{ background: CAST.paper, opacity: interpolate(f, [SCRATCH, SCRATCH + 12], [0.6, 0]) }} />}
      <SceneCaptions scene="reveal" />
    </AbsoluteFill>
  );
}

function RescueScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = spring({ frame: f, fps, config: { damping: 10, mass: 0.7 } });
  return (
    <AbsoluteFill style={{ background: "linear-gradient(#5aa9e0, #a9dcf5 55%, #f7e3c0)" }}>
      <Sfx name="whoosh" at={0} volume={0.8} />
      <Sfx name="sparkle" at={14} volume={0.4} />
      {[[140, 560, 1.1], [660, 470, 0.8], [520, 1560, 1.3]].map(([x, y, s], i) => (
        <div key={i} style={{ position: "absolute", left: x + Math.sin(f / 30 + i) * 20, top: y, width: 300 * s, height: 110 * s, borderRadius: 999, background: CAST.paper, opacity: 0.9 }} />
      ))}
      {f < 16 &&
        Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: 0, top: 300 + i * 130, width: 1080, height: 8, background: CAST.paper, opacity: 0.5 * (1 - f / 16), translate: `${((f * 90 + i * 200) % 1600) - 600}px 0px` }} />
        ))}
      <div style={{ position: "absolute", left: 540 - 170, top: 840 - 170, scale: `${interpolate(zoom, [0, 1], [3, 1.3])}` }}>
        <BrandPip size={340} />
      </div>
      <Sequence from={14} layout="none">
        {/* Above the bird, tail down to its head (bird ≈ x 500–690, y 790–970 once settled). */}
        <SpeechBubble x={510} y={540} han={"Leave your\ntones to me!"} hanSize={58} tail="left" />
      </Sequence>
      <div style={{ position: "absolute", left: 10, top: 1330 }}>
        <Tony expression={f >= 20 ? "hopeful" : "crushed"} hat="party" hatDroop={1} size={520} />
      </div>
      <SceneCaptions scene="rescue" />
    </AbsoluteFill>
  );
}

function GameScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 14 } });
  const tony = spring({ frame: f - 8, fps, config: { damping: 11 } });
  const card2 = pGameFrame(PGAME.card2);
  const inTurn = (f >= pGameFrame(PGAME.fly1) && f < pGameFrame(PGAME.done1)) || (f >= pGameFrame(PGAME.fly2) && f < pGameFrame(PGAME.done2));
  return (
    <AbsoluteFill style={{ background: CAST.ink }}>
      <AbsoluteFill style={{ opacity: interpolate(pop, [0, 1], [0, 1]) }}>
        <OffthreadVideo src={staticFile("clips/tony-paidui.mp4")} startFrom={Math.round(PGAME_START * FPS)} muted />
        {/* The card shows the stand-ins (學校 2+4, 對面 4+4); their tone marks already match. */}
        {f < card2 ? <CardPatch pinyin="pái duì" han="排隊" /> : f < pGameFrame(PGAME.done2) && <CardPatch pinyin="pài duì" han="派對" />}
      </AbsoluteFill>
      <Sfx name="ding" at={pGameFrame(PGAME.done1)} />
      <Sfx name="ding" at={pGameFrame(PGAME.done2)} />
      {/* Tony practising on his phone, bottom-right (the bird flies at the left) */}
      <div style={{ position: "absolute", left: 600, top: 1110, translate: `${interpolate(tony, [0, 1], [500, 0])}px 0px` }}>
        <div style={{ position: "absolute", left: 20, top: 30, width: 330, height: 330, borderRadius: 999, background: CAST.paper, border: `10px solid ${inTurn ? CAST.accent : CAST.ink}` }} />
        <div style={{ position: "relative" }}>
          <Tony expression={inTurn ? "hopeful" : "neutral"} holding="phone" talking={inTurn} hat="party" size={450} />
        </div>
      </div>
      <SceneCaptions scene="game" />
    </AbsoluteFill>
  );
}

const SPEAKER_AT = 55;
const BANNER_AT = 75;

/** A boombox with pulsing woofers. */
function Speaker({ f }: { f: number }) {
  const pulse = 1 + Math.max(0, Math.cos((f / 15) * Math.PI * 2)) * 0.12;
  return (
    <svg width="260" height="170" viewBox="0 0 260 170" style={{ overflow: "visible" }}>
      <path d="M70 20 Q130 -20 190 20" stroke={CAST.ink} strokeWidth={12} fill="none" strokeLinecap="round" />
      <rect x="0" y="20" width="260" height="150" rx="26" fill={CAST.ink} />
      {[66, 194].map((cx) => (
        <g key={cx} style={{ transformOrigin: `${cx}px 95px`, scale: `${pulse}` }}>
          <circle cx={cx} cy="95" r="46" fill="#5b5048" stroke={CAST.beak} strokeWidth={8} />
          <circle cx={cx} cy="95" r="16" fill={CAST.beak} />
        </g>
      ))}
      <rect x="112" y="50" width="36" height="20" rx="4" fill={CAST.accent} />
    </svg>
  );
}

function QueuePartyScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const speaker = spring({ frame: f - SPEAKER_AT, fps, config: { damping: 9 } });
  const banner = spring({ frame: f - BANNER_AT, fps, config: { damping: 9 } });
  const dancing = f >= SPEAKER_AT;
  return (
    <AbsoluteFill>
      <Street />
      <Sfx name="pop" at={2} volume={0.4} />
      <Sfx name="pop" at={SPEAKER_AT} />
      <Sfx name="beat" at={SPEAKER_AT + 2} volume={0.7} />
      <Sfx name="tada" at={BANNER_AT} volume={0.35} />
      <Queue danceFrom={SPEAKER_AT + 2} />
      <div style={{ position: "absolute", left: -40, top: 1080, transformOrigin: "50% 100%", translate: `0px ${dancing ? -Math.abs(Math.sin(f / 4.8)) * 40 : 0}px` }}>
        <Tony expression={dancing ? "happy" : "crushed"} hat="party" hatDroop={interpolate(f, [SPEAKER_AT, SPEAKER_AT + 10], [1, 0], clamp)} size={600} />
      </div>
      {f >= SPEAKER_AT && (
        <div style={{ position: "absolute", left: 440, top: 1290, scale: `${speaker}`, transformOrigin: "50% 100%" }}>
          <Speaker f={f - SPEAKER_AT} />
          {[0, 1, 2].map((i) => {
            const t = (f - SPEAKER_AT + i * 10) % 30;
            return (
              <div key={i} style={{ position: "absolute", left: 40 + i * 80, top: -20 - t * 6, opacity: 1 - t / 30, fontSize: 64, color: CAST.ink }}>
                ♪
              </div>
            );
          })}
        </div>
      )}
      {f < BANNER_AT + 4 && (
        <div style={{ position: "absolute", inset: 0, opacity: interpolate(f, [BANNER_AT - 2, BANNER_AT + 4], [1, 0], clamp) }}>
          <SpeechBubble x={60} y={560} tail="left" han={"你想開派對喔?\n在排隊也可以開派對啊!\n台灣人最愛排隊了~"} hanSize={54} />
        </div>
      )}
      {f >= BANNER_AT && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 740, display: "flex", justifyContent: "center", paddingRight: 60 }}>
          <div style={{ scale: `${banner}`, rotate: `${-4 + Math.sin(f / 5) * 2}deg`, background: RED, color: CAST.paper, border: `12px solid ${CAST.ink}`, borderRadius: 40, padding: "16px 46px", fontFamily: HAN, fontWeight: 900, fontSize: 112, boxShadow: "0 14px 0 rgba(36,29,21,0.3)" }}>
            排隊派對 🎉
          </div>
        </div>
      )}
      <SceneCaptions scene="queueParty" />
    </AbsoluteFill>
  );
}

function CtaScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({ frame: f - 4, fps, config: { damping: 12 } });
  const bird = spring({ frame: f - 14, fps, config: { damping: 8 } });
  return (
    <AbsoluteFill>
      <Street dim={0.3} />
      <Sfx name="pop" at={4} />
      <Sfx name="boing" at={14} volume={0.35} />
      <Sfx name="beat" at={0} volume={0.5} />
      <Sfx name="beat" at={75} volume={0.5} />
      <Queue danceFrom={-20} />
      <div style={{ position: "absolute", left: -40, top: 1080, translate: `0px ${-Math.abs(Math.sin(f / 4.8)) * 40}px` }}>
        <Tony expression="happy" hat="party" size={600} />
      </div>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 600, paddingRight: 60 }}>
        <div style={{ position: "relative", scale: `${card}` }}>
          <div style={{ position: "absolute", left: "50%", top: -320, marginLeft: -190, scale: `${bird}`, translate: `0px ${Math.sin(f / 5) * 10}px` }}>
            <BrandPip size={380} />
          </div>
          <div style={{ background: CAST.paper, border: `12px solid ${CAST.ink}`, borderRadius: 56, padding: "46px 60px", textAlign: "center", boxShadow: "0 16px 0 rgba(0,0,0,0.3)" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 112, color: CAST.accent, lineHeight: 1.05 }}>FlappyTone</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 48, color: CAST.ink, opacity: 0.8, marginTop: 14 }}>One tone makes the difference</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 62, color: CAST.beak, marginTop: 16 }}>flappytone.com</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

const COMPONENT: Record<PartyScene, () => React.JSX.Element> = {
  hook: HookScene,
  bored: BoredScene,
  call: CallScene,
  mishear: MishearScene,
  glowup: GlowUpScene,
  reveal: RevealScene,
  rescue: RescueScene,
  game: GameScene,
  queueParty: QueuePartyScene,
  cta: CtaScene,
};

export function PartyStory({ captions, voices, sfx }: TonyStoryProps) {
  let from = 0;
  return (
    <Layers.Provider value={{ captions: captions ?? true, voices: voices ?? true, sfx: sfx ?? true }}>
      <AbsoluteFill style={{ background: CAST.ink }}>
        {PARTY_ORDER.map((key) => {
          const at = from;
          from += P[key];
          const Scene = COMPONENT[key];
          return (
            <Sequence key={key} from={at} durationInFrames={P[key]} name={key}>
              <Scene />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </Layers.Provider>
  );
}

/** Cover image: Tony in his party hat at the back of the 雞排 queue. Render with `remotion still ThumbParty`. */
export function ThumbParty() {
  return (
    <AbsoluteFill>
      <Street />
      <Queue />
      <div style={{ position: "absolute", left: -40, top: 1080 }}>
        <Tony expression="shocked" hat="party" hatDroop={0.6} size={600} />
      </div>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(36,29,21,0.55) 0%, rgba(36,29,21,0) 30%)" }} />
      <div style={{ position: "absolute", top: 150, left: 70, right: 70, textAlign: "center", fontFamily: DISPLAY, fontWeight: 600, fontSize: 108, lineHeight: 1.05, color: "#fff", textShadow: "0 6px 0 rgba(36,29,21,0.55), 0 10px 40px rgba(0,0,0,0.35)" }}>
        Taiwanese love to queue <span style={{ color: "#ffd48a" }}>(and party)</span> 🇹🇼
      </div>
      <div style={{ position: "absolute", right: 60, top: 1500, padding: "20px 36px", borderRadius: 36, background: CAST.paper, border: `10px solid ${CAST.ink}`, rotate: "-4deg", boxShadow: "0 12px 30px rgba(0,0,0,0.25)", fontFamily: HAN, fontWeight: 900, fontSize: 72, lineHeight: 1.15 }}>
        <div style={{ color: CAST.accent }}>排隊 ↗</div>
        <div style={{ color: RED }}>派對 ↘</div>
      </div>
    </AbsoluteFill>
  );
}
