/**
 * Brief 48, go-live step 3(b): write the one-ruler target shapes
 * (`src/dev/local/shapes-v2.json`, brief 43) into `word_clips`, and fix the
 * misleading `words.meta.reference` (it names the natural session on textbook
 * words, Phase A §3).
 *
 *   npm run golive-shapes                          # DRY RUN (default): reads only, writes nothing
 *   npm run golive-shapes -- --backup              # step 3(a): reads, writes a dated local backup file only
 *   npm run golive-shapes -- --apply --from <file> # step 3(b): ONLY on Pierre's explicit yes
 *
 * The dry run reads `word_clips` and `words.meta` for the default speaker and
 * prints row counts and three spot checks. It writes nothing: not to
 * Supabase, not to R2, not to disk.
 *
 * `--apply` refuses to run unless `--from` names a backup made by `--backup`
 * whose row count matches the live rows. It UPDATEs (never upserts) only
 * `polyline`, `contour`, `onset_s`, `duration_s` per (word_id, speaker, style),
 * and `words.meta.reference` / `meta.references[speaker]`. Clip audio,
 * `clip_s`, `status`, `min_tier` and every other column stay as they are.
 * Roll back: `--restore <file>` writes the backup's values back.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_SPEAKER_ID } from "../data/catalogRows.ts";
import type { Json } from "../data/database.types.ts";
import { serviceClient } from "./serviceClient.ts";

const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode: "dry" | "backup" | "apply" | "restore" = flag("--apply")
  ? "apply"
  : flag("--restore")
    ? "restore"
    : flag("--backup")
      ? "backup"
      : "dry";

type Style = "textbook" | "natural";
interface Shape {
  polyline: [number, number][];
  contour?: [number, number][];
  onset_s: number;
  duration_s: number;
  adjusted?: string;
}
interface ShapesFile {
  ruler: { middleHz: number; upSemitones: number; downSemitones: number; source?: string };
  textbook: Record<string, Shape>;
  natural: Record<string, Shape>;
}
interface ClipRow {
  word_id: string;
  style: string;
  status: string;
  clip_s: number | null;
  onset_s: number | null;
  duration_s: number | null;
  polyline: Json | null;
  contour: Json | null;
}
interface MetaRow {
  id: string;
  meta: Json | null;
}

const shapes = JSON.parse(readFileSync(`${root}src/dev/local/shapes-v2.json`, "utf8")) as ShapesFile;
const speaker = DEFAULT_SPEAKER_ID;

/** The textbook ruler as a stored reference. `rangeSemitones` is the mean half, so old readers stay valid. */
const newReference = {
  session: "one-ruler-brief-43",
  f0Center: shapes.ruler.middleHz,
  rangeSemitones: (shapes.ruler.upSemitones + shapes.ruler.downSemitones) / 2,
  upSemitones: shapes.ruler.upSemitones,
  downSemitones: shapes.ruler.downSemitones,
  style: "textbook",
};

const supabase = serviceClient();

async function readClips(): Promise<ClipRow[]> {
  const out: ClipRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("word_clips")
      .select("word_id,style,status,clip_s,onset_s,duration_s,polyline,contour")
      .eq("speaker_id", speaker)
      .order("word_id")
      .order("style")
      .range(from, from + 999);
    if (error) throw new Error(`word_clips select failed: ${error.message}`);
    out.push(...((data ?? []) as ClipRow[]));
    if (!data || data.length < 1000) return out;
  }
}

async function readMeta(ids: string[]): Promise<MetaRow[]> {
  const out: MetaRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("words").select("id,meta").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`words meta select failed: ${error.message}`);
    out.push(...((data ?? []) as MetaRow[]));
  }
  return out;
}

function fits(s: Shape | undefined, clipS: number | null): s is Shape {
  return (
    !!s &&
    Array.isArray(s.polyline) &&
    s.polyline.length >= 2 &&
    s.duration_s > 0 &&
    s.onset_s >= 0 &&
    (clipS == null || s.onset_s + s.duration_s <= clipS + 0.05)
  );
}

const fmtLine = (p: Json | null) =>
  Array.isArray(p) ? (p as [number, number][]).map(([t, c]) => `${t.toFixed(2)}:${c.toFixed(2)}`).join(" ") : "—";

function plan(rows: ClipRow[]) {
  const published = rows.filter((r) => r.status === "published");
  const updates: { row: ClipRow; shape: Shape }[] = [];
  const noShape: ClipRow[] = [];
  const misfit: ClipRow[] = [];
  for (const r of published) {
    const s = shapes[r.style as Style]?.[r.word_id];
    if (!s) noShape.push(r);
    else if (!fits(s, r.clip_s)) misfit.push(r);
    else updates.push({ row: r, shape: s });
  }
  const live = new Set(published.map((r) => `${r.word_id}/${r.style}`));
  const orphanShapes = (["textbook", "natural"] as Style[]).flatMap((st) =>
    Object.keys(shapes[st]).filter((id) => !live.has(`${id}/${st}`)).map((id) => `${id}/${st}`),
  );
  return { published, updates, noShape, misfit, orphanShapes };
}

function metaPatch(meta: Json | null): Json {
  const m = (meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {}) as Record<string, unknown>;
  const refs = (m.references && typeof m.references === "object" ? m.references : {}) as Record<string, unknown>;
  return { ...m, reference: newReference, references: { ...refs, [speaker]: newReference } } as unknown as Json;
}

const rows = await readClips();
const p = plan(rows);
const textbookIds = [...new Set(p.updates.filter((u) => u.row.style === "textbook").map((u) => u.row.word_id))];
const metas = await readMeta(textbookIds);
const metaChanges = metas.filter((m) => JSON.stringify((m.meta as { reference?: unknown } | null)?.reference) !== JSON.stringify(newReference));

const byStyle = (list: ClipRow[], st: Style) => list.filter((r) => r.style === st).length;
console.log(`MODE: ${mode === "dry" ? "DRY RUN (reads only, writes nothing)" : mode}`);
console.log(`speaker ${speaker}; ruler ${shapes.ruler.middleHz} Hz, up ${shapes.ruler.upSemitones} st, down ${shapes.ruler.downSemitones} st`);
console.log(`word_clips rows for ${speaker}: ${rows.length} (published ${p.published.length}: textbook ${byStyle(p.published, "textbook")}, natural ${byStyle(p.published, "natural")})`);
console.log(`would update: ${p.updates.length} (textbook ${byStyle(p.updates.map((u) => u.row), "textbook")}, natural ${byStyle(p.updates.map((u) => u.row), "natural")})`);
console.log(`kept as they are, no new shape: ${p.noShape.length}${p.noShape.length ? ` (${p.noShape.slice(0, 12).map((r) => `${r.word_id}/${r.style}`).join(", ")}${p.noShape.length > 12 ? ", …" : ""})` : ""}`);
console.log(`kept, new shape does not fit the clip: ${p.misfit.length}${p.misfit.length ? ` (${p.misfit.map((r) => `${r.word_id}/${r.style}`).join(", ")})` : ""}`);
console.log(`new shapes with no published row: ${p.orphanShapes.length}${p.orphanShapes.length ? ` (${p.orphanShapes.slice(0, 12).join(", ")}${p.orphanShapes.length > 12 ? ", …" : ""})` : ""}`);
const lifted = p.updates.filter((u) => u.shape.adjusted).length;
console.log(`of the updates, carry the shared first-tone lift (re-record list): ${lifted}`);
console.log(`words.meta.reference: ${metaChanges.length} of ${metas.length} textbook words would change`);

for (const [id, st] of [
  ["ma1b", "textbook"],
  ["ma4b", "textbook"],
  ["xiaoshi32", "textbook"],
] as [string, Style][]) {
  const r = rows.find((x) => x.word_id === id && x.style === st);
  const s = shapes[st][id];
  console.log(`\nspot check ${id}/${st}`);
  console.log(`  live: onset ${r?.onset_s ?? "—"} dur ${r?.duration_s ?? "—"} line ${fmtLine(r?.polyline ?? null)}`);
  console.log(`  new : onset ${s?.onset_s ?? "—"} dur ${s?.duration_s ?? "—"} line ${fmtLine((s?.polyline as unknown as Json) ?? null)}`);
}

if (mode === "dry") {
  console.log("\nDRY RUN: nothing was written.");
  process.exit(0);
}

const backupDir = `${root}backups`;
if (mode === "backup") {
  if (!existsSync(backupDir)) mkdirSync(backupDir);
  const file = `${backupDir}/word_clips-${speaker}-${new Date().toISOString().slice(0, 10)}.json`;
  const allMeta = await readMeta([...new Set(rows.map((r) => r.word_id))]);
  writeFileSync(file, JSON.stringify({ speaker, takenAt: new Date().toISOString(), clips: rows, meta: allMeta }, null, 0));
  console.log(`\nBackup written: ${file} (${rows.length} clip rows, ${allMeta.length} meta rows). Nothing in Supabase changed.`);
  process.exit(0);
}

const from = value(mode === "apply" ? "--from" : "--restore");
if (!from || !existsSync(from)) {
  console.error(`\n${mode} needs a backup file made by --backup (${mode === "apply" ? "--from <file>" : "--restore <file>"}).`);
  process.exit(1);
}
const backup = JSON.parse(readFileSync(from, "utf8")) as { speaker: string; clips: ClipRow[]; meta: MetaRow[] };
if (backup.speaker !== speaker) {
  console.error(`backup is for ${backup.speaker}, not ${speaker}`);
  process.exit(1);
}

if (mode === "apply") {
  if (backup.clips.length !== rows.length) {
    console.error(`backup has ${backup.clips.length} rows, live has ${rows.length}: take a fresh backup first.`);
    process.exit(1);
  }
  for (const { row, shape } of p.updates) {
    const { error } = await supabase
      .from("word_clips")
      .update({
        polyline: shape.polyline as unknown as Json,
        contour: (shape.contour ?? row.contour) as unknown as Json,
        onset_s: shape.onset_s,
        duration_s: shape.duration_s,
      })
      .eq("word_id", row.word_id)
      .eq("speaker_id", speaker)
      .eq("style", row.style);
    if (error) throw new Error(`word_clips update failed for ${row.word_id}/${row.style}: ${error.message}`);
  }
  for (const m of metas) {
    const { error } = await supabase.from("words").update({ meta: metaPatch(m.meta) }).eq("id", m.id);
    if (error) throw new Error(`words meta update failed for ${m.id}: ${error.message}`);
  }
  console.log(`\nApplied: ${p.updates.length} clip rows, ${metas.length} meta rows. Next: npm run export-fallback.`);
} else {
  for (const r of backup.clips) {
    const { error } = await supabase
      .from("word_clips")
      .update({ polyline: r.polyline, contour: r.contour, onset_s: r.onset_s, duration_s: r.duration_s })
      .eq("word_id", r.word_id)
      .eq("speaker_id", speaker)
      .eq("style", r.style);
    if (error) throw new Error(`restore failed for ${r.word_id}/${r.style}: ${error.message}`);
  }
  for (const m of backup.meta) {
    const { error } = await supabase.from("words").update({ meta: m.meta }).eq("id", m.id);
    if (error) throw new Error(`restore meta failed for ${m.id}: ${error.message}`);
  }
  console.log(`\nRestored ${backup.clips.length} clip rows and ${backup.meta.length} meta rows from ${from}. Next: npm run export-fallback.`);
}
