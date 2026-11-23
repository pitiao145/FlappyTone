/**
 * Refreshes fixtures/contours/jane-{textbook,natural}-sample.json from the live
 * catalog (reads only). Same word ids as before; the contour, duration and (for
 * natural) every natural polyline are re-read. Made at go-live (brief 51), when
 * `golive-shapes` rewrote every shape on the one ruler.
 *
 *   node --experimental-strip-types src/dev/refresh-contour-fixtures.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { serviceClient } from "./serviceClient.ts";

const supabase = serviceClient();
const DAY = new Date().toISOString().slice(0, 10);

interface Row {
  word_id: string;
  style: string;
  duration_s: number | string;
  contour: unknown;
  polyline: unknown;
  status: string;
}

async function live(style: "textbook" | "natural"): Promise<Map<string, Row>> {
  const { data: speaker, error: se } = await supabase.from("speakers").select("id").eq("is_default", true).single();
  if (se || !speaker) throw new Error(`speakers: ${se?.message}`);
  const out = new Map<string, Row>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("word_clips")
      .select("word_id,style,duration_s,contour,polyline,status")
      .eq("speaker_id", speaker.id)
      .eq("style", style)
      .eq("status", "published")
      .range(from, from + 999);
    if (error) throw new Error(`word_clips: ${error.message}`);
    for (const r of (data ?? []) as Row[]) out.set(r.word_id, r);
    if (!data || data.length < 1000) break;
  }
  return out;
}

for (const style of ["textbook", "natural"] as const) {
  const file = `fixtures/contours/jane-${style}-sample.json`;
  const j = JSON.parse(readFileSync(file, "utf8"));
  const rows = await live(style);
  const missing: string[] = [];
  j.rows = j.rows.map((r: { id: string }) => {
    const l = rows.get(r.id);
    if (!l) {
      missing.push(r.id);
      return r;
    }
    return { ...r, durationS: Number(l.duration_s), contour: l.contour };
  });
  if (missing.length) throw new Error(`${file}: no live row for ${missing.join(", ")}`);
  if (style === "natural" && Array.isArray(j.polylines)) {
    j.polylines = j.polylines.map((p: { id: string }) => {
      const l = rows.get(p.id);
      if (!l) throw new Error(`${file}: no live natural row for polyline ${p.id}`);
      return { ...p, polyline: l.polyline };
    });
  }
  j.source = String(j.source).replace(/pulled [^(w]*?(\(after[^)]*\) )?with:/, `pulled ${DAY} (one ruler, after go-live) with:`);
  writeFileSync(file, JSON.stringify(j));
  console.log(`${file}: ${j.rows.length} rows${style === "natural" ? `, ${j.polylines.length} polylines` : ""}`);
}
