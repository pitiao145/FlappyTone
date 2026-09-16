# SPEC — Recording booth v2: overview screen, explicit arming, multi-voice-ready

**Status:** proposed, not built. Scope is `src/record/` only. No schema change,
no Worker change, no pipeline change.

## Why

Three things about the booth are wrong today, and one of them destroyed real
audio on 16 Sep 2026.

1. **The mic arms before Jane has seen anything.** `RecordApp.tsx`'s "Tap to
   start" opens the mic and drops straight into `Recorder.tsx`, which is
   already listening on the first pending word. There is no moment where she
   can see what is left, what is done, or decide to do nothing. The screen
   that tells her to get ready *is* the screen that starts recording.
2. **"Redo a word" has no picker.** `Recorder.tsx:297` reads
   `onClick={() => goTo(recorded[0].id)}` — it jumps to whatever sits first in
   the recorded list, with the mic live. The real picker ("Recorded (N) — tap
   to redo") exists only on the main recording screen, which is unreachable
   once `pending` is empty. During the live pipeline test Pierre tapped "Redo
   a word" expecting a list, landed on `ma1b` (媽) with the mic armed, spoke,
   and overwrote Jane's published take with his own voice. The row flipped to
   `recorded`, which removed 媽 from the published catalog, from the Worker's
   word map, and from the calibration flight. Recovered by hand via SQL plus
   an R2 delete. **The booth must not be able to do that by accident.**
3. **There is no way to stop listening.** Once the sink is installed, any
   sound loud and long enough is a take on the current word. Coughing, talking
   to someone in the room, or reading the screen aloud all upload.

A fourth thing is coming: **a second voice.** The same 120 words need a male
recording. The data model for that is not designed yet and is out of scope
here, but the booth's UI should not have to be rebuilt to accommodate it.

## What changes

### 1. A new phase between the passcode and the mic

`RecordApp.tsx`'s `Phase` becomes `passcode` → `overview` → `recording`. The
mic opens on the transition *out of* `overview`, inside the click handler,
same as today (CLAUDE.md hard rule 4 — this is the one thing that must not
move).

The **overview screen** is a new component, `src/record/Overview.tsx`. It owns
the word fetch that `Recorder.tsx` does today, so the list is on screen before
any audio device is touched. It shows:

- A header line: `N recorded · M still to record`, plus the session id.
- **To record (M)** — the pending words, in `position` order.
- **Recorded (N)** — collapsed by default, expandable. Each row shows its
  status badge: `recorded` (uploaded, not yet processed) or `published` (live
  in the game).
- A primary button: **Start recording** → opens the mic, enters `recording` at
  the first pending word.
- On each word row, a secondary **Record this one** action → opens the mic and
  enters `recording` pinned to that word. This is the redo path, and it is the
  *only* redo path from a cold start.
- **Refresh list**, unchanged in behaviour.

A word whose status is `published` gets a confirm step before the booth will
arm on it: "媽 is already live in the game. Re-recording replaces it. Continue?"
A `recorded`-status word does not — nothing downstream has consumed it yet.
This confirm is the specific guard against the incident above.

`Recorder.tsx` stops fetching. It receives `pending`, `recorded`, `startId`
and an `onExit` callback as props. `fetchBoothWords`, `loadProgress`/
`saveProgress` and the load/error/retry states move up to `Overview.tsx`. The
"Refresh list" button inside the recorder keeps working by calling back up.

### 2. An explicit armed/paused state

`Recorder.tsx` gains one piece of state, `armed: boolean`, and one control — a
prominent toggle, **Pause mic / Resume**. Paused is not a cosmetic flag:

- The frame sink stays installed (tearing it down drops the pre-roll buffer —
  see the sink effect's own comment), but when `armed` is false it updates the
  level meter and returns before touching `TakeDetector`. `detector.disarm()`
  is called on the transition into paused.
- The word display stays on screen, so she can see where she is.
- The feedback line reads **"Mic paused"** in place of "Say it when you're
  ready", with the level meter visibly dimmed. Ambiguity here is what caused
  the incident — the booth must never look like it is waiting for a tap when
  it is actually recording.

Arming rules:

- Entering `recording` from **Start recording** arms immediately. That is the
  bulk path and Jane should not have to press twice per session.
- Entering `recording` from **Record this one** (a redo) starts **paused**.
  She lands on the word, reads it, and taps Resume when she is ready. This is
  the second half of the incident guard: the accidental path is now two
  deliberate taps, not zero.
- A rejected take (`short`/`clipped`) re-arms as today.
- Any take uploaded for a `published` word leaves the booth **paused** after
  the "got it ✓" beat instead of advancing, so a redo cannot run on into the
  next word.

### 3. A way back to the overview

A **Back to list** control on the recording screen, and on the all-done
screen. It disarms, stops the mic (`stopMic()`), and returns to `overview`,
which refetches. In-flight uploads must survive this — the `Uploader` instance
therefore moves up to `Overview.tsx` alongside the word state, so leaving the
recording screen does not drop a queued take on the floor. The all-done
screen's current "Redo a word" button is deleted; it becomes "Back to list".

### 4. Multi-voice: UI shape only, no data model

Nothing about speakers is built here. Two constraints so it slots in later
without a rewrite:

- **The overview's header carries a speaker line** — `Voice: Jane` — rendered
  from a single constant in one place, not hardcoded into copy. Today it has
  one value.
- **`BoothWord.status` is presented as "recorded for *this voice*", not as a
  global fact.** Keep the pending/recorded split coming from the server
  (`GET /booth/words`) and do not cache it anywhere; when a `speaker` column
  lands, that route changes shape and the booth follows, with no local state
  to reconcile.

Explicitly out of scope: a speaker picker, a `speaker` column, per-speaker R2
keys, and anything in `process-clips`. The male-voice pass needs its own spec,
because `words.status` is currently one row per word and a second voice makes
that a one-to-many — that is a schema decision, not a UI one.

## What does not change

- The passcode flow, `requireRecordBaseUrl()`, and the Worker's `/auth`,
  `/raw` and `/booth/words` routes.
- `takeDetector.ts`, `takeBuffer.ts`, `boothQueue.ts`, `upload.ts`,
  `progress.ts` — all pure/logic modules, untouched.
- Hands-free advance through the pending list. That is the booth's whole
  reason to exist and the redesign must not cost it: once armed and working
  through pending words, Jane still presses nothing.
- The frame sink's install-once discipline and its 10Hz React readout
  (CLAUDE.md hard rule 1).

## Verify

- `npm run typecheck`, `npm test`, `npm run build`.
- New unit tests: the arm-state rules (redo starts paused; bulk start armed;
  a published-word take leaves it paused), and that a paused sink enqueues
  nothing for a loud frame.
- Manual, on a phone, against the live Worker:
  1. Passcode → overview appears with no mic prompt.
  2. Start recording → mic prompt → first pending word, armed, advances
     hands-free through two words.
  3. Back to list → overview shows those two as recorded.
  4. Record this one on a **published** word → confirm dialog → lands paused →
     nothing uploads until Resume.
  5. Pause mid-session → speak → nothing uploads, no advance.
- Confirm no take reached R2 during step 4/5: `npm run process-clips -- --dry-run`
  reports no new raw takes.
