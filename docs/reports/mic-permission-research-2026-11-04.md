# Mic permission failures: browser research and a ranked plan

Date: 2026-11-04. Branch: `research/mic-permission-failures`. Input: `docs/reports/mic-permission-failures-analytics-2026-11-04.md` (63 people asked for the mic in 30 days, 12 had a failure, 7 never got it working, 4 patterns).

This is research only. No code is changed. Each answer gives the sources, how current they are, and a confidence level:
- **High:** read in the current browser source code or a spec, and it matches our data.
- **Medium:** one good source, or source code that we cannot confirm on a device yet.
- **Low:** forum reports, old sources, or inference.

---

## 0. The main finding, in plain words

**The app loses the "tap" before it asks for the mic.**

A browser gives extra trust to code that runs *during* a tap. Browser engineers call this a "user gesture". WebKit (the engine inside every iOS browser) only checks the gesture at the exact moment `getUserMedia` is called (`getUserMedia` = "ask for the mic").

Today `startMic` (`src/audio/mic.ts`) does three slow steps first and waits for each one:
1. `await ctx.resume()` (start the audio engine),
2. `await ctx.audioWorklet.addModule(...)` (load the small capture program),
3. then `getUserMedia(...)`.

Each `await` lets the tap "finish". When step 3 runs, WebKit no longer sees a tap. WebKit source shows two rules that then apply only to requests *without* a tap:

| WebKit rule (current `main` source) | Effect on FlappyTone |
|---|---|
| A denial earlier in the page is reused, **but only if the new request has no tap** (`getRequestAction`: `if (!request.isUserGesturePriviledged() && wasRequestDenied(...)) return Deny`) | **Pattern 1.** After one "Don't Allow", every "Try again" is refused in under 1 s with no prompt, until a reload. A request *with* a tap would show the prompt again. |
| An earlier "Allow" is reused without a tap **only if the mic was in use less than 1 minute ago on iPhone** (10 min on desktop) (`hasGrantedRequest` + `defaultInactiveMediaCaptureStreamRepromptWithoutUserGestureIntervalInMinutes` = 1 on iOS) | **Player K.** The mic worked twice, then sat unused for about 4.5 min (`stopMic` after each run). The next request had no tap and was older than 1 minute, so the old "Allow" no longer counted. It was refused, and every retry hit the denial rule above. A reload cleared it. |

A WebKit engineer states the same 1-minute rule in WebKit bug 215884 (comment, 2021–2026 thread): "after capture stops it should recur only after about one minute of inactivity".

**So the recommended first change is to call `getUserMedia` first, inside the tap, before any `await`.** This is cheap, keeps every hard rule, and on paper fixes pattern 1 and player K. It must be proven on a real iPhone (section 3, change 1), because Safari's own prompt code is closed source and we cannot read it.

---

## 1. Answers to the 9 questions

### Q1. iOS Safari: after a denial, does every later request in the same page load fail with no prompt? Can the app prompt again without a reload?

**Answer.** It depends on the tap.
- A request **without a tap** is refused at once with `NotAllowedError` for the rest of the page load. WebKit keeps a list of denied requests (`m_deniedRequests`). A later grant or `resetAccess` clears it. In practice a reload clears it too (D, J, K all recovered that way); the exact reload trigger is outside the file we read.
- A request **with a tap** skips that list and goes to "prompt" again.
- Today every FlappyTone request reaches `getUserMedia` after two `await`s, so it has no tap. That is why Pierre's "Try again" was refused in 800 ms (analytics report, section 5).
- Also: one tap gives tap trust to **one** mic request only (`computeUserGesturePriviledge` in WebKit `MediaDevices.cpp`). Two `getUserMedia` calls in one tap: the second has no tap.

**Should the app reload on retry?** Keep "Reload" as the fallback button (it works today: D, J, K all recovered by reload). After change 1, "Try again" should show the prompt again, so the reload becomes the second step, not the first. An automatic reload is not needed and would lose game state.

**Other ways to get a fresh prompt (iframe, new document):** not needed if change 1 works. A same-origin iframe uses the same denial list (it matches by origin), so it does not help.

**Sources:** WebKit `Source/WebKit/UIProcess/UserMediaPermissionRequestManagerProxy.cpp` and `Source/WebCore/Modules/mediastream/MediaDevices.cpp`, GitHub `main`, read 2026-11-04. Gesture lost after `await addModule`: WebKit bug 247614 (Chris Dumez, 2022; the fix there was for Web Audio playback only, not for `getUserMedia`).

**Confidence:** High for the WebKit logic. Medium that Safari (closed source on top of WebKit) shows the prompt for a tapped retry: must be tested on an iPhone.

### Q2. iOS Safari: can a granted mic be refused later in the same page load? Would one open stream for the whole session help?

**Answer.** Yes. WebKit forgets a grant in two ways:
1. **Without a tap, after 1 minute with no active mic (iPhone).** This is player K (see section 0).
2. **For everyone, after 10 minutes with no active mic** (`InactiveMediaCaptureStreamRepromptIntervalInMinutes = 10`, a timer, `watchdogTimerFired`, clears all grants). A request with a tap then shows the prompt again. It is not a failure unless the player taps "Don't Allow". (A mic in use keeps the grant for 24 hours.)
3. A grant is also not reused while capture is muted by the system, or while the page is not visible (the request waits until the page is visible).

Not causes: the number of `getUserMedia` calls (no counter in the code), `track.stop()` by itself (it only starts the 1-minute and 10-minute clocks).

A separate, rarer cause: WebKit bug 319706 (iOS 26.3–26.6, fixed in the Safari 26 branch in Sept 2026): after an iOS audio-system reset, mic requests fail with `NotAllowedError` even with permission. A reload did not always fix it. K was fixed by a reload, so K is probably not this bug. But it can produce `permission-denied` failures that no copy can fix.

**One stream for the whole session?** Not recommended as the first step.
- It would avoid the 1-minute rule between runs.
- But on iOS a live mic sends all sound to the earpiece (quiet). The cue fix in `docs/flappytone-SPEC-ios-audio-routing.md` depends on stopping the mic during cues. A stream that stays open between runs would also keep the menus and TONEder audio on the earpiece, and keep the orange mic dot on while the player is not playing.
- The game already stops and restarts the stream during a run (cues). Those restarts are fine because the mic was active seconds before (under 1 minute).
- Change 1 solves the same problem without the trade-off.

**Sources:** same WebKit files as Q1, plus `Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml` and `Source/WebKit/Shared/WebPreferencesDefaultValues.cpp` (read 2026-11-04). WebKit bug 215884 (last change 2026-10-12). WebKit bug 319706 (2026-07 to 2026-09).

**Confidence:** High for the timers (source code). Medium that this explains K (fits the times exactly, but K's first failure has no `ms` field).

### Q3. Does `navigator.permissions.query({name:'microphone'})` ever return `denied` on iOS Safari?

**Answer.** Not reliably before the first request.
- WebKit bug 257710 (opened 2023, still open): with "Deny" saved in Safari's site settings, the query returns `prompt` until the page makes its first `getUserMedia` call.
- A WebKit engineer says it should return `denied` after a denied request. Our own test shows it still returned `prompt` after a "Don't Allow" (analytics report, section 5). WebKit has a rule that turns a stored "denied" into "prompt" for the page in some cases (`shouldChangeDeniedToPromptForMicrophone`), which can hide the state on purpose (privacy: a site should not learn that it was blocked).

**How to detect a stored denial before asking:** there is no clean way on iOS. Practical signals:
- `ms` under about 1 s on a failure = no prompt was shown = a stored or page-load denial. The app already measures this.
- After change 1, a tapped request shows the prompt unless "Deny" is saved for the site. So "a tapped request refused in under 1 s" will mean "Deny is saved in Safari settings" (or a system-level block). The app can then show the settings steps first instead of "Try again".

**Sources:** WebKit bug 257710 (last change 2023-07); WebKit source as above; our own test, 2026-11-02.
**Confidence:** High that the query cannot be trusted on iOS. Medium on the exact behaviour after a denial on current iOS 26.

### Q4. Safari's per-site Allow / Deny / Ask

**Answer.**
- **Default for a new site: Ask.** The global default is in Settings → Apps → Safari → Microphone (iOS 18 and later; older iOS: Settings → Safari → Microphone). Per site: the page menu in Safari's address bar (`aA`, or the `⋯` page menu on iOS 26's new layout) → Website Settings → Microphone.
- **What the page sees:**
  - Ask: a prompt. Grant lasts as described in Q2.
  - Allow: no prompt, `getUserMedia` succeeds in 0.2–1.6 s (`perm_before: granted` in our data). This is Pierre's setup, which is why he never sees failures.
  - Deny: instant `NotAllowedError`, no prompt, and `permissions.query` still says `prompt` (Q3).
- Safari is a system app, so iOS has no separate "Safari can use the microphone" switch in Privacy settings. Chrome, Firefox and Edge on iOS do have one (Settings → Apps → Chrome → Microphone).

**Help copy changes (for a later step):**
- Fix the path: "Settings → Apps → Safari → Microphone" (the current copy says "Settings → Safari → Microphone", which is the pre-iOS 18 path).
- The `aA` button moved in iOS 26 Safari. Verify the exact path on a real iPhone before changing the copy.
- Add a line for Chrome on iOS: "Settings → Apps → Chrome → Microphone".
- The best copy is the one we do not need: after change 1, "Try again" should show the prompt again.

**Sources:** how-to guides for iOS 18 Safari settings (laptops251.com, maketecheasier.com, 2024–2025), Apple device-management doc for Safari settings. These are secondary. **Confidence:** Medium. Menu names must be checked on a device.

### Q5. Chrome (Android and desktop): when does a dismissed prompt become a block?

**Answer.** Chrome counts, per site and per permission:
- **Dismiss** (close the prompt with ✕ or tap outside): after **3 dismissals** the site is blocked for **7 days**.
- **Ignore** (leave the prompt open and navigate away or reload): after **4 ignores**, blocked for 7 days.
- **Quiet prompt** (the small icon in the address bar instead of a pop-up): blocked after **1 dismissal** or **2 ignores**.
- During this block, `getUserMedia` fails at once with `NotAllowedError`. The message text tells the cases apart: `"Permission dismissed"` (closed the prompt), `"Permission denied"` (blocked by the person or by the 7-day block), `"Permission denied by system"` (Android or the OS blocks Chrome itself).
- Camera and mic are covered by this rule (they are "permissions" in Chrome's list).

**Player H** (22 failures over 2 days, every reload failed): fits a saved "Block", the 7-day block after repeated dismissals, or Android blocking Chrome's mic. Player L (9 `/app` loads in 2 minutes) shows how fast reloads can count as ignores.

**How to ask so a dismissal does not become a block:**
- Ask only after a clear tap on a button that names the mic ("Allow the microphone"), never on page load. FlappyTone already does this.
- After a dismissal, do not ask again on the next screen. Show the help first, and ask only when the person taps "Try again".
- Record the message text (tracking fix T1) so we know which case we are in.
- Chrome 151 (June 2026) ships the `<usermedia>` HTML element: a browser-drawn button that gives the stream directly and can **recover a blocked site in one tap** without the settings page. Google reports, from the trial: Google Meet +131% recovery after a first denial; Cisco about 10% → over 65% grant after an earlier denial; Zoom −46.9% capture errors. Other browsers show the fallback button inside it. This is the best fix for pattern 2 on Chrome, but it is new: see change 5.

**Sources:** Chromium `components/permissions/permission_decision_auto_blocker.cc` (`main`, read 2026-11-04: `kDefaultDismissalsBeforeBlock = 3`, `kDefaultIgnoresBeforeBlock = 4`, quiet UI 1/2, `kDefaultEmbargoDays = 7`; field trials can change these); Blink mediastream error strings (`main`, read 2026-11-04); Chrome blog "Introducing the `<usermedia>` HTML element" (2026-06-29).
**Confidence:** High for the counts. Medium for H's exact cause (no message text yet).

### Q6. In-app browsers (Instagram, Facebook, LINE, TikTok, Threads)

**Answer.** No public, current list exists. What is known:
- **iOS:** every in-app browser is a `WKWebView` (the same WebKit). `getUserMedia` works there since iOS 14.3. The host app must (a) have its own iOS mic permission and (b) let the page ask. Instagram, Facebook, Threads, TikTok and LINE all use the mic for their own features, so (a) is usually present. When the host app does not override the web-view permission handler, the page gets the normal prompt. If the person never gave the host app the mic, iOS first asks for the app, then the site asks: two prompts in a row, and more chances to say no. The WebKit rules in Q1–Q2 apply in full.
- **Android:** each host app must write code (`onPermissionRequest`) and hold the Android `RECORD_AUDIO` permission. If it does not, every request is refused at once with no prompt. LINE on Android does this (seen in our data, 2026-11). Facebook, Instagram and TikTok on Android: not confirmed.
- In-app browsers keep their own storage, so a "Deny" there and a "Deny" in Safari/Chrome are separate.

**What to do:** do not try to keep a list by hand. Measure it: `in_app_browser` is already a super property on every event; after T1 adds the message text, and with `ms`, PostHog will show per app whether the mic works, prompts, or refuses at once. Keep the "open in your browser" notice before the first request (it is already there).

**Sources:** Apple Developer Forums and Ionic/Capacitor reports on WKWebView capture (2021–2025); Android `WebChromeClient.onPermissionRequest` guides and the Google sample; our own LINE observation. **Confidence:** Low to medium. The only reliable answer is our own data per app.

### Q7. Does a pre-prompt explanation reduce denials?

**Answer.** Yes, the evidence points that way, but there is no study for a web mic prompt specifically.
- Google field study of Android permission prompts: requests with an explanation had about **half the deny rate**; a person who did not expect a request was **more than twice as likely** to deny it.
- CISPA study of Android permission explanations (NDSS 2025): specific explanations ("so the bird can hear your tone") work better than vague ones.
- Chrome's own position (with the `<usermedia>` work): ask at the moment of use, from a button the person tapped. Their trial numbers are in Q5.
- Blog figures like "67% → 89%" exist but are not peer-reviewed. Ignore them.

**For FlappyTone:** the "Before you start" screen already explains before the prompt, and the request comes from a tap. Two small points: put the mic line at the top and name the reason in game terms ("The bird listens to your voice. Your browser asks next: tap Allow."); and do not ask on any screen the person did not choose (the app already does not).

**Sources:** Google research PDF on Android runtime permission dialogs (storage.googleapis.com, pubtools 6340); CISPA rationale study (2025); Chrome blog (2026-06-29). **Confidence:** Medium for "explanation helps". Low for any exact number.

### Q8. Installed iOS PWA (Home Screen web app): does the mic permission last between launches?

**Answer.** No. Each launch asks again.
- A Home Screen web app has no per-site "Allow" setting like Safari. The grant lives only in memory for that launch, with the same 1-minute and 10-minute rules as Q2.
- A WebKit engineer said in 2026 that persistent permission for Home Screen apps is a separate, open request (WebKit bug 327237).
- Changing `location.hash` or the URL during a run can reset the permission in standalone mode (bug 215884). The routing spec already forbids this. Keep it.
- **Effect:** PWA players will see the prompt on every launch, and more often between runs (Q2). Change 1 matters even more for them.

**Sources:** WebKit bug 215884 (comments through 2026-10-12); GitHub issue reports 2024–2025. **Confidence:** Medium-high.

### Q9. Can the constraints (all three processing flags `false`) cause problems?

**Answer.** No, as written.
- A plain `false` (not `{exact: false}`) is an "ideal" wish in the spec, not a hard rule. A browser that cannot turn a feature off ignores it. It never throws `OverconstrainedError`. (`OverconstrainedError` only comes from `exact`, `min`, `max`.) WebKit also rejects a few constraints as "not allowed when required", but only for `deviceId`-type rules, which we do not use.
- Constraints do not change the permission check. Permission is decided before devices are matched.
- Side note: Chrome on some Android devices ignores `autoGainControl: false` unless echo cancellation is also off. We turn all off, so this is fine.

**Sources:** W3C Media Capture and Streams spec (constraint "ideal" values); WebKit `MediaDevices.cpp` (`hasDisallowedRequiredConstraintForDeviceSelection`); addpipe.com audio constraints tests (older, 2017–2023). **Confidence:** High.

---

## 2. What each pattern most likely is

| Pattern | People | Most likely cause | Main fix |
|---|---|---|---|
| 1. iOS: one denial blocks the page load | D, J, K (maybe E) | `getUserMedia` runs after two `await`s, so WebKit treats the retry as "no tap" and reuses the denial. K: same, plus the 1-minute grant rule. | Change 1 |
| 2. Mic blocked for the site | H (maybe I) | Chrome: saved "Block", 7-day block after dismissals, or Android blocks Chrome's mic | Change 3 (copy by message), change 5 (`<usermedia>`) |
| 3. Fail once or a few times, then leave | B, C, E, F, I, L | Mixed: a real "Don't Allow", in-app browser refusals, double prompt (app + site). Not knowable without the new fields. | Change 1 (lets "Try again" work), change 2, tracking T1–T3 |
| 4. Fail, then succeed seconds later | A, G | Chrome/Edge: first prompt dismissed, second accepted (allowed until the 3rd dismissal) | Already OK. Change 3 makes the first failure screen clearer. |

---

## 3. Ranked changes

Rank = expected effect ÷ (cost + risk). All keep the hard rules: AudioWorkletNode only (2), every audio call inside the tap (4 — change 1 makes this *stronger*), no mic code on site pages up front (13), no voice upload (12).

### Change 1 — Call `getUserMedia` first, inside the tap (recommended first)

**What:** in `startMic` (`src/audio/mic.ts`), start the `getUserMedia(...)` call synchronously at the top, before `ctx.resume()` and `addModule()`. Also create the `AudioContext` and call `resume()` synchronously in the same tap (no `await` between them), then `await` all of them together. The worklet loads in parallel. Keep the "one live stream" rule: the later `acquireStream` path stays as it is.

Also check `ensurePlaybackCtx()` (`src/audio/reference.ts`), which is called just before `ensureMic` in the same tap: it must not `await` anything before `ensureMic` runs. Today it is called with `void`, so it does not block. Keep that order.

Every caller already calls `ensureMic` synchronously inside the click handler, so only `mic.ts` changes. All 6 surfaces (game gate, in-app Visualiser, Settings, Try it now, tone visualizer, recording booth) get the fix at once.

**Fixes:** pattern 1 ("Try again" shows a new prompt instead of a silent refusal) and K (a tapped request reuses the old grant after any idle time under 10 minutes; after 10 minutes, the person gets a prompt, not a failure).
**Expected effect:** 3 of the 4 pattern-1 people would not have needed a reload. Players who stop for over 1 minute between runs (TONEder, end screen, Progress) stop risking K's failure. Unknown share of pattern 3 (E maybe).
**Cost:** small (one function, about 30 lines), plus tests for the order of calls.
**Risk:** low to medium. A failure path must still close the `AudioContext` (see T5). The gesture must stay one mic request per tap.
**Must test on a real iPhone (Safari, current iOS 26, and an older iOS 17/18 if possible):**
1. New site (setting "Ask"): tap → prompt → "Don't Allow" → "Try again" → **the prompt shows again** (today: refused in 800 ms). This one test confirms or rejects the main finding.
2. Allow, play one run, wait 2 minutes on the end screen, start a new run → no prompt, no failure.
3. Allow, wait 11 minutes, start a run → a prompt (expected), not a failure.
4. Site setting "Deny" → instant failure, help panel shows the settings steps.
5. Cue loudness: cues still play from the bottom speaker (routing spec checklist 1).
6. Home Screen PWA: same tests 1–2.
7. Chrome on iOS (same WebKit) and the Instagram in-app browser on iOS: tests 1–2.
**Android/desktop:** Chrome and Firefox do not have WebKit's "no tap" rules, so no change is expected. Test that the first prompt, a denial and a retry still work on Android Chrome and desktop Chrome, Edge, Firefox, Safari (macOS: same rules as iOS, but 10 minutes instead of 1).

### Change 2 — Make "Try again" do one clean request per tap

**What:** after change 1, "Try again" itself becomes the fix on iOS. Make sure nothing else asks for the mic in that same tap (one tap = one tapped mic request in WebKit). Then reorder the iOS help panel: "Try again" first, "Reload" second, settings steps third. Show the settings steps first only when a tapped request was refused in under 1 s (= Deny saved).
**Fixes:** pattern 1 and 3 on iOS. **Cost:** small (UI order and one `ms`-based branch). **Risk:** low.
**Test:** iPhone tests 1 and 4 from change 1.

### Change 3 — Help copy by cause (Chrome message text, iOS path fixes)

**What:** use the error message (T1) to pick the help text:
- `Permission dismissed` → "You closed the box. Tap Try again and choose Allow." (Do not show settings steps.)
- `Permission denied` → site settings steps + Reload.
- `Permission denied by system` → Android/OS steps: "Settings → Apps → Chrome → Permissions → Microphone → Allow".
- iOS: fix the Settings path ("Settings → Apps → Safari → Microphone" on iOS 18+), add Chrome-on-iOS, check the iOS 26 page-menu path on a device.
Copy in English and Traditional Chinese (hard rule 9), in `src/ui/micHelpCopy.ts`.
**Fixes:** pattern 2 and 4 (fewer people stuck in a 7-day block; fewer people sent to settings when a retry would work). **Cost:** small. **Risk:** low (copy only; a wrong path is the risk, so verify on devices).
**Test:** Android Chrome: dismiss 1×, block via site settings, block Chrome's mic in Android settings; check each shows the right text. iPhone: open each path in the copy.

### Change 4 — In-app browser data and notice

**What:** no code change at first. After T1, read per-app results for 2–4 weeks (`in_app_browser` × `ok` × `ms` × message). If an app always refuses at once (like LINE Android), show the "open in your browser" notice *instead of* "Continue here" for that app only.
**Fixes:** part of pattern 3. **Cost:** small later. **Risk:** low.
**Test:** open a FlappyTone link inside Instagram, Facebook, LINE, TikTok on one iPhone and one Android phone; record prompt / instant refusal / works.

### Change 5 — `<usermedia>` element on Chrome 151+ (later, after change 1–3)

**What:** on browsers that support it (`'HTMLUserMediaElement' in window`), draw the browser's own mic button on the gate, and keep the normal button inside it as the fallback for Safari and Firefox.
**Fixes:** pattern 2 (one-tap recovery from a block, no settings page) and some of pattern 3 on Chrome.
**Cost:** medium. It changes how the stream reaches `mic.ts` (the element gives a ready stream; `startMic` must accept one), and the element is drawn by the browser (limited styling).
**Risk:** medium. New API (June 2026). It must not touch the iOS path. It must not load mic code on site pages up front (hard rule 13 — the gate is in `/app`, so this is fine there; the site tools would need the same lazy load they use now).
**Test:** Android Chrome and desktop Chrome: new site, block, recover in one tap. Safari/Firefox: fallback button works.

### Not recommended

- **Keep one mic stream open for the whole session:** conflicts with the iOS loud-cue fix and adds a permanent earpiece route and mic dot (Q2). Change 1 covers the same failure.
- **Automatic reload on failure:** loses game state, and after change 1 it should not be needed.
- **Trust `permissions.query` on iOS to skip the prompt step:** it says `prompt` when "Deny" is saved (Q3). Keep it only as an analytics field.

---

## 4. Tracking gaps and fixes

Checked against the code on 2026-11-04. All fixes keep hard rule 10 (analytics never throws into a caller) and hard rule 12 (no voice data; these are UI and error facts only).

| # | Gap (report §6) | Confirmed in code? | Fix |
|---|---|---|---|
| T1 | We cannot tell "dismissed", "denied", "denied by system" apart | Yes: only `error_name` is sent | Add `error_msg`, a **closed set** mapped from `err.message`: `dismissed` (Chrome "Permission dismissed"), `denied` ("Permission denied" / "Permission denied by user"), `system` ("Permission denied by system"), `other`. Never send the raw text (it can contain device names). In `micErrorName`'s neighbour in `mic.ts`; carried on `MicError`. |
| T2 | An unanswered prompt sends nothing (report §6.3) | Yes: `report` runs only when `startMic` settles | Send `mic_asked {surface, attempt}` at tap time, and on `pagehide` while a request is still open send `mic {ok: false, reason: "unanswered", ms}` with PostHog's `sendBeacon` transport. Chrome counts this case as an "ignore" (Q5), so it matters. |
| T3 | Failures during a run are not tracked (report §6.4) | Yes: `acquireMicStream` and `recoverMic` in `session.ts` catch and only set status `lost` | Send `mic_reacquire {ok, phase: "cue" \| "recovery", error_name, error_msg, idle_ms}` from those two catch blocks (and once on success after a `lost`). `idle_ms` (time since the stream was released) tests the 1-minute rule directly. Rate-limit to one failure event per run. |
| T4 | `mic` is gameplay tier, so failures of players who turned off "Share game data" are dropped (report §6.2) | Yes: `mic` is in the gameplay set; `mic_help` is global (`src/analytics/session.ts`) | **Pierre's decision.** Proposal: move `mic` (and T2/T3 events) to global tier, like `mic_help`. They hold no voice data, only whether the browser gave the mic. Check `docs/legal/privacy-policy.md` wording first (the policy describes the tiers). |
| T5 | `AudioContext` not closed when `startMic` fails before `getUserMedia` (report §6.6) | Yes: `new AudioContext()`, `ctx.resume()`, `addModule()` sit outside the `try` that closes `ctx` | Wrap everything after `new AudioContext()` in one `try`/`catch` that clears `node.port.onmessage` and closes `ctx`. Naturally part of change 1 (the call order changes there anyway). Also send `stage: "context" \| "worklet" \| "gum"` on failure, so `reason: unknown` gets a cause. |
| T6 | `surface: app` covers 3 places (report §6.5) | Yes: `Visualiser.tsx` (`toggleMute`), `Settings.tsx` (`goListening`) and the gate all call `ensureMic()` with no argument | Add `app-visualiser` and `app-settings` to `MicSurface` (`src/analytics/session.ts`) and pass them at those two call sites. Also note the in-app Visualiser opens through the gate (`openVisualiser` → `requestMicAndThen`), so the gate's request should send `app` only for game runs: pass the destination from `requestMicAndThen` to `confirmSilentGate`. |
| T7 | Old events lack device fields (report §6.7) | Fixed since Nov 2 | No action. |

**Order:** T5 and T1 go with change 1 (same file). T6 and T3 are small and can follow. T2 next. T4 waits for Pierre.

**Docs to update with the code:** `docs/ARCHITECTURE.md` "Play analytics" → "In-app browser and the mic step" paragraph (new fields, surfaces, tier) and `docs/flappytone-SPEC-ios-audio-routing.md` (the gesture rule and the 1-minute WebKit rule).

---

## 5. Sources (read 2026-11-04)

WebKit source, GitHub `WebKit/WebKit` `main`:
- `Source/WebKit/UIProcess/UserMediaPermissionRequestManagerProxy.cpp` (`getRequestAction`, `hasGrantedRequest`, `watchdogTimerFired`, `captureStateChanged`)
- `Source/WebCore/Modules/mediastream/MediaDevices.cpp` (`computeUserGesturePriviledge`, `getUserMedia`)
- `Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml` (reprompt intervals: 10 min, 24 h)
- `Source/WebKit/Shared/WebPreferencesDefaultValues.cpp` (no-gesture interval: 1 min iOS, 10 min desktop)
- `Source/WebCore/dom/UserGestureIndicator.h/.cpp` (gesture tokens)

WebKit bugs:
- [257710](https://bugs.webkit.org/show_bug.cgi?id=257710) Permissions API shows "prompt" for a denied mic (2023, open)
- [215884](https://bugs.webkit.org/show_bug.cgi?id=215884) standalone (Home Screen) re-prompts; engineer comments on the 1-minute rule (2020–2026-10)
- [319706](https://bugs.webkit.org/show_bug.cgi?id=319706) iOS 26 audio reset → `NotAllowedError` with permission (2026-07 to 2026-09, fixed)
- [247614](https://bugs.webkit.org/show_bug.cgi?id=247614) gesture lost after `await addModule` (2022)

Chromium source, `main`:
- [`components/permissions/permission_decision_auto_blocker.cc`](https://chromium.googlesource.com/chromium/src/+/main/components/permissions/permission_decision_auto_blocker.cc) (3 dismissals / 4 ignores / quiet UI 1 / 2 → 7-day block)
- Blink `modules/mediastream` error strings ("Permission dismissed", "Permission denied", "Permission denied by system")

Other:
- [Chrome blog: Introducing the `<usermedia>` HTML element](https://developer.chrome.com/blog/usermedia-html-element) (2026-06-29)
- [The Register on the permission element](https://www.theregister.com/2025/06/18/googles_fix_web_permissions_mozilla/) (2025-06)
- Google research PDF on Android runtime permission dialogs ([storage.googleapis.com](https://storage.googleapis.com/gweb-research2023-media/pubtools/6340.pdf)); [CISPA rationale study](https://cispa.de/en/rationals) (2025)
- iOS Safari settings guides: [laptops251.com](https://laptops251.com/how-to-allow-camera-and-microphone-permissions-for-website-in-safari-on-ios-18), [maketecheasier.com](https://maketecheasier.com/block-camera-microphone-location-access-safari-ios)
- WKWebView capture reports: [Ionic forum](https://forum.ionicframework.com/t/prevent-for-reprompting-webrtc-webview-permissions-ios15/215240), [Cordova plugin notes](https://www.npmjs.com/package/%40tokenized%2Fcordova-plugin-ios-permit-getusermedia), [Apple forum 734363](https://developer.apple.com/forums/thread/734363)
- Android WebView: [Google PermissionRequest sample](https://github.com/googlesamples/android-PermissionRequest)
- Constraints: [addpipe audio constraints](https://blog.addpipe.com/audio-constraints-getusermedia/), W3C Media Capture and Streams spec
