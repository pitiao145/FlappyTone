/**
 * Turns recorded takes into published clips: R2 in, R2 + the catalog out.
 *
 *   npm run process-clips                      # every status='recorded' word
 *   npm run process-clips -- --session 2026-09-01-ab12cd
 *   npm run process-clips -- --all             # re-cut the published ones too
 *   npm run process-clips -- --all --dry-run   # cut everything, write nothing
 *
 * Replaces `pull-recordings` + `make-clips`. The measurement in the middle is
 * the same code, unchanged: `cutClip` reads the take, `clipNormalize` places
 * each tone's cohort at the Chao levels the tone is defined at, `clipReview`
 * flags what looks wrong. Only the two ends moved — the input is the `words`
 * table and the `flappytone-raw` bucket instead of a directory, and the output
 * is the `flappytone-clips` bucket and the row instead of `public/ref/` and a
 * manifest.
 *
 * ## Three clocks, still not folded together
 *
 *   duration_s  the tone window — what the corridor is measured over and how
 *               long the gate lasts
 *   onset_s     file start → tone start; the consonant in front of it
 *   clip_s      the WHOLE file — what freezes the world while the cue plays
 *
 * `clip_s` is NOT `onset_s + duration_s`: the take carries audio after the
 * tone window ends too, and a cue whose length is read from the tone window
 * plays its own tail into a live mic. See the table in docs/DECISIONS.md.
 * These have been conflated by mistake twice; the columns are written from
 * three separate fields of one `CutClip` for exactly that reason.
 *
 * ## The cohort is the whole tone, always
 *
 * `clipNormalize` maps a tone's measured span onto its canonical one, and the
 * map is a property of the COHORT, not of any one clip. So even when only two
 * new words are being published, every word of their tone that has a raw take
 * is re-cut, purely to compute that map — otherwise two clips would be
 * normalised against themselves and land somewhere the other twenty-eight are
 * not. Only the selected words' rows are written; the rest are cut and thrown
 * away.
 *
 * One consequence worth knowing: adding words to a tone moves that tone's map
 * slightly, so the newly published rows are normalised under a map the older
 * ones were not. The script says so when it happens; `--all` re-publishes the
 * whole cohort under one map.
 *
 * ## A flagged clip is still written
 *
 * `clipReview` flags, it never blocks (CLAUDE.md). The report is for a human
 * to read — a wrong flag costs a glance, a suppressed clip costs a recording
 * session.
 *
 * ## The pitch reference is measured per session
 *
 * Never read from `speakers.json`: pitch drifts between sittings, and a centre
 * measured a session earlier pins half a cohort flat against chao 5. A session
 * with fewer than `MIN_REFERENCE_FRAMES` voiced frames has nothing to measure
 * from, so it borrows the reference of the most recently published word and
 * says so loudly in the report.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  contourLine,
  cutClip,
  measurePitchReference,
  templateContour,
  FADE_MS,
  MEASURE_RANGE_SEMITONES,
  type ContourPoint,
  type PitchReference,
} from "./clipCut.ts";
import {
  applyChaoMap,
  chaoMapFor,
  cohortSpan,
  pinnedFractionOf,
  polylineSpan,
} from "./clipNormalize.ts";
import { MIN_REFERENCE_FRAMES, SEED_F0_CENTER } from "./clipPipeline.ts";
import { median, reviewClip } from "./clipReview.ts";
import { DEFAULT_POLYLINES } from "../game/tuning.ts";
import type { Tone } from "../game/gates.ts";
import { decodeWav, encodeWav } from "./wav.ts";
import { r2Get, r2Put } from "./r2.ts";
import { serviceClient } from "./serviceClient.ts";

/**
 * `SEED_F0_CENTER` and `MIN_REFERENCE_FRAMES` live in `clipPipeline.ts`, not
 * here: this script opens a Supabase client and awaits at top level, so no
 * test can import it, and the seed is the one value in this pipeline that
 * silently moves every shipped corridor when it changes. See
 * `clipPipeline.test.ts`, which pins the number AND the cut it produces.
 */

const root = new URL("../../", import.meta.url).pathname;
const recordingsDir = `${root}fixtures/recordings`;
const clipsDir = `${root}fixtures/clips`;

const args = process.argv.slice(2);
const all = args.includes("--all");
const dryRun = args.includes("--dry-run");
const sessionIdx = args.indexOf("--session");
// A flag is not a session id. Taking the next token blindly means
// `-- --session --dry-run` silently filters on the session "--dry-run",
// matches nothing, and reports "nothing to process" as if that were the
// truth. Same guard as `--only` in the Task 8 scripts.
if (sessionIdx !== -1 && (!args[sessionIdx + 1] || args[sessionIdx + 1].startsWith("--"))) {
  throw new Error(
    `--session needs a session id, got ${args[sessionIdx + 1] ? `"${args[sessionIdx + 1]}"` : "nothing"}.`,
  );
}
const onlySession = sessionIdx !== -1 ? args[sessionIdx + 1] : null;

const supabase = serviceClient();

interface Row {
  id: string;
  tone: number;
  status: string;
  raw_key: string | null;
  recorded_session: string | null;
}

const { data: allRows, error: rowsError } = await supabase
  .from("words")
  .select("id,tone,status,raw_key,recorded_session")
  .order("position", { ascending: true });
if (rowsError) throw new Error(`words select failed: ${rowsError.message}`);

const catalog = (allRows ?? []) as Row[];

/** Everything with audio in the raw bucket, whatever its status. */
function hasTake(row: Row): boolean {
  return Boolean(row.raw_key && row.recorded_session);
}

const wantedStatus = all ? new Set(["recorded", "published"]) : new Set(["recorded"]);
const selected = catalog.filter(
  (r) =>
    hasTake(r) &&
    wantedStatus.has(r.status) &&
    (!onlySession || r.recorded_session === onlySession),
);

if (selected.length === 0) {
  console.log(
    `Nothing to process: no words with status ${[...wantedStatus].join("/")}` +
      (onlySession ? ` in session ${onlySession}` : "") +
      ` have a raw take. (Pass --all to re-cut published words.)`,
  );
  process.exit(0);
}

const selectedIds = new Set(selected.map((r) => r.id));
const tonesTouched = new Set(selected.map((r) => r.tone));
// See the header: the chao map belongs to the cohort, so the whole tone is cut
// even when only part of it is written.
const toCut = catalog.filter(
  (r) => hasTake(r) && tonesTouched.has(r.tone) && ["recorded", "published"].includes(r.status),
);
const cohortOnly = toCut.length - selected.length;

// ------------------------------------------------------------- the audio

function localPath(row: Row): string {
  return `${recordingsDir}/${row.recorded_session}/${row.id}.wav`;
}

const missing = toCut.filter((r) => !existsSync(localPath(r)));
if (missing.length && dryRun) {
  console.error(
    `--dry-run writes nothing, and ${missing.length} raw take(s) are not on disk:\n  ` +
      missing.map((r) => `${r.recorded_session}/${r.id}.wav`).join("\n  ") +
      `\n\nRun without --dry-run (which caches them under fixtures/recordings/) first.`,
  );
  process.exit(1);
}
for (const row of missing) {
  // fixtures/recordings/ is the local evidence cache, gitignored and
  // re-pullable: the raw take is what you go back to when a clip comes out
  // wrong, so it stays on disk rather than being streamed and forgotten.
  mkdirSync(`${recordingsDir}/${row.recorded_session}`, { recursive: true });
  console.log(`pulling ${row.raw_key}`);
  r2Get("flappytone-raw", row.raw_key!, localPath(row));
}

/**
 * The take itself, with click-free edges — this is what ships. Nothing is
 * removed: the clip IS the recording (9 Aug 2026, see docs/DECISIONS.md).
 * Voicing defines the corridor, not what the player hears.
 */
function fadeEdges(samples: Float32Array, sampleRate: number): Float32Array {
  const out = samples.slice();
  const fade = Math.round((FADE_MS / 1000) * sampleRate);
  for (let i = 0; i < fade && i < out.length; i++) {
    out[i] *= i / fade;
    out[out.length - 1 - i] *= i / fade;
  }
  return out;
}

interface Take {
  row: Row;
  samples: Float32Array;
  sampleRate: number;
}

const takesBySession = new Map<string, Take[]>();
for (const row of toCut) {
  const { samples, sampleRate } = decodeWav(new Uint8Array(readFileSync(localPath(row))));
  const session = row.recorded_session!;
  if (!takesBySession.has(session)) takesBySession.set(session, []);
  takesBySession.get(session)!.push({ row, samples, sampleRate });
}

// --------------------------------------------- the voice, per session

/**
 * Decision 9's fallback: the reference of the most recently published word.
 *
 * A measurement of a different sitting is wrong, but it is wrong by drift —
 * where the tracker's bare default is wrong by whoever's voice it was tuned
 * for. Looked up lazily so a healthy run never pays for it.
 */
let borrowedReference: PitchReference | null | undefined;
async function referenceOfLastPublished(): Promise<PitchReference | null> {
  if (borrowedReference !== undefined) return borrowedReference;
  const { data, error } = await supabase
    .from("words")
    .select("id,meta,updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`words meta select failed: ${error.message}`);
  borrowedReference = null;
  for (const row of data ?? []) {
    const meta = row.meta as { reference?: { f0Center?: unknown; rangeSemitones?: unknown } } | null;
    const ref = meta?.reference;
    if (typeof ref?.f0Center === "number" && typeof ref?.rangeSemitones === "number") {
      borrowedReference = { f0Center: ref.f0Center, rangeSemitones: ref.rangeSemitones, frames: 0 };
      break;
    }
  }
  return borrowedReference;
}

interface SessionReference extends PitchReference {
  /** Null when measured from this session's own takes. */
  borrowedFrom: string | null;
}

const referenceBySession = new Map<string, SessionReference>();
const referenceNotes: string[] = [];

for (const [session, takes] of takesBySession) {
  const measured = measurePitchReference(takes, SEED_F0_CENTER);

  if (measured && measured.frames >= MIN_REFERENCE_FRAMES) {
    referenceBySession.set(session, { ...measured, borrowedFrom: null });
    console.log(
      `\n${session}: ${takes.length} take(s), f0Center ${measured.f0Center.toFixed(1)}Hz, ` +
        `range ±${measured.rangeSemitones} st (${measured.frames} voiced frames)`,
    );
    continue;
  }

  const borrowed = await referenceOfLastPublished();
  if (!borrowed) {
    throw new Error(
      `${session}: only ${measured?.frames ?? 0} voiced frame(s), under the ` +
        `${MIN_REFERENCE_FRAMES}-frame minimum, and no published word has a stored ` +
        `reference to borrow. Record more of this session before processing it.`,
    );
  }
  referenceBySession.set(session, { ...borrowed, borrowedFrom: "the last published word" });
  const note =
    `${session}: only ${measured?.frames ?? 0} voiced frame(s), under the ` +
    `${MIN_REFERENCE_FRAMES}-frame minimum — borrowed f0Center ` +
    `${borrowed.f0Center.toFixed(1)}Hz / ±${borrowed.rangeSemitones} st from the last ` +
    `published word instead of measuring this session (Decision 9).`;
  referenceNotes.push(note);
  console.log(`\n⚠ ${note}`);
}

// ------------------------------------------------------------- the cut

interface Cut {
  row: Row;
  tone: Tone;
  session: string;
  reference: SessionReference;
  durationMs: number;
  onsetMs: number;
  clipMs: number;
  contour: ContourPoint[];
  pinnedFraction: number;
  samples: Float32Array;
  sampleRate: number;
}

const cuts: Cut[] = [];
const failed: string[] = [];

for (const [session, takes] of takesBySession) {
  const reference = referenceBySession.get(session)!;
  for (const { row, samples, sampleRate } of takes) {
    const tone = row.tone as Tone;
    try {
      const clip = cutClip(samples, sampleRate, reference.f0Center, MEASURE_RANGE_SEMITONES, tone);
      cuts.push({
        row,
        tone,
        session,
        reference,
        durationMs: clip.durationMs,
        // From the start of the *file*, not of the cut: the file is the take.
        onsetMs: clip.toneStartMs,
        clipMs: clip.sourceMs,
        contour: clip.contour,
        pinnedFraction: clip.pinnedFraction,
        samples: fadeEdges(samples, sampleRate),
        sampleRate,
      });
    } catch (err) {
      failed.push(`${session}/${row.id}.wav: ${(err as Error).message}`);
    }
  }
}

if (cuts.length === 0) {
  console.error("Nothing could be cut.");
  for (const f of failed) console.error(`  ${f}`);
  process.exit(1);
}

// ---- Place each tone's cohort at the Chao levels that tone is defined at.
//
// Measured shape, canonical height. See clipNormalize.ts for why the height is
// not measured: hers puts a "high level" T1 at chao 3.3. One map per tone, so
// the differences between a tone's words survive; only the cohort as a whole
// moves.
for (const tone of [1, 2, 3, 4] as Tone[]) {
  const cohort = cuts.filter((c) => c.tone === tone);
  if (cohort.length === 0) continue;
  const span = cohortSpan(cohort.map((c) => c.contour));
  const target = polylineSpan(DEFAULT_POLYLINES[tone]);
  const map = chaoMapFor(span, target);
  for (const cut of cohort) {
    cut.contour = applyChaoMap(cut.contour, map);
    cut.pinnedFraction = pinnedFractionOf(cut.contour);
  }
  console.log(
    `T${tone}: measured ${span.low.toFixed(2)}–${span.high.toFixed(2)} chao -> ` +
      `${target.low.toFixed(2)}–${target.high.toFixed(2)}  (×${map.a.toFixed(2)} ${map.b >= 0 ? "+" : ""}${map.b.toFixed(2)})  ` +
      `from ${cohort.length} take(s)`,
  );
}

// Cohort medians, for the review's duration outlier check.
const medianByTone = new Map<number, number>();
for (const tone of [1, 2, 3, 4]) {
  medianByTone.set(tone, median(cuts.filter((c) => c.tone === tone).map((c) => c.durationMs)));
}

// ------------------------------------------------------------- publish

interface Published {
  id: string;
  clipKey: string;
  durationS: number;
  onsetS: number;
  clipS: number;
  polyline: ContourPoint[];
  contour: ContourPoint[];
  reference: { session: string; f0Center: number; rangeSemitones: number };
  file: string;
}

if (!dryRun) mkdirSync(clipsDir, { recursive: true });

const toPublish: Published[] = [];
let flaggedCount = 0;

for (const cut of [...cuts].sort((a, b) => a.row.id.localeCompare(b.row.id))) {
  const selectedHere = selectedIds.has(cut.row.id);

  const flags = reviewClip({
    id: cut.row.id,
    tone: cut.tone,
    durationMs: cut.durationMs,
    contour: cut.contour,
    pinnedFraction: cut.pinnedFraction,
    cohortMedianMs: medianByTone.get(cut.tone) ?? 0,
  });

  const mark = flags.length ? "⚠" : " ";
  console.log(
    `${mark} ${selectedHere ? " " : "·"}${cut.row.id.padEnd(10)} T${cut.tone}  ` +
      `${cut.durationMs.toFixed(0).padStart(5)}ms tone / ` +
      `${cut.clipMs.toFixed(0).padStart(5)}ms clip  ` +
      `${String(cut.contour.length).padStart(3)} frames  (${cut.session})`,
  );
  console.log(`    ${contourLine(cut.contour)}`);
  for (const flag of flags) console.log(`    ⚠ ${flag.kind}: ${flag.message}`);
  if (flags.length && selectedHere) flaggedCount++;

  // A flagged clip is still published — clipReview flags, it never blocks.
  if (!selectedHere) continue;

  const file = `${clipsDir}/${cut.row.id}.wav`;
  if (!dryRun) writeFileSync(file, encodeWav(cut.samples, cut.sampleRate));

  toPublish.push({
    id: cut.row.id,
    clipKey: `${cut.row.id}.wav`,
    // The tone window. The gate lasts exactly this long.
    durationS: Number((cut.durationMs / 1000).toFixed(4)),
    // File start → tone start.
    onsetS: Number((cut.onsetMs / 1000).toFixed(3)),
    // The audible clock: the whole file. NOT onsetS + durationS.
    clipS: Number((cut.clipMs / 1000).toFixed(4)),
    // Corridor vertices, in the same [t, chao] form as `tuning().polylines`,
    // so a measured word and a hand-tuned tone default are the same kind of
    // object downstream.
    polyline: templateContour(cut.tone, cut.contour),
    // Every measured voiced frame — the evidence the polyline was fitted to,
    // kept so a better fit can be derived later without re-cutting.
    contour: cut.contour.map(([t, chao]) => [Number(t.toFixed(4)), Number(chao.toFixed(3))]),
    reference: {
      session: cut.session,
      f0Center: Number(cut.reference.f0Center.toFixed(1)),
      rangeSemitones: cut.reference.rangeSemitones,
    },
    file,
  });
}

console.log(
  `\n${toPublish.length} clip(s) to publish` +
    (cohortOnly > 0 ? `, ${cohortOnly} more cut for the cohort map only (marked ·)` : "") +
    ".",
);
if (flaggedCount) console.log(`${flaggedCount} of them flagged above — listen to those.`);
for (const f of failed) console.log(`failed to cut: ${f}`);
for (const note of referenceNotes) console.log(`⚠ ${note}`);

if (dryRun) {
  // One machine-readable line on stdout, so the regression check can diff what
  // was just computed against what the catalog already holds — without this
  // run writing a file anywhere, which is the whole point of --dry-run.
  console.log(
    "\n--dry-run: nothing written to disk, R2 or the catalog.\nDRY_RUN_JSON " +
      JSON.stringify(
        toPublish.map((p) => ({
          id: p.id,
          duration_s: p.durationS,
          onset_s: p.onsetS,
          clip_s: p.clipS,
          polyline: p.polyline,
        })),
      ),
  );
  process.exit(0);
}

for (const clip of toPublish) {
  r2Put("flappytone-clips", clip.clipKey, clip.file);
}

// `meta` is a whole-column write, so anything else already in it would be lost
// by replacing it outright. Nothing but `reference` lives there today; read the
// current value and merge so that stays true by construction rather than by
// luck.
const { data: metaRows, error: metaError } = await supabase
  .from("words")
  .select("id,meta")
  .in(
    "id",
    toPublish.map((c) => c.id),
  );
if (metaError) throw new Error(`words meta select failed: ${metaError.message}`);
const metaById = new Map((metaRows ?? []).map((r) => [r.id, r.meta]));

for (const clip of toPublish) {
  // A narrow UPDATE, never an upsert: `min_tier`, `position`, `raw_key` and
  // everything a human typed stay exactly as they are. `min_tier` in
  // particular defaults open ('free') at import and is not recomputed here —
  // it is the GAME gate, not the visualiser's practice depth. See
  // docs/DECISIONS.md.
  const { error } = await supabase
    .from("words")
    .update({
      clip_key: clip.clipKey,
      duration_s: clip.durationS,
      onset_s: clip.onsetS,
      clip_s: clip.clipS,
      polyline: clip.polyline,
      contour: clip.contour,
      status: "published",
      meta: {
        ...((metaById.get(clip.id) as Record<string, unknown> | null) ?? {}),
        reference: clip.reference,
      },
    })
    .eq("id", clip.id);
  if (error) throw new Error(`words update failed for ${clip.id}: ${error.message}`);
}

console.log(`\nPublished ${toPublish.length} clip(s) to flappytone-clips and the catalog.`);

// The bundled fallback is a snapshot of the published rows, so it is stale the
// moment this finishes. Regenerating it here is what stops that being noticed
// three commits later as "the landing page is missing a word".
// Run as a child process, not imported: `export-fallback.ts` is a script with
// top-level effects and its own `process.exit(1)` on an empty result, and an
// import would either swallow that or take this process down mid-sentence.
execFileSync("node", ["--experimental-strip-types", `${root}src/dev/export-fallback.ts`], {
  cwd: root,
  stdio: "inherit",
});
console.log("\nNow commit src/data/wordsFallback.json");
