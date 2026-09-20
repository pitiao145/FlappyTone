/**
 * Turns recorded takes into published clips: R2 in, R2 + the catalog out.
 *
 *   npm run process-clips -- --speaker jane                 # her recorded words
 *   npm run process-clips -- --speaker jane --session 2026-09-01-ab12cd
 *   npm run process-clips -- --speaker jane --all           # re-cut published too
 *   npm run process-clips -- --speaker jane --all --dry-run # cut, write nothing
 *
 * ## `--speaker` is required, and unknown ids exit non-zero
 *
 * Since the voice roster there is no such thing as "the" recording of a word:
 * `word_clips` is keyed `(word_id, speaker_id)` and every measurement below —
 * the pitch seed, the session reference, the cohort chao map, the review's
 * duration medians — is a property of ONE voice. Defaulting the flag would
 * mean a forgotten argument silently normalises a male cohort against Jane's
 * map and writes the result over her rows. So it is required, and validated
 * against the `speakers` table rather than taken on trust.
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
 * ## The pitch reference is measured per session; the SEED is per speaker
 *
 * Never read from `speakers.json`: pitch drifts between sittings, and a centre
 * measured a session earlier pins half a cohort flat against chao 5. A session
 * with fewer than `MIN_REFERENCE_FRAMES` voiced frames has nothing to measure
 * from, so it borrows the reference of this speaker's most recently published
 * word and says so loudly in the report.
 *
 * The search SEED is the other thing, and it is per speaker: `speakers.f0_seed`
 * through `resolveSeed`. Jane's row holds the literal 168 the pipeline has
 * always used, so her measurements are unmoved; a male speaker gets a band
 * centred on his own register instead of nearly an octave above it. See
 * `clipPipeline.ts`.
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
  cohortTargetSpan,
  pinnedFractionOf,
} from "./clipNormalize.ts";
import { MIN_REFERENCE_FRAMES, resolveSeed } from "./clipPipeline.ts";
import { median, reviewClip } from "./clipReview.ts";
import { multiSyllablePolyline } from "./clipCutMulti.ts";
import type { Tone } from "../game/gates.ts";
import { decodeWav, encodeWav } from "./wav.ts";
import { r2Get, r2Put } from "./r2.ts";
import { serviceClient } from "./serviceClient.ts";
import type { Json } from "../data/database.types.ts";

/**
 * `resolveSeed`, `SEED_F0_CENTER` and `MIN_REFERENCE_FRAMES` live in
 * `clipPipeline.ts`, not here: this script opens a Supabase client and awaits
 * at top level, so no test can import it, and the seed is the one value in
 * this pipeline that silently moves every shipped corridor when it changes.
 * See `clipPipeline.test.ts`, which pins the number, the resolution AND the
 * cut it produces.
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

const speakerIdx = args.indexOf("--speaker");
if (speakerIdx === -1 || !args[speakerIdx + 1] || args[speakerIdx + 1].startsWith("--")) {
  console.error(
    "--speaker <id> is required. Every measurement this script makes belongs to\n" +
      "one voice, so there is no safe default — see the header.\n\n" +
      "  npm run process-clips -- --speaker jane --dry-run",
  );
  process.exit(1);
}
const speakerId = args[speakerIdx + 1];

const supabase = serviceClient();

/**
 * Validated against the roster, never taken on trust: a typo'd id must exit
 * non-zero, not fall back to the default speaker and overwrite her rows.
 */
const { data: speakerRow, error: speakerError } = await supabase
  .from("speakers")
  .select("id,name,f0_seed,is_default")
  .eq("id", speakerId)
  .maybeSingle();
if (speakerError) throw new Error(`speakers select failed: ${speakerError.message}`);
if (!speakerRow) {
  const { data: roster } = await supabase.from("speakers").select("id").order("id");
  console.error(
    `Unknown speaker "${speakerId}". Known: ${(roster ?? []).map((r) => r.id).join(", ") || "(none)"}.`,
  );
  process.exit(1);
}

// Bound to a non-null const: the guard above narrows `speakerRow` here, but
// not inside the closures further down.
const speaker = speakerRow;

/**
 * Refused, not defaulted. `resolveSeed`'s fallback is for a caller with no
 * speaker at all; this one has a validated roster row, so a seed that is not a
 * finite number means the column was renamed, dropped, or holds something
 * `numeric` should never have held. Cutting as Jane instead would hand back a
 * full inventory of plausible polylines measured off the wrong search band —
 * the exact failure `--speaker` was made mandatory to prevent.
 */
const rawSeed = Number(speaker.f0_seed);
if (!Number.isFinite(rawSeed)) {
  console.error(
    `Speaker "${speaker.id}" has no usable f0_seed (read ${JSON.stringify(speaker.f0_seed)}).\n` +
      "That column is `not null numeric` in migration 0015, so this means the schema moved.\n" +
      "Refusing to cut: a wrong seed does not fail loudly, it ships wrong corridors.",
  );
  process.exit(1);
}
const seedF0 = resolveSeed(rawSeed);
console.log(`Speaker ${speaker.id} (${speaker.name}) — pitch-search seed ${seedF0}Hz.`);

interface Row {
  id: string;
  tone: number;
  /** Every tone of the word, in order. `[tone]` for a single syllable. */
  tones: Tone[];
  syllables: number;
  position: number;
  status: string;
  clip_key: string | null;
  raw_key: string | null;
  recorded_session: string | null;
}

/**
 * `word_clips` leads the query now, not `words`: `status`, `raw_key` and
 * `recorded_session` are properties of a recording, and asking `words` for
 * them would read the pre-roster columns that migration 0015 deliberately
 * left in place — every one of them Jane's, whichever `--speaker` was passed.
 * `words!inner` supplies only what is true of the word itself.
 */
const { data: allRows, error: rowsError } = await supabase
  .from("word_clips")
  .select("word_id,status,clip_key,raw_key,recorded_session,words!inner(tone,tones,syllables,position)")
  .eq("speaker_id", speakerId);
if (rowsError) throw new Error(`word_clips select failed: ${rowsError.message}`);

// Ordered here rather than in the query: `position` lives on the embedded
// side, and a sort PostgREST silently declines to apply would reorder nothing
// and say nothing.
const catalog = ((allRows ?? []) as unknown as {
  word_id: string;
  status: string;
  clip_key: string | null;
  raw_key: string | null;
  recorded_session: string | null;
  words: { tone: number; tones: number[] | null; syllables: number | null; position: number };
}[])
  .map((r): Row => ({
    id: r.word_id,
    tone: r.words.tone,
    // `tones`/`syllables` have defaults in the schema, but a row written
    // before 0013 can still read null. A word with neither is single by
    // definition, which is also what every pre-0013 row is.
    tones: (r.words.tones?.length ? r.words.tones : [r.words.tone]) as Tone[],
    syllables: r.words.syllables ?? 1,
    position: r.words.position,
    status: r.status,
    clip_key: r.clip_key,
    raw_key: r.raw_key,
    recorded_session: r.recorded_session,
  }))
  .sort((a, b) => a.position - b.position);

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

/**
 * What a word is normalised and compared against.
 *
 * A single syllable's cohort is its tone, exactly as before. A word of more
 * than one is its tone COMBINATION — "3-2", never "3" — because sandhi makes
 * a 3+2's first syllable a different shape and a different length from an
 * isolated third. Folding the two together would normalise her citation
 * thirds against half-thirds and flag every one of them for duration.
 */
function cohortKey(row: Row): string {
  return row.syllables > 1 ? row.tones.join("-") : `${row.tone}`;
}

const selectedIds = new Set(selected.map((r) => r.id));
const cohortsTouched = new Set(selected.map(cohortKey));
// See the header: the chao map belongs to the cohort, so the whole cohort is
// cut even when only part of it is written.
const toCut = catalog.filter(
  (r) =>
    hasTake(r) && cohortsTouched.has(cohortKey(r)) && ["recorded", "published"].includes(r.status),
);
const cohortOnly = toCut.length - selected.length;

// ------------------------------------------------------------- the audio

/**
 * Where a take is cached locally. Speaker-scoped for anything pulled from now
 * on, because two voices recording the same word must not collide on one path.
 *
 * The un-scoped path is still honoured when it already exists: Jane's 120
 * takes were cached under `{session}/{id}.wav` before the roster, and moving
 * them would mean re-pulling a gigabyte from R2 to gain nothing. A session id
 * is minted per booth sitting, so the two layouts cannot shadow each other.
 */
function localPath(row: Row): string {
  const legacy = `${recordingsDir}/${row.recorded_session}/${row.id}.wav`;
  if (existsSync(legacy)) return legacy;
  return `${recordingsDir}/${speakerId}/${row.recorded_session}/${row.id}.wav`;
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
  mkdirSync(`${recordingsDir}/${speakerId}/${row.recorded_session}`, { recursive: true });
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
interface StoredReference {
  f0Center?: unknown;
  rangeSemitones?: unknown;
}

interface WordMeta {
  /** Per speaker, since a reference describes a voice. */
  references?: Record<string, StoredReference>;
  /** The pre-roster shape: the default speaker's, and only hers. */
  reference?: StoredReference;
}

function asReference(ref: StoredReference | undefined): PitchReference | null {
  if (typeof ref?.f0Center !== "number" || typeof ref?.rangeSemitones !== "number") return null;
  return { f0Center: ref.f0Center, rangeSemitones: ref.rangeSemitones, frames: 0 };
}

let borrowedReference: PitchReference | null | undefined;
async function referenceOfLastPublished(): Promise<PitchReference | null> {
  if (borrowedReference !== undefined) return borrowedReference;
  // This speaker's own published words, never the catalog's. Borrowing across
  // voices is the failure this whole task exists to prevent: it is a drift
  // correction, and one speaker's centre is not a drifted version of another's.
  const { data, error } = await supabase
    .from("word_clips")
    .select("word_id,updated_at,words!inner(meta)")
    .eq("speaker_id", speakerId)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`word_clips meta select failed: ${error.message}`);
  borrowedReference = null;
  for (const row of (data ?? []) as unknown as { words: { meta: WordMeta | null } }[]) {
    const meta = row.words?.meta ?? null;
    const ref =
      asReference(meta?.references?.[speakerId]) ??
      // Rows published before the roster carry only `meta.reference`, which was
      // always the default speaker's. Reading it for anyone else would borrow
      // across voices by accident.
      (speaker.is_default ? asReference(meta?.reference) : null);
    if (ref) {
      borrowedReference = ref;
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
  const measured = measurePitchReference(takes, seedF0);

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
        `${MIN_REFERENCE_FRAMES}-frame minimum, and no published ${speakerId} word has a stored ` +
        `reference to borrow. Record more of this session before processing it.`,
    );
  }
  referenceBySession.set(session, { ...borrowed, borrowedFrom: `the last published ${speakerId} word` });
  const note =
    `${session}: only ${measured?.frames ?? 0} voiced frame(s), under the ` +
    `${MIN_REFERENCE_FRAMES}-frame minimum — borrowed f0Center ` +
    `${borrowed.f0Center.toFixed(1)}Hz / ±${borrowed.rangeSemitones} st from the last ` +
    `published ${speakerId} word instead of measuring this session (Decision 9).`;
  referenceNotes.push(note);
  console.log(`\n⚠ ${note}`);
}

// ------------------------------------------------------------- the cut

interface Cut {
  row: Row;
  tone: Tone;
  syllableSpans?: Array<[number, number]>;
  underSegmented?: boolean;
  overSegmented?: boolean;
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
      const clip = cutClip(
        samples,
        sampleRate,
        reference.f0Center,
        MEASURE_RANGE_SEMITONES,
        tone,
        row.syllables,
      );
      cuts.push({
        row,
        tone,
        syllableSpans: clip.syllableSpans,
        underSegmented: clip.underSegmented,
        overSegmented: clip.overSegmented,
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
//
// A multi-syllable cohort has no citation polyline of its own to aim at, and
// must not borrow one: DEFAULT_POLYLINES[3] is an isolated third, which a
// 3+2's first syllable is precisely not. Its target is the union of the spans
// its own tones reach — a height calibration for the whole word, leaving the
// measured shape untouched, which is all this step ever does for a single
// syllable either.
//
// NOTE: not specified by the tone-pairs plan. Nothing multi-syllable is in
// the catalog yet, so this decides nothing retroactively, but it decides what
// every future pair corridor is scaled to. Worth a look before Phase 4
// content lands.
const cohorts = new Map<string, Cut[]>();
for (const cut of cuts) {
  const key = cohortKey(cut.row);
  if (!cohorts.has(key)) cohorts.set(key, []);
  cohorts.get(key)!.push(cut);
}
for (const [key, cohort] of [...cohorts].sort(([a], [b]) => a.localeCompare(b))) {
  const span = cohortSpan(cohort.map((c) => c.contour));
  const target = cohortTargetSpan(cohort[0].row.tones);
  const hasCitationTone = cohort[0].row.tones.some((tone) => tone >= 1 && tone <= 4);
  if (!hasCitationTone) {
    console.log(
      `T${key}: neutral-only cohort — skipping citation-span normalization; ` +
        `${cohort.length} take(s) kept at measured contour.`,
    );
    continue;
  }
  const map = chaoMapFor(span, target);
  for (const cut of cohort) {
    cut.contour = applyChaoMap(cut.contour, map);
    cut.pinnedFraction = pinnedFractionOf(cut.contour);
  }
  console.log(
    `T${key}: measured ${span.low.toFixed(2)}–${span.high.toFixed(2)} chao -> ` +
      `${target.low.toFixed(2)}–${target.high.toFixed(2)}  (×${map.a.toFixed(2)} ${map.b >= 0 ? "+" : ""}${map.b.toFixed(2)})  ` +
      `from ${cohort.length} take(s)`,
  );
}

// ---- Cohort medians, for the review's duration outlier check.
//
// This speaker's own published clips, never the catalog's. The medians are a
// claim about how long THIS voice holds a tone, and Jane's tone-2 median of
// ~1050ms told a male speaker's 276ms take it was an outlier when the only
// thing wrong was whose cohort it was measured against — the same report also
// guessed "f0Center is probably wrong for this speaker", which was true, and
// for the same reason.
//
// The run's own cuts are the fallback, and are the answer for a speaker's
// first session, when there is nothing published to compare against yet.
const { data: publishedDurations, error: durationsError } = await supabase
  .from("word_clips")
  .select("duration_s,words!inner(tone,tones,syllables)")
  .eq("speaker_id", speakerId)
  .eq("status", "published")
  .not("duration_s", "is", null);
if (durationsError) throw new Error(`word_clips duration select failed: ${durationsError.message}`);

const publishedMsByCohort = new Map<string, number[]>();
for (const row of (publishedDurations ?? []) as unknown as {
  duration_s: number | string;
  words: { tone: number; tones: number[] | null; syllables: number | null };
}[]) {
  const key =
    (row.words.syllables ?? 1) > 1 && row.words.tones?.length
      ? row.words.tones.join("-")
      : `${row.words.tone}`;
  if (!publishedMsByCohort.has(key)) publishedMsByCohort.set(key, []);
  publishedMsByCohort.get(key)!.push(Number(row.duration_s) * 1000);
}

// Every cohort this run touches, plus the four single tones so a single-tone
// run keeps reporting exactly what it did before.
const medianByCohort = new Map<string, number>();
for (const key of new Set([...cohorts.keys(), "1", "2", "3", "4"])) {
  const published = publishedMsByCohort.get(key) ?? [];
  medianByCohort.set(
    key,
    published.length > 0
      ? median(published)
      : median(cuts.filter((c) => cohortKey(c.row) === key).map((c) => c.durationMs)),
  );
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

if (!dryRun) mkdirSync(`${clipsDir}/${speakerId}`, { recursive: true });

const toPublish: Published[] = [];
let flaggedCount = 0;

for (const cut of [...cuts].sort((a, b) => a.row.id.localeCompare(b.row.id))) {
  const selectedHere = selectedIds.has(cut.row.id);

  const flags = reviewClip({
    id: cut.row.id,
    tone: cut.tone,
    tones: cut.row.tones,
    syllableSpans: cut.syllableSpans,
    underSegmented: cut.underSegmented,
    overSegmented: cut.overSegmented,
    durationMs: cut.durationMs,
    contour: cut.contour,
    pinnedFraction: cut.pinnedFraction,
    cohortMedianMs: medianByCohort.get(cohortKey(cut.row)) ?? 0,
    speaker: speaker.name,
  });

  const mark = flags.length ? "⚠" : " ";
  console.log(
    `${mark} ${selectedHere ? " " : "·"}${cut.row.id.padEnd(10)} T${cohortKey(cut.row).padEnd(3)} ` +
      `${cut.durationMs.toFixed(0).padStart(5)}ms tone / ` +
      `${cut.clipMs.toFixed(0).padStart(5)}ms clip  ` +
      `${String(cut.contour.length).padStart(3)} frames  (${cut.session})`,
  );
  console.log(`    ${contourLine(cut.contour)}`);
  for (const flag of flags) console.log(`    ⚠ ${flag.kind}: ${flag.message}`);
  if (flags.length && selectedHere) flaggedCount++;

  // A flagged clip is still published — clipReview flags, it never blocks.
  if (!selectedHere) continue;

  const file = `${clipsDir}/${speakerId}/${cut.row.id}.wav`;
  if (!dryRun) writeFileSync(file, encodeWav(cut.samples, cut.sampleRate));

  toPublish.push({
    id: cut.row.id,
    // Speaker-scoped for anything this script mints. An existing key is kept
    // verbatim instead: `clip_key` is an explicit column, not a convention, so
    // Jane's pre-roster `ma1b.wav` objects stay exactly where they are and a
    // re-cut never turns into a bulk R2 move (and never leaves the old object
    // orphaned behind a rewritten row).
    clipKey: cut.row.clip_key ?? `clips/${speakerId}/${cut.row.id}.wav`,
    // The tone window. The gate lasts exactly this long.
    durationS: Number((cut.durationMs / 1000).toFixed(4)),
    // File start → tone start.
    onsetS: Number((cut.onsetMs / 1000).toFixed(3)),
    // The audible clock: the whole file. NOT onsetS + durationS.
    clipS: Number((cut.clipMs / 1000).toFixed(4)),
    // Corridor vertices, in the same [t, chao] form as `tuning().polylines`,
    // so a measured word and a hand-tuned tone default are the same kind of
    // object downstream.
    // Refitted here, not taken from `cutClip`: the contour was rescaled onto
    // canonical chao heights above, and the polyline has to describe the
    // contour that actually ships. The syllable boundaries are a property of
    // the audio, so they survive that rescale and the refit is exact.
    polyline:
      cut.row.syllables > 1 && cut.syllableSpans
        ? multiSyllablePolyline(cut.contour, cut.syllableSpans)
        : templateContour(cut.tone, cut.contour),
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
  // The measurements go to `word_clips`, keyed (word_id, speaker_id), so a
  // second voice's numbers land beside the first's rather than over them. An
  // upsert on that key because the booth may never have created the row (a
  // take pulled in by hand, a re-cut of a retired word); the conflict target
  // is the composite key, never `word_id` alone.
  const { error } = await supabase.from("word_clips").upsert(
    {
      word_id: clip.id,
      speaker_id: speakerId,
      clip_key: clip.clipKey,
      duration_s: clip.durationS,
      onset_s: clip.onsetS,
      clip_s: clip.clipS,
      polyline: clip.polyline,
      contour: clip.contour,
      status: "published",
    },
    { onConflict: "word_id,speaker_id" },
  );
  if (error) throw new Error(`word_clips upsert failed for ${clip.id}: ${error.message}`);

  // A narrow UPDATE of `words`, never an upsert, and now narrower still: the
  // only word-level column this writes is `meta`. `min_tier`, `position`,
  // `status` and everything a human typed stay exactly as they are.
  // `min_tier` in particular defaults open ('free') at import and is not
  // recomputed here — it is the GAME gate, not the visualiser's practice
  // depth, and it is identical for every voice. See docs/DECISIONS.md.
  const existing = ((metaById.get(clip.id) as WordMeta | null) ?? {}) as WordMeta &
    Record<string, unknown>;
  const { error: metaWriteError } = await supabase
    .from("words")
    .update({
      meta: {
        ...existing,
        // Per speaker: a reference describes a voice, and a shared key would
        // have the second speaker processed silently overwrite the first's.
        references: { ...(existing.references ?? {}), [speakerId]: clip.reference },
        // The pre-roster key, still written for the default speaker only, so
        // anything reading the old shape keeps reading the right voice.
        ...(speaker.is_default ? { reference: clip.reference } : {}),
      } as unknown as Json,
    })
    .eq("id", clip.id);
  if (metaWriteError) throw new Error(`words meta update failed for ${clip.id}: ${metaWriteError.message}`);
}

console.log(`\nPublished ${toPublish.length} clip(s) to flappytone-clips and the catalog.`);

// The bundled fallback is a snapshot of the published rows, so it is stale the
// moment this finishes. Regenerating it here is what stops that being noticed
// three commits later as "the landing page is missing a word".
// Run as a child process, not imported: `export-fallback.ts` is a script with
// top-level effects and its own `process.exit(1)` on an empty result, and an
// import would either swallow that or take this process down mid-sentence.
// Only the default speaker's rows are bundled (see `export-fallback.ts`), so
// processing anyone else cannot change the snapshot and re-running it would
// only churn its timestamp.
if (speaker.is_default) {
  execFileSync("node", ["--experimental-strip-types", `${root}src/dev/export-fallback.ts`], {
    cwd: root,
    stdio: "inherit",
  });
  console.log("\nNow commit src/data/wordsFallback.json");
} else {
  console.log(
    `\n${speaker.id} is not the default speaker, so the bundled fallback is unchanged.`,
  );
}
