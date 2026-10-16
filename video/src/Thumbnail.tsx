/**
 * The promo's cover image: one frame of the real game (rendered by
 * `render-demo --stills`) under the title. Render with `remotion still`.
 */

import { AbsoluteFill, Img, staticFile } from "remotion";
import { BRAND, DISPLAY, SANS } from "./Promo.tsx";

export interface ThumbnailProps {
  /** Path under video/public. */
  image: string;
  title: string;
  subtitle?: string;
  [key: string]: unknown;
}

export function Thumbnail({ image, title, subtitle }: ThumbnailProps) {
  return (
    <AbsoluteFill>
      <Img src={staticFile(image)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(20,40,60,0.55) 0%, rgba(20,40,60,0) 34%)" }} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150, paddingLeft: 70, paddingRight: 70 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 132, lineHeight: 1.02, color: "#fff", textAlign: "center",
          textShadow: "0 6px 0 rgba(36,29,21,0.55), 0 10px 40px rgba(0,0,0,0.35)" }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ marginTop: 34, padding: "18px 40px", borderRadius: 999, background: BRAND.beak, color: "#fff",
            fontFamily: SANS, fontWeight: 700, fontSize: 52, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            {subtitle}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
