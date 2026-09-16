/**
 * The two constants that decide what `process-clips` measures.
 *
 * Here rather than in `process-clips.ts` for one reason: that script opens a
 * Supabase client and awaits at top level, so nothing can import it — and
 * these two need pinning by a test. Same move as `FALLBACK_COLUMNS` in
 * `src/data/catalogRows.ts`. Side-effect free: no client, no I/O, no imports.
 */

/**
 * Where the pitch search starts — NOT the reference it reports.
 *
 * `measurePitchReference` recentres off the session's own voiced frames, so
 * this does not decide the answer (CLAUDE.md's invariant 4 — the reference is
 * measured per session, never read from `speakers.json` — is intact). It DOES
 * decide the `PitchTracker`'s band-limit and octave correction while those
 * frames are being collected, so a different seed moves a handful of frames in
 * or out and shifts every resulting polyline in the third decimal.
 *
 * That is not a better or worse measurement, but it IS a different one.
 * Measured, 15 Sep 2026: seeding from the last published word's stored
 * reference (201.4Hz) instead of this moved **90 of the 120 shipped
 * polylines** — 90 corridors changing under players for no reason anyone
 * asked for. Durations, onsets and clip lengths were unaffected; only the
 * pitch-derived shape moved.
 *
 * So it is pinned at the value `make-clips` used — `fixtures/captures/
 * speakers.json`'s `{"jane": 168}`, resolved at `make-clips.ts:52` — carried
 * here as a constant rather than an import, because it is now a property of
 * the pipeline and not a fact about a speaker. A second speaker does not get
 * a second seed; they get the same search band and their own measured
 * reference.
 *
 * Changing this re-cuts the whole inventory. Do it deliberately, with
 * `--all`, or not at all. `clipPipeline.test.ts` pins both the number and the
 * cut it produces.
 */
export const SEED_F0_CENTER = 168;

/**
 * Below this a session's own voiced frames are too few to measure a centre and
 * a range from, and `computeF0Center`/`computeRangeSemitones` would be
 * describing a handful of syllables rather than a voice. Jane's 120-take
 * session gives 4651; a two-word top-up gives a few hundred, and a range
 * measured from two syllables of one tone is not a tone space.
 *
 * Under it, `process-clips` borrows the most recently published word's stored
 * reference and says so — Decision 9.
 */
export const MIN_REFERENCE_FRAMES = 400;
