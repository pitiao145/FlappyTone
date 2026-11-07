/**
 * Ends a run the player has left behind (brief 31).
 *
 * A run is "away" while it is out of sight: GameApp shows another nav tab
 * over it (the run stays mounted but hidden, see `GameHandle`), or the page
 * itself is hidden (another app, a locked phone). A short look away resumes
 * exactly as before. A run away for `ABANDON_AFTER_MS` ends as abandoned,
 * once: one `run_end`, one run-log post, and the mic released. A page that
 * goes away for good (`pagehide`) ends it at once.
 *
 * Plain timers and callbacks, no React and no Web Audio, so the rules can be
 * tested with fake timers. `Game.tsx` owns the wiring.
 */

/**
 * How long a run may sit out of sight before it ends as abandoned. Kept here,
 * not in `tuning()`: it is not a feel value the Lab flies, it only decides
 * when a forgotten run stops holding the mic.
 */
export const ABANDON_AFTER_MS = 2 * 60_000;

export interface AwayWatchOptions {
  /** Called once, with how long the run had been away (0 if it never was). */
  onAbandon: (idleMs: number) => void;
  limitMs?: number;
  now?: () => number;
}

export interface AwayWatch {
  /** The run went out of sight (true) or came back (false). Idempotent. */
  setAway(away: boolean): void;
  /** The page is going away for good: end the run now. */
  pageGone(): void;
  /** The run ended another way (game over, quit, restart, unmount): never abandon it after this. */
  finish(): void;
  /** True once the run was abandoned. */
  abandoned(): boolean;
}

export function createAwayWatch({
  onAbandon,
  limitMs = ABANDON_AFTER_MS,
  now = () => performance.now(),
}: AwayWatchOptions): AwayWatch {
  let awaySince: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  let wasAbandoned = false;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const abandon = () => {
    if (done) return;
    done = true;
    wasAbandoned = true;
    clear();
    const idleMs = awaySince === null ? 0 : Math.max(0, now() - awaySince);
    onAbandon(idleMs);
  };

  return {
    setAway(away) {
      if (done) return;
      if (away) {
        if (awaySince !== null) return;
        awaySince = now();
        timer = setTimeout(abandon, limitMs);
      } else {
        awaySince = null;
        clear();
      }
    },
    pageGone() {
      abandon();
    },
    finish() {
      done = true;
      clear();
    },
    abandoned() {
      return wasAbandoned;
    },
  };
}
