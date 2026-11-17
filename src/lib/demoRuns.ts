/**
 * The demo's parked rounds (brief 50): each finished Try it now round, kept
 * in this browser so a new account can import them on its first /app load
 * (`src/data/demoImport.ts`).
 *
 * A storage leaf: raw numbers only, no import from `src/data/` or
 * `runTrend.ts`, so the landing and site chunks stay small (hard rule 13).
 * Browser-wide (not per account: the visitor has none yet). Keeps the latest
 * `MAX_DEMO_RUNS`, drops any older than `DEMO_RUN_TTL_MS` on read and write.
 * Never throws: blocked storage means nothing is parked (hard rule 10).
 * Never audio: the numbers are the same kind an account's runs store
 * (hard rule 12, privacy policy "If you try FlappyTone without an account").
 */

export const DEMO_RUNS_KEY = "toneflap.demoRuns.v1";
export const MAX_DEMO_RUNS = 5;
export const DEMO_RUN_TTL_MS = 24 * 60 * 60 * 1000;

/** One key's numbers, as `RunStats.perTone` / `perCombo` hold them. */
export interface DemoKeyStat {
  gates: number;
  accSum: number;
  unheard: number;
  best: number;
}

export interface DemoRun {
  /** A uuid: the run log's idempotency key, so a round imports once. */
  runId: string;
  /** The player's local day the round ended, YYYY-MM-DD. */
  day: string;
  mode: "game" | "drill" | "pairs";
  score: number;
  perTone: Record<string, DemoKeyStat>;
  perCombo: Record<string, DemoKeyStat>;
  wordIds: string[];
  /** When the round ended, ms since epoch. */
  at: number;
}

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isKeyMap(v: unknown): v is Record<string, DemoKeyStat> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v).every(
    (s) => !!s && typeof s === "object" && isNum(s.gates) && isNum(s.accSum) && isNum(s.unheard) && isNum(s.best),
  );
}

function isDemoRun(v: unknown): v is DemoRun {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.runId === "string" &&
    typeof r.day === "string" &&
    (r.mode === "game" || r.mode === "drill" || r.mode === "pairs") &&
    isNum(r.score) &&
    isKeyMap(r.perTone) &&
    isKeyMap(r.perCombo) &&
    Array.isArray(r.wordIds) &&
    r.wordIds.every((w) => typeof w === "string") &&
    isNum(r.at)
  );
}

/** Fresh, newest last, at most `MAX_DEMO_RUNS`. */
function prune(runs: DemoRun[], now: number): DemoRun[] {
  return runs.filter((r) => now - r.at < DEMO_RUN_TTL_MS && r.at <= now + 60_000).slice(-MAX_DEMO_RUNS);
}

/** The parked rounds still fresh, oldest first. Empty on any failure. */
export function readDemoRuns(now = Date.now()): DemoRun[] {
  try {
    const raw = store()?.getItem(DEMO_RUNS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return prune(parsed.filter(isDemoRun), now);
  } catch {
    return [];
  }
}

/** The local calendar day of `ms`, YYYY-MM-DD (as `playerShape.localDay`). */
export function localDayOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function newId(): string | null {
  try {
    return crypto.randomUUID();
  } catch {
    return null;
  }
}

/** Parks one finished round. Does nothing when storage is blocked. */
export function parkDemoRun(
  run: Pick<DemoRun, "mode" | "score" | "perTone" | "perCombo" | "wordIds">,
  now = Date.now(),
): void {
  try {
    const s = store();
    const runId = newId();
    if (!s || !runId) return;
    const keep = (m: Record<string, DemoKeyStat>) =>
      Object.fromEntries(
        Object.entries(m).map(([k, v]) => [k, { gates: v.gates, accSum: v.accSum, unheard: v.unheard, best: v.best }]),
      );
    const entry: DemoRun = {
      runId,
      day: localDayOf(now),
      mode: run.mode,
      score: Math.round(run.score),
      perTone: keep(run.perTone),
      perCombo: keep(run.perCombo),
      wordIds: [...run.wordIds],
      at: now,
    };
    s.setItem(DEMO_RUNS_KEY, JSON.stringify(prune([...readDemoRuns(now), entry], now)));
  } catch {
    // Blocked or full storage: this round is simply not parked.
  }
}

/** Forgets every parked round. Never throws. */
export function clearDemoRuns(): void {
  try {
    store()?.removeItem(DEMO_RUNS_KEY);
  } catch {
    // Nothing to clear we can reach.
  }
}
