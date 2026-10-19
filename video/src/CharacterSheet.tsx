/** Checkpoint sheet for the TonyStory cast: every expression, Pip, the props. */
import { AbsoluteFill } from "remotion";
import { CAST, DumplingPip, Pillow, Steamer, Tony, Vendor, type TonyExpression } from "./Characters.tsx";
import { SANS } from "./Promo.tsx";

const EXPR: TonyExpression[] = ["neutral", "hopeful", "crushed", "epiphany", "happy"];

function Label({ children }: { children: string }) {
  return <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 700, color: CAST.ink, textAlign: "center" }}>{children}</div>;
}

export function CharacterSheet() {
  return (
    <AbsoluteFill style={{ background: CAST.paper, padding: 50, gap: 30 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "40px 30px", paddingTop: 80 }}>
        {EXPR.map((e) => (
          <div key={e}><Tony expression={e} size={420} /><Label>{`Tony · ${e}`}</Label></div>
        ))}
        <div><Tony expression="neutral" talking size={420} /><Label>Tony · talking</Label></div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 40 }}>
        <div><Vendor expression="friendly" size={400} /><Label>Vendor · friendly</Label></div>
        <div><Vendor expression="confused" size={400} /><Label>Vendor · confused</Label></div>
        <div><DumplingPip size={260} /><Label>Dumpling Pip</Label></div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 80 }}>
        <div><Pillow size={240} /><Label>pillow</Label></div>
        <div><Steamer size={260} /><Label>steamer</Label></div>
      </div>
    </AbsoluteFill>
  );
}
