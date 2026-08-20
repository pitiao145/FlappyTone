/**
 * Screen Wake Lock, so the phone doesn't dim/lock mid-run — the game and
 * visualiser are voice-controlled and produce no touch input at all.
 *
 * Not required for play, so every failure mode here is silent: unsupported
 * browsers, a rejected request (e.g. the tab wasn't visible at request time),
 * and a lock the OS releases on its own all just leave the screen unheld.
 */

let sentinel: WakeLockSentinel | null = null;

export async function acquireWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator) || sentinel) return;
  try {
    const s = await navigator.wakeLock.request("screen");
    // A request in flight while we were losing interest (e.g. the tab went
    // hidden before it resolved) would otherwise leak a sentinel nothing
    // releases.
    if (sentinel) {
      void s.release();
      return;
    }
    sentinel = s;
    sentinel.addEventListener("release", () => {
      if (sentinel === s) sentinel = null;
    });
  } catch {
    /* denied or unsupported at request time — play continues without it */
  }
}

export function releaseWakeLock(): void {
  const s = sentinel;
  sentinel = null;
  void s?.release();
}
