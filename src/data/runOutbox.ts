/**
 * Runs waiting to reach the server (brief 05), account players only.
 *
 * Every finished run is added here first and removed once `api/runlog.ts`
 * has answered for it, so a run played offline (or killed by a navigation)
 * posts on the next load. The server adds a run once per `runId`, which is
 * what makes a retry safe: posting the same run twice changes nothing.
 *
 * Kept per user id: a run belongs to the account that played it, and a
 * device that switches accounts must not post one player's run under
 * another. Capped at `MAX_ITEMS` (oldest dropped). Never throws.
 */
import type { RunLogEntry } from "../game/runTrend.ts";

const KEY = "toneflap.runOutbox.v1";
export const MAX_ITEMS = 50;

export interface OutboxItem {
  userId: string;
  /** The player's local day when the run ended. */
  day: string;
  run: RunLogEntry;
}

export function loadOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is OutboxItem =>
        !!i && typeof i.userId === "string" && typeof i.day === "string" && typeof i.run?.runId === "string",
    );
  } catch {
    return [];
  }
}

function saveOutbox(items: OutboxItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Blocked storage: the run still posts once, now; only the retry is lost.
  }
}

/** Adds a run unless one with the same `runId` is already waiting. */
export function enqueueRun(item: OutboxItem): void {
  const items = loadOutbox();
  if (items.some((i) => i.run.runId === item.run.runId)) return;
  saveOutbox([...items, item].slice(-MAX_ITEMS));
}

/** What one POST came back as: done (remove it), or worth retrying later. */
export type PostResult = "done" | "retry";

/**
 * Posts every waiting run of `userId`, oldest first, through `post`. A
 * `"done"` answer (applied, a duplicate, or a permanent 4xx) removes the
 * item; `"retry"` keeps it and stops the drain (the network is likely down).
 * Returns how many items were removed.
 */
export async function drainOutbox(
  userId: string,
  post: (item: OutboxItem) => Promise<PostResult>,
): Promise<number> {
  let removed = 0;
  for (const item of loadOutbox().filter((i) => i.userId === userId)) {
    let result: PostResult;
    try {
      result = await post(item);
    } catch {
      result = "retry";
    }
    if (result === "retry") break;
    saveOutbox(loadOutbox().filter((i) => i.run.runId !== item.run.runId));
    removed++;
  }
  return removed;
}
