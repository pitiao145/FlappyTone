/**
 * Cartoon cast for TonyStory: Tony (tourist), the night-market vendor, Dumpling
 * Pip (the roster's xiao_long_bao art, animated only), and two props.
 * Flat vector, five colours from the brand palette, thick rounded outlines.
 */

import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/** The whole cast palette: ink, paper, skin (BRAND.md `demo`), accent, beak. */
export const CAST = {
  ink: "#241d15",
  paper: "#f7f1e3",
  skin: "#ebd0aa",
  accent: "#1c7a63",
  beak: "#c98a3c",
} as const;

const STROKE = { stroke: CAST.ink, strokeWidth: 10, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** 1 when the eyes are open, dipping to ~0 for a 4-frame blink every `every` frames. */
function useBlink(every = 84, offset = 0) {
  const f = (useCurrentFrame() + offset) % every;
  return interpolate(f, [0, 2, 4], [1, 0.1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function useTalk(talking: boolean) {
  const f = useCurrentFrame();
  return talking ? (Math.sin(f * 1.1) + 1) / 2 : 0;
}

// ---------------------------------------------------------------- Tony

export type TonyExpression = "neutral" | "hopeful" | "crushed" | "epiphany" | "happy";

const TONY_BROWS: Record<TonyExpression, [string, string]> = {
  neutral: ["M150 168 Q170 160 190 168", "M214 168 Q234 160 254 168"],
  hopeful: ["M150 160 Q170 146 190 156", "M214 156 Q234 146 254 160"],
  crushed: ["M150 172 Q172 168 190 154", "M214 154 Q232 168 254 172"],
  epiphany: ["M148 150 Q170 136 192 148", "M212 148 Q234 136 256 150"],
  happy: ["M150 162 Q170 150 190 162", "M214 162 Q234 150 254 162"],
};

const TONY_MOUTH: Record<TonyExpression, string> = {
  neutral: "M180 238 Q202 246 224 238",
  hopeful: "M176 234 Q202 254 228 234",
  crushed: "M178 248 Q202 232 226 248",
  epiphany: "M188 236 Q202 262 216 236 Q202 230 188 236",
  happy: "M168 228 Q202 274 236 228 Q202 238 168 228",
};

/** Arm rotations (deg) about the shoulder: [left, right]. */
const TONY_ARMS: Record<TonyExpression, [number, number]> = {
  neutral: [8, -8],
  hopeful: [-30, 20],
  crushed: [2, -2],
  epiphany: [8, -130],
  happy: [120, -120],
};

export function Tony({
  expression = "neutral",
  talking = false,
  size = 600,
  holding,
  eyesClosed = false,
}: {
  expression?: TonyExpression;
  talking?: boolean;
  size?: number;
  /** "phone": right arm raised, holding a phone toward his face. */
  holding?: "phone";
  eyesClosed?: boolean;
}) {
  const blinkNow = useBlink(90);
  const blink = eyesClosed ? 0.1 : blinkNow;
  const talk = useTalk(talking);
  const f = useCurrentFrame();
  const sway = Math.sin(f / 12) * 1.5;
  const [la, ra0] = TONY_ARMS[expression];
  const ra = holding === "phone" ? -105 : ra0;
  const headTilt = expression === "crushed" ? 8 : expression === "happy" ? Math.sin(f / 5) * 4 : sway;
  const headDrop = expression === "crushed" ? 14 : 0;
  const mouthOpen = 6 + talk * 20;

  return (
    <svg viewBox="0 0 400 600" width={(size * 400) / 600} height={size} style={{ overflow: "visible" }}>
      {/* body: backpack behind, legs, torso, straps */}
      <g id="body">
        <rect x="104" y="300" width="70" height="150" rx="30" fill={CAST.beak} {...STROKE} />
        <path d="M168 470 L160 560 M236 470 L244 560" {...STROKE} strokeWidth={34} />
        <path d="M168 470 L160 560 M236 470 L244 560" stroke={CAST.accent} strokeWidth={14} strokeLinecap="round" />
        <ellipse cx="150" cy="568" rx="30" ry="14" fill={CAST.ink} />
        <ellipse cx="254" cy="568" rx="30" ry="14" fill={CAST.ink} />
        <rect x="140" y="290" width="124" height="190" rx="54" fill={CAST.paper} {...STROKE} />
        <path d="M162 300 L176 470 M242 300 L228 470" stroke={CAST.beak} strokeWidth={16} strokeLinecap="round" />
        <circle cx="236" cy="372" r="9" fill={CAST.accent} />
      </g>

      {/* arms, each a group rotated about its shoulder */}
      <g id="arms">
        <g style={{ transformOrigin: "150px 316px", rotate: `${la}deg` }}>
          <path d="M150 316 L120 420" {...STROKE} strokeWidth={34} />
          <path d="M150 316 L120 420" stroke={CAST.paper} strokeWidth={14} strokeLinecap="round" />
          <circle cx="118" cy="428" r="20" fill={CAST.skin} {...STROKE} />
        </g>
        <g style={{ transformOrigin: "254px 316px", rotate: `${ra}deg` }}>
          <path d="M254 316 L284 420" {...STROKE} strokeWidth={34} />
          <path d="M254 316 L284 420" stroke={CAST.paper} strokeWidth={14} strokeLinecap="round" />
          {holding === "phone" && (
            <g style={{ transformOrigin: "286px 428px", rotate: "105deg" }}>
              <rect x="256" y="380" width="60" height="104" rx="12" fill={CAST.ink} />
              <rect x="264" y="390" width="44" height="80" rx="6" fill={CAST.accent} />
            </g>
          )}
          <circle cx="286" cy="428" r="20" fill={CAST.skin} {...STROKE} />
        </g>
      </g>

      <g id="head" style={{ transformOrigin: "202px 290px", rotate: `${headTilt}deg`, translate: `0px ${headDrop}px` }}>
        <circle cx="202" cy="196" r="96" fill={CAST.skin} {...STROKE} />
        <ellipse cx="108" cy="206" rx="14" ry="20" fill={CAST.skin} {...STROKE} />
        <ellipse cx="296" cy="206" rx="14" ry="20" fill={CAST.skin} {...STROKE} />
        {/* cap */}
        <g style={{ translate: "0px -22px" }}>
        <path d="M110 160 Q118 72 206 74 Q290 76 296 160 Z" fill={CAST.accent} {...STROKE} />
        <path d="M206 150 Q300 132 350 160 Q300 176 206 164 Z" fill={CAST.accent} {...STROKE} />
        <circle cx="206" cy="78" r="9" fill={CAST.beak} {...STROKE} strokeWidth={6} />
        </g>

        <g id="eyes">
          {[170, 234].map((cx) => (
            <g key={cx} style={{ transformOrigin: `${cx}px 196px`, scale: `1 ${blink}` }}>
              <ellipse cx={cx} cy="196" rx="16" ry={expression === "epiphany" ? 22 : 18} fill={CAST.paper} {...STROKE} strokeWidth={6} />
              <circle cx={cx + 3} cy={expression === "crushed" ? 202 : 196} r="8" fill={CAST.ink} />
            </g>
          ))}
        </g>
        <g id="brows">
          {TONY_BROWS[expression].map((d) => (
            <path key={d} d={d} {...STROKE} fill="none" />
          ))}
        </g>
        <ellipse cx="202" cy="214" rx="12" ry="9" fill={CAST.beak} opacity={0.5} />
        <g id="mouth">
          {talking ? (
            <ellipse cx="202" cy="242" rx="18" ry={mouthOpen} fill={CAST.ink} />
          ) : (
            <path d={TONY_MOUTH[expression]} {...STROKE} strokeWidth={8} fill={expression === "happy" || expression === "epiphany" ? CAST.ink : "none"} />
          )}
        </g>
      </g>

      {expression === "epiphany" && <Lightbulb />}
    </svg>
  );
}

function Lightbulb() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 9 } });
  const glow = 0.5 + Math.sin(f / 4) * 0.2;
  return (
    <g style={{ transformOrigin: "300px 60px", scale: `${pop}` }}>
      <circle cx="300" cy="10" r="70" fill={CAST.beak} opacity={glow} />
      <path d="M300 -40 Q340 -40 340 4 Q340 26 318 42 L282 42 Q260 26 260 4 Q260 -40 300 -40 Z" fill={CAST.paper} {...STROKE} />
      <rect x="284" y="44" width="32" height="22" rx="6" fill={CAST.ink} />
      {[-60, -20, 20, 60].map((a) => (
        <path key={a} d="M300 -60 L300 -82" {...STROKE} style={{ transformOrigin: "300px 4px", rotate: `${a}deg` }} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------- Vendor

export type VendorExpression = "friendly" | "confused";

export function Vendor({ expression = "friendly", size = 600 }: { expression?: VendorExpression; size?: number }) {
  const blink = useBlink(110, 40);
  const f = useCurrentFrame();
  const confused = expression === "confused";
  const tilt = confused ? -10 : Math.sin(f / 14) * 2;
  return (
    <svg viewBox="0 0 400 600" width={(size * 400) / 600} height={size} style={{ overflow: "visible" }}>
      <g id="body">
        <path d="M120 560 Q120 300 202 300 Q284 300 284 560 Z" fill={CAST.accent} {...STROKE} />
        <path d="M150 380 L254 380 L264 560 L140 560 Z" fill={CAST.paper} {...STROKE} />
        <path d="M170 380 Q202 420 234 380" stroke={CAST.beak} strokeWidth={8} fill="none" strokeLinecap="round" />
      </g>
      <g id="arms">
        <path d="M140 340 Q100 420 150 450" {...STROKE} strokeWidth={30} fill="none" />
        <path d="M140 340 Q100 420 150 450" stroke={CAST.accent} strokeWidth={12} fill="none" strokeLinecap="round" />
        <g style={{ transformOrigin: "264px 340px", rotate: "0deg" }}>
          <path d="M264 340 Q304 420 254 450" {...STROKE} strokeWidth={30} fill="none" />
          <path d="M264 340 Q304 420 254 450" stroke={CAST.accent} strokeWidth={12} fill="none" strokeLinecap="round" />
        </g>
      </g>
      <g id="head" style={{ transformOrigin: "202px 296px", rotate: `${tilt}deg` }}>
        {/* hair bun behind */}
        <circle cx="202" cy="92" r="40" fill={CAST.ink} />
        <circle cx="202" cy="196" r="92" fill={CAST.skin} {...STROKE} />
        <path d="M110 190 Q110 104 202 104 Q294 104 294 190 Q250 140 202 150 Q150 140 110 190 Z" fill={CAST.ink} {...STROKE} />
        <g id="eyes" style={{ transformOrigin: "202px 204px", scale: `1 ${blink}` }}>
          <circle cx="170" cy="204" r="10" fill={CAST.ink} />
          <circle cx="234" cy="204" r="10" fill={CAST.ink} />
        </g>
        <g id="brows">
          {confused ? (
            <>
              <path d="M152 178 Q170 168 188 176" {...STROKE} strokeWidth={8} fill="none" />
              <path d="M216 170 Q234 182 252 176" {...STROKE} strokeWidth={8} fill="none" />
            </>
          ) : (
            <>
              <path d="M154 180 Q170 172 186 180" {...STROKE} strokeWidth={8} fill="none" />
              <path d="M218 180 Q234 172 250 180" {...STROKE} strokeWidth={8} fill="none" />
            </>
          )}
        </g>
        <circle cx="150" cy="232" r="14" fill={CAST.beak} opacity={0.45} />
        <circle cx="254" cy="232" r="14" fill={CAST.beak} opacity={0.45} />
        <g id="mouth">
          {confused ? (
            <path d="M184 250 Q194 240 204 250 Q214 260 222 248" {...STROKE} strokeWidth={8} fill="none" />
          ) : (
            <path d="M178 240 Q202 266 226 240" {...STROKE} strokeWidth={8} fill="none" />
          )}
        </g>
        {confused && (
          <text x="300" y="110" fontSize="90" fontWeight={900} fill={CAST.beak} stroke={CAST.ink} strokeWidth={6} paintOrder="stroke" fontFamily="sans-serif">
            ?
          </text>
        )}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- Pip

/** Dumpling Pip: the roster art, animated only (bob, tilt, squash/stretch). Beak tip at (0.9991, 0.5098). */
export const PIP_BEAK = { x: 0.9991, y: 0.5098 };

export function DumplingPip({ size = 300, tilt = 0, flapSpeed = 1 }: { size?: number; tilt?: number; flapSpeed?: number }) {
  const f = useCurrentFrame() * flapSpeed;
  const phase = Math.sin(f / 3.2);
  const bob = phase * size * 0.05;
  const sx = 1 + phase * 0.06;
  const sy = 1 - phase * 0.06;
  return (
    <Img
      src={staticFile("assets/xiao_long_bao.webp")}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        translate: `0px ${bob}px`,
        rotate: `${tilt + phase * 4}deg`,
        scale: `${sx} ${sy}`,
      }}
    />
  );
}

// ---------------------------------------------------------------- Props

export function Pillow({ size = 260 }: { size?: number }) {
  return (
    <svg viewBox="0 0 300 200" width={size} height={(size * 200) / 300} style={{ overflow: "visible" }}>
      <path d="M30 40 Q150 10 270 40 Q290 100 270 160 Q150 190 30 160 Q10 100 30 40 Z" fill={CAST.paper} {...STROKE} />
      <path d="M90 80 Q110 100 90 120 M210 80 Q190 100 210 120" stroke={CAST.skin} strokeWidth={8} fill="none" strokeLinecap="round" />
      <text x="150" y="122" textAnchor="middle" fontSize="44" fill={CAST.accent} fontFamily="sans-serif" fontWeight={700}>
        z z
      </text>
    </svg>
  );
}

export function Steamer({ size = 280, open = true }: { size?: number; open?: boolean }) {
  const f = useCurrentFrame();
  return (
    <svg viewBox="0 0 300 240" width={size} height={(size * 240) / 300} style={{ overflow: "visible" }}>
      {/* steam */}
      {[110, 150, 190].map((x, i) => (
        <path
          key={x}
          d={`M${x} 80 Q${x - 14} 50 ${x} 30 Q${x + 14} 10 ${x} -14`}
          stroke={CAST.skin}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          opacity={0.5 + 0.4 * Math.sin(f / 6 + i)}
          style={{ translate: `0px ${-((f + i * 10) % 30) / 3}px` }}
        />
      ))}
      {open &&
        [100, 150, 200].map((x) => (
          <g key={x}>
            <path d={`M${x - 32} 112 Q${x} 40 ${x + 32} 112 Z`} fill={CAST.paper} {...STROKE} strokeWidth={7} />
            <path d={`M${x} 58 L${x - 10} 100 M${x} 58 L${x + 10} 100`} stroke={CAST.skin} strokeWidth={5} strokeLinecap="round" />
          </g>
        ))}
      <path d="M30 116 L270 116 L256 200 Q150 216 44 200 Z" fill={CAST.beak} {...STROKE} />
      <path d="M38 150 L262 150" stroke={CAST.ink} strokeWidth={6} />
      <path d="M30 116 L270 116" {...STROKE} />
    </svg>
  );
}
