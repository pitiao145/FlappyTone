// CLI: npm run analyze-recording <video> [options]
//
// The playtest half of the tuning loop. A screen recording carries two
// signals the repo otherwise cannot see together: what the player actually
// said (the soundtrack) and what the game did about it (the frames). This
// demuxes both and lines them up on one clock.
//
// The soundtrack goes through the same PitchTracker the game uses, so an
// utterance here is the same object the game was judging. The frames come out
// as JPEGs an agent can read — by default a coarse sweep plus a dense burst
// around every detected utterance, because the interesting moment is always
// "what was on screen while they were speaking".
//
// Two speakers are on that soundtrack: the player, and Jane in the reference
// clip. They are separated by median f0 (see --f0 / --cue-f0) and labelled,
// because a cue misread as an attempt inverts every conclusion.
//
// Options:
//   --f0 <hz>        player's f0Center (default from speakers.json "pierre")
//   --cue-f0 <hz>    reference-clip speaker's f0Center (default jane)
//   --fps <n>        coarse frame sweep rate (default 2)
//   --burst <n>      frames per second around each utterance (default 6)
//   --from/--to <s>  analyse a sub-range only
//   --out <dir>      output dir (default alongside the video)
//   --no-frames      audio analysis only, skip frame extraction
//
// Requires ffmpeg/ffprobe on PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { PitchTracker } from "../pitch/PitchTracker.ts";
import { tuning } from "../game/tuning.ts";
import { decodeWav } from "./wav.ts";

const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;
const SPEAKERS_PATH = "fixtures/captures/speakers.json";

/**
 * Segmentation floor for *reporting*. Deliberately below the game's live
 * `tuning().minUtteranceMs` — a run the game threw away is exactly what we
 * want to see.
 */
const REPORT_MIN_MS = 90;

// ------------------------------------------------------------------- argv

interface Opts {
  video: string;
  f0: number;
  cueF0: number;
  fps: number;
  burst: number;
  from: number;
  to: number | null;
  out: string | null;
  frames: boolean;
}

function parseArgs(argv: string[]): Opts {
  const speakers = existsSync(SPEAKERS_PATH)
    ? (JSON.parse(readFileSync(SPEAKERS_PATH, "utf8")) as Record<string, number>)
    : {};
  const opts: Opts = {
    video: "",
    f0: speakers.pierre ?? 115,
    cueF0: speakers.jane ?? 168,
    fps: 2,
    burst: 6,
    from: 0,
    to: null,
    out: null,
    frames: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--f0") opts.f0 = Number(next());
    else if (a === "--cue-f0") opts.cueF0 = Number(next());
    else if (a === "--fps") opts.fps = Number(next());
    else if (a === "--burst") opts.burst = Number(next());
    else if (a === "--from") opts.from = Number(next());
    else if (a === "--to") opts.to = Number(next());
    else if (a === "--out") opts.out = next();
    else if (a === "--no-frames") opts.frames = false;
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}`);
    else opts.video = a;
  }
  if (!opts.video) {
    throw new Error("usage: npm run analyze-recording <video.mov> [--f0 hz] [--fps n]");
  }
  if (!existsSync(opts.video)) throw new Error(`No such file: ${opts.video}`);
  return opts;
}

// -------------------------------------------------------------------- ffmpeg

function requireFfmpeg(): void {
  for (const bin of ["ffmpeg", "ffprobe"]) {
    try {
      execFileSync(bin, ["-version"], { stdio: "ignore" });
    } catch {
      throw new Error(`${bin} not found on PATH. Install with: brew install ffmpeg`);
    }
  }
}

interface Probe {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

function probe(video: string): Probe {
  const raw = execFileSync(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", video],
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  const parsed = JSON.parse(raw) as {
    format: { duration?: string };
    streams: {
      codec_type: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }[];
  };
  const v = parsed.streams.find((s) => s.codec_type === "video");
  const [num, den] = (v?.avg_frame_rate ?? "0/1").split("/").map(Number);
  return {
    durationSec: Number(parsed.format.duration ?? 0),
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    fps: den ? num / den : 0,
    hasAudio: parsed.streams.some((s) => s.codec_type === "audio"),
  };
}

function extractAudio(video: string, outWav: string, from: number, to: number | null): void {
  const args = ["-y", "-v", "error"];
  if (from > 0) args.push("-ss", String(from));
  if (to !== null) args.push("-to", String(to));
  args.push("-i", video, "-vn", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", outWav);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
}

/** Extract one JPEG per timestamp. Seeks per frame — exact, and fast enough. */
function extractFrames(video: string, times: number[], dir: string, prefix: string): string[] {
  const paths: string[] = [];
  for (const t of times) {
    const name = `${prefix}_${t.toFixed(2).replace(".", "-")}s.jpg`;
    const path = join(dir, name);
    execFileSync(
      "ffmpeg",
      ["-y", "-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-q:v", "3", path],
      { stdio: "inherit" },
    );
    paths.push(path);
  }
  return paths;
}

// -------------------------------------------------------------------- pitch

export interface Frame {
  tMs: number;
  f0: number | null;
  clarity: number;
  rms: number;
  voiced: boolean;
  chao: number | null;
}

/** Run the soundtrack through the tracker at one f0Center. */
export function track(samples: Float32Array, sampleRate: number, f0Center: number): Frame[] {
  const tracker = new PitchTracker({ sampleRate, f0Center });
  const frames: Frame[] = [];
  for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
    const s = tracker.push(samples.subarray(start, start + FRAME_SIZE));
    frames.push({
      tMs: (start / sampleRate) * 1000,
      f0: s.f0,
      clarity: s.clarity,
      rms: s.rms,
      voiced: s.voiced,
      chao: s.voiced ? s.smoothedChao : null,
    });
  }
  return frames;
}

// ------------------------------------------------------------------ cue match
//
// The recording carries the game's own reference clip as well as the player,
// and mistaking one for the other inverts every conclusion drawn from it.
//
// An energy envelope is not a usable fingerprint here — every CV syllable has
// the same rise-and-fall, so it matched everything. What actually separates
// them is that a cue is a *playback of a known file*: same speaker, same
// absolute pitch, same length, same contour, every time. So we profile the
// shipped clips through the same tracker and match whole utterances against
// them on all three axes at once.

/**
 * The four anchor clips, not the shipped inventory.
 *
 * ⚠ Known limitation, deliberately not papered over. This matcher works because
 * a cue is a playback of a *known* file: same speaker, same absolute pitch,
 * same length. That held while the inventory was four `ma` clips spread across
 * the pitch range. Against the 120-word inventory it collapses — the words
 * cover the whole range densely, so a 154Hz, 372ms learner capture lands
 * within 1.4 st and 16% duration of a T3 word clip and reads as a cue, which is
 * exactly the false positive that would discard a real attempt.
 *
 * So this stays pointed at the anchors, and the honest consequence is that a
 * screen recording of the *word* game has its cues classified as player speech.
 * Fixing it properly means telling the analyzer which clips a run actually
 * cued — the gate log knows — rather than matching against everything.
 */
const REF_DIR = "fixtures/anchors";
/** Contour comparison resolution — enough to tell a rise from a dip. */
const PROFILE_POINTS = 16;
/** A playback reproduces the clip's absolute pitch; a human voice will not. */
const CUE_MAX_SEMITONE_DIFF = 1.5;
/** Playback length is fixed; a spoken answer varies far more than this. */
const CUE_MAX_DURATION_RATIO = 0.25;
/**
 * RMSE between contours, in semitones about each one's own median. Loose on
 * purpose: a screen recording re-encodes the audio, and that perturbs the
 * fastest stretch of a T4 fall by ~1.8st. The wrong-tone margin is 6–9st, so
 * the discrimination is carried by pitch and duration, not by this.
 */
const CUE_MAX_CONTOUR_RMSE = 3.0;

export interface RefProfile {
  tone: number;
  durMs: number;
  medianF0: number;
  /** Semitones about the clip's own median, resampled to PROFILE_POINTS. */
  shape: number[];
}

/** Semitone contour about its own median, time-normalised. */
function profileShape(f0s: number[], medianF0: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < PROFILE_POINTS; i++) {
    const idx = Math.min(f0s.length - 1, Math.floor((i / PROFILE_POINTS) * f0s.length));
    out.push(12 * Math.log2(f0s[idx] / medianF0));
  }
  return out;
}

/** Profile each shipped clip through the same tracker the game uses. */
export function loadRefProfiles(f0Center: number, dir = REF_DIR): RefProfile[] {
  if (!existsSync(dir)) return [];
  const profiles: RefProfile[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".wav")).sort()) {
    const tone = Number(file.match(/(\d)/)?.[1] ?? 0);
    const { samples, sampleRate } = decodeWav(readFileSync(join(dir, file)));
    const frames = track(samples, sampleRate, f0Center);
    const f0s = frames.filter((f) => f.voiced && f.f0 !== null).map((f) => f.f0!);
    if (f0s.length < PROFILE_POINTS) continue;
    const med = median(f0s);
    const voiced = frames.filter((f) => f.voiced);
    profiles.push({
      tone,
      durMs: voiced[voiced.length - 1].tMs - voiced[0].tMs,
      medianF0: med,
      shape: profileShape(f0s, med),
    });
  }
  return profiles;
}

/**
 * Which reference clip, if any, this utterance *is*. Requires agreement on
 * absolute pitch, duration and contour — any one alone gives false matches.
 */
export function matchRef(
  f0s: number[],
  medianF0: number,
  durMs: number,
  profiles: RefProfile[],
): RefProfile | null {
  if (f0s.length < PROFILE_POINTS) return null;
  const shape = profileShape(f0s, medianF0);
  for (const ref of profiles) {
    const semitoneDiff = Math.abs(12 * Math.log2(medianF0 / ref.medianF0));
    if (semitoneDiff > CUE_MAX_SEMITONE_DIFF) continue;
    if (Math.abs(durMs - ref.durMs) / ref.durMs > CUE_MAX_DURATION_RATIO) continue;
    let sum = 0;
    for (let i = 0; i < PROFILE_POINTS; i++) {
      const d = shape[i] - ref.shape[i];
      sum += d * d;
    }
    if (Math.sqrt(sum / PROFILE_POINTS) <= CUE_MAX_CONTOUR_RMSE) return ref;
  }
  return null;
}

export interface CueMatch {
  tone: number;
  startMs: number;
  endMs: number;
}

interface Utterance {
  startMs: number;
  endMs: number;
  durMs: number;
  medianF0: number;
  /** Whose voice this is: the game's reference clip, or the player answering. */
  speaker: "player" | "cue";
  /** Cue playback this utterance overlaps, when it is the cue. */
  cueTone: number | null;
  /** Would the game's own rule have accepted this as an attempt? */
  heardByGame: boolean;
  frames: Frame[];
}

/** Voiced runs, merging gaps under tuning().mergeGapMs — the game's own segmentation. */
function segment(frames: Frame[]): { startIdx: number; endIdx: number }[] {
  const runs: { startIdx: number; endIdx: number }[] = [];
  let open: { startIdx: number; endIdx: number } | null = null;
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i].voiced) continue;
    if (open && frames[i].tMs - frames[open.endIdx].tMs <= tuning().mergeGapMs) {
      open.endIdx = i;
    } else {
      if (open) runs.push(open);
      open = { startIdx: i, endIdx: i };
    }
  }
  if (open) runs.push(open);
  return runs;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function buildUtterances(
  frames: Frame[],
  playerF0: number,
  cueF0: number,
  profiles: RefProfile[],
): Utterance[] {
  const hopMs = (HOP_SIZE / 44100) * 1000;
  const out: Utterance[] = [];
  for (const run of segment(frames)) {
    const slice = frames.slice(run.startIdx, run.endIdx + 1);
    const durMs = slice[slice.length - 1].tMs - slice[0].tMs + hopMs;
    if (durMs < REPORT_MIN_MS) continue;
    const startMs = slice[0].tMs;
    const endMs = slice[slice.length - 1].tMs + hopMs;
    // Voiced frames only — the ref profiles are built the same way, and
    // comparing an unvoiced-inclusive contour against a voiced-only one
    // silently shifts both the median and the shape.
    const f0s = slice.filter((f) => f.voiced && f.f0 !== null).map((f) => f.f0!);
    const med = median(f0s);

    // A matched clip playback is decisive. Only when no clip explains this
    // audio do we fall back to nearest f0 centre — in log space, because
    // pitch distance is a ratio, not a difference.
    const ref = matchRef(f0s, med, durMs, profiles);
    const dPlayer = Math.abs(Math.log2(med / playerF0));
    const dCue = Math.abs(Math.log2(med / cueF0));
    const isCue = ref !== null || (profiles.length === 0 && dCue < dPlayer);

    out.push({
      startMs,
      endMs,
      durMs,
      medianF0: med,
      speaker: isCue ? "cue" : "player",
      cueTone: ref?.tone ?? null,
      heardByGame: durMs >= tuning().minUtteranceMs,
      frames: slice,
    });
  }
  return out;
}

// -------------------------------------------------------------------- render

const ROWS = 11; // chao 1..5 at 0.4 resolution

/** Compact ASCII contour for one utterance, ~40 columns wide. */
function contour(u: Utterance, cols = 40): string[] {
  const grid: string[][] = Array.from({ length: ROWS }, () => Array(cols).fill(" "));
  for (let c = 0; c < cols; c++) {
    const idx = Math.min(u.frames.length - 1, Math.floor((c / cols) * u.frames.length));
    const chao = u.frames[idx].chao;
    if (chao === null) {
      grid[Math.floor(ROWS / 2)][c] = ".";
      continue;
    }
    const row = Math.round(((5 - chao) / 4) * (ROWS - 1));
    grid[Math.max(0, Math.min(ROWS - 1, row))][c] = "#";
  }
  return grid.map((row, i) => {
    const chao = 5 - (i / (ROWS - 1)) * 4;
    const label = Number.isInteger(chao) ? `${chao} ` : "  ";
    return `  ${label}|${row.join("")}|`;
  });
}

/** Crude shape label. A hint for reading the table, never a verdict. */
function shapeOf(u: Utterance): string {
  const chaos = u.frames.map((f) => f.chao).filter((c): c is number => c !== null);
  if (chaos.length < 3) return "?";
  const third = Math.floor(chaos.length / 3);
  const head = median(chaos.slice(0, third));
  const mid = median(chaos.slice(third, third * 2));
  const tail = median(chaos.slice(third * 2));
  const rise = tail - head;
  const dip = Math.min(head, tail) - mid;
  if (dip > 0.6) return "dip-rise (T3-ish)";
  if (rise > 0.8) return "rising (T2-ish)";
  if (rise < -0.8) return "falling (T4-ish)";
  return "flat (T1-ish)";
}

// ---------------------------------------------------------------------- main

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  requireFfmpeg();

  const stem = basename(opts.video, extname(opts.video));
  const outDir = opts.out ?? join(dirname(opts.video), `${stem}-analysis`);
  const framesDir = join(outDir, "frames");
  if (existsSync(framesDir)) rmSync(framesDir, { recursive: true });
  mkdirSync(framesDir, { recursive: true });

  const info = probe(opts.video);
  console.log(`# ${basename(opts.video)}`);
  console.log(
    `  ${info.width}x${info.height}  ${info.fps.toFixed(1)}fps  ${info.durationSec.toFixed(1)}s  audio=${info.hasAudio}`,
  );
  if (!info.hasAudio) {
    console.log("\n  !! No audio stream. Screen recordings without mic audio cannot");
    console.log("     show what the player said — re-record with the mic captured.");
  }

  const offset = opts.from;
  let utterances: Utterance[] = [];

  if (info.hasAudio) {
    const wavPath = join(outDir, `${stem}.wav`);
    extractAudio(opts.video, wavPath, opts.from, opts.to);
    const { samples, sampleRate } = decodeWav(readFileSync(wavPath));
    const frames = track(samples, sampleRate, opts.f0);
    const profiles = loadRefProfiles(opts.cueF0);
    utterances = buildUtterances(frames, opts.f0, opts.cueF0, profiles);
    const cues = utterances.filter((u) => u.speaker === "cue");

    // Chao is relative to a speaker. Drawing Jane's cue against the player's
    // centre pins it at the ceiling and every cue reads as a flat T1; re-track
    // the cue stretches against her own centre so the two are comparable.
    if (cues.length > 0) {
      const cueFrames = track(samples, sampleRate, opts.cueF0);
      for (const u of cues) {
        u.frames = cueFrames.filter((f) => f.tMs >= u.startMs && f.tMs < u.endMs);
      }
    }

    const voicedPct = (frames.filter((f) => f.voiced).length / frames.length) * 100;
    const byPlayer = utterances.filter((u) => u.speaker === "player");
    const missed = byPlayer.filter((u) => !u.heardByGame);

    console.log(`\n## Soundtrack  (player f0Center=${opts.f0}, cue f0Center=${opts.cueF0})`);
    console.log(`  wav: ${wavPath}`);
    console.log(
      `  ${frames.length} frames, ${voicedPct.toFixed(0)}% voiced, ` +
        `${utterances.length} utterances (${byPlayer.length} player, ` +
        `${utterances.length - byPlayer.length} cue)`,
    );
    console.log(
      `  player utterances under the game's ${tuning().minUtteranceMs}ms floor: ` +
        `${missed.length}/${byPlayer.length}`,
    );

    console.log(
      `  reference clips matched: ${cues.length} of ${profiles.length} profiled`,
    );

    console.log("\n  #   who     start     dur    medF0   heard  shape");
    utterances.forEach((u, i) => {
      const n = String(i + 1).padStart(3);
      const start = `${(offset + u.startMs / 1000).toFixed(2)}s`.padStart(8);
      const dur = `${Math.round(u.durMs)}ms`.padStart(7);
      const f0 = `${Math.round(u.medianF0)}Hz`.padStart(7);
      const heard = (u.heardByGame ? "yes" : "NO").padStart(5);
      const who = u.speaker === "cue" ? `cue T${u.cueTone ?? "?"}` : "player";
      console.log(`  ${n}   ${who.padEnd(7)}${start}${dur}${f0}   ${heard}  ${shapeOf(u)}`);
    });

    // Call and response. B3's claim is that the response window opens a beat
    // and a half after the call; this is that interval, measured.
    if (cues.length > 0) {
      console.log("\n## Call → response");
      console.log("  cue      ends     next answer   gap      answer dur");
      const gaps: number[] = [];
      for (const c of cues) {
        const answer = utterances.find(
          (u) => u.speaker === "player" && u.startMs >= c.endMs - 100,
        );
        const endS = `${(offset + c.endMs / 1000).toFixed(2)}s`.padStart(9);
        if (!answer) {
          console.log(`  T${c.cueTone}   ${endS}         (none)`);
          continue;
        }
        const gap = answer.startMs - c.endMs;
        gaps.push(gap);
        console.log(
          `  T${c.cueTone}   ${endS}   ${`${(offset + answer.startMs / 1000).toFixed(2)}s`.padStart(11)}` +
            `${`${Math.round(gap)}ms`.padStart(9)}${`${Math.round(answer.durMs)}ms`.padStart(13)}`,
        );
      }
      if (gaps.length > 0) {
        console.log(`  median gap: ${Math.round(median(gaps))}ms over ${gaps.length} cues`);
      }
    }

    for (const [i, u] of utterances.entries()) {
      console.log(
        `\n  --- #${i + 1} ${u.speaker} @ ${(offset + u.startMs / 1000).toFixed(2)}s ` +
          `(${Math.round(u.durMs)}ms, ${shapeOf(u)}) ---`,
      );
      for (const line of contour(u)) console.log(line);
    }
  }

  if (opts.frames) {
    const end = opts.to ?? info.durationSec;
    const sweep: number[] = [];
    for (let t = opts.from; t < end; t += 1 / opts.fps) sweep.push(Number(t.toFixed(2)));

    // Dense burst around each player attempt: the frames that show what the
    // game rendered while they were speaking, which is the whole question.
    const burst: number[] = [];
    for (const u of utterances.filter((u) => u.speaker === "player")) {
      const s = offset + u.startMs / 1000 - 0.3;
      const e = offset + u.endMs / 1000 + 0.5;
      for (let t = Math.max(0, s); t < Math.min(end, e); t += 1 / opts.burst) {
        burst.push(Number(t.toFixed(2)));
      }
    }

    const times = [...new Set([...sweep, ...burst])].sort((a, b) => a - b);
    console.log(`\n## Frames  → ${framesDir}`);
    console.log(`  ${times.length} frames (${sweep.length} sweep @${opts.fps}fps + burst @${opts.burst}fps)`);
    extractFrames(opts.video, times, framesDir, stem);
    console.log(`  written: ${readdirSync(framesDir).length} files`);
  }

  console.log("\nDone.");
}

// Guarded so tests can import the classifier without running the CLI.
if (process.argv[1]?.includes("analyze-recording")) main();
