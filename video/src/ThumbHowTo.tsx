/**
 * Cover image for the how-to promo: the title, a real game frame on a tilted
 * card, and Pierre's face from the face cam. Frames come from the recordings
 * (video/public/thumb/). Render with `remotion still ThumbHowTo`.
 */

import { AbsoluteFill, Img, staticFile } from "remotion";
import { BRAND, DISPLAY, SANS } from "./Promo.tsx";

export function ThumbHowTo() {
  return (
    <AbsoluteFill style={{ background: BRAND.surface, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 60%, #fff8e6 0%, rgba(247,241,227,0) 60%)" }} />
      <div style={{ position: "absolute", top: 120, left: 60, right: 60, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 112, lineHeight: 1.02, color: BRAND.ink }}>Learning Mandarin tones</div>
        <div style={{ display: "inline-block", marginTop: 30, padding: "14px 46px 22px", borderRadius: 28, background: BRAND.accent, color: "#fff",
          fontFamily: DISPLAY, fontWeight: 600, fontSize: 104, transform: "rotate(-2deg)", boxShadow: "0 14px 36px rgba(28,122,99,0.35)" }}>
          made fun &amp; easy
        </div>
      </div>
      <div style={{ position: "absolute", left: 150, top: 640, width: 640, height: 1031, borderRadius: 44, overflow: "hidden", transform: "rotate(-4deg)",
        border: "10px solid #fff", boxShadow: "0 30px 80px rgba(36,29,21,0.35)" }}>
        <Img src={staticFile("thumb/game.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ position: "absolute", left: 500, top: 1150, width: 540, height: 540, borderRadius: 280, overflow: "hidden",
        border: "14px solid #fff", boxShadow: "0 30px 70px rgba(36,29,21,0.4)" }}>
        <Img src={staticFile("thumb/face.png")} style={{ width: "112%", height: "112%", marginLeft: "-4%", marginTop: "-2%", objectFit: "cover" }} />
      </div>
      <div style={{ position: "absolute", left: 50, top: 1610, padding: "18px 34px", whiteSpace: "nowrap", borderRadius: 999, background: BRAND.beak, color: "#fff",
        fontFamily: SANS, fontWeight: 700, fontSize: 50, transform: "rotate(-5deg)", boxShadow: "0 12px 30px rgba(0,0,0,0.25)" }}>
        🎤 Fly with your voice
      </div>
      <Img src={staticFile("brand/bird.png")} style={{ position: "absolute", left: 840, top: 600, width: 170, transform: "rotate(-12deg)" }} />
      <div style={{ position: "absolute", bottom: 60, width: "100%", textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 46, color: BRAND.ink, opacity: 0.75 }}>
        flappytone.com
      </div>
    </AbsoluteFill>
  );
}
