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
 * here as a constant rather than an import, because Jane's number must not
 * move whatever the roster says.
 *
 * It is no longer the only answer, though. A second speaker DOES get a second
 * seed: `speakers.f0_seed`, read by `process-clips` for the `--speaker` it was
 * given and passed through `resolveSeed` below. A ~110Hz male voice searched
 * from 168 is a band centred nearly an octave above his own register, which is
 * precisely the condition octave correction exists to survive and sometimes
 * does not — and a seed that wrong does not fail loudly, it produces a
 * plausible polyline measured off the wrong harmonic. Jane's row holds exactly
 * `168`, so her 120 corridors resolve to the same number by a different route.
 *
 * Changing this — or a speaker's `f0_seed` — re-cuts that speaker's whole
 * inventory. Do it deliberately, with `--all`, or not at all.
 * `clipPipeline.test.ts` pins the number, the resolution, and the cut it
 * produces, and proves the golden still moves at another speaker's seed.
 */
export const SEED_F0_CENTER = 168;

/**
 * The seed for one speaker: their own `f0_seed`, or Jane's pinned constant
 * when there is no roster row to read one from.
 *
 * The fallback is for a caller with no speaker at all, not for a blank column
 * — `speakers.f0_seed` is `not null` in the schema (migration 0015), so a row
 * always carries one. `process-clips` refuses an unknown `--speaker` outright
 * rather than reaching this default, which is the point: defaulting a male
 * speaker's seed to a female speaker's would be the silent version of the
 * failure this parameter exists to prevent.
 *
 * `Number.isFinite`, not `typeof === "number"`. `Number(undefined)` is `NaN`
 * and `NaN` IS a number, so the obvious guard would let a renamed or dropped
 * `f0_seed` column through as a seed of `NaN` — which does not throw, it cuts
 * the whole inventory off a garbage search band and prints "seed NaNHz". That
 * is precisely the silent-corruption class this parameter exists to prevent,
 * from the one direction the guard looked like it already covered.
 *
 * Note what this does NOT do: a non-finite value is only defaulted here for a
 * caller that never had a speaker. A caller that has already validated one
 * against the roster and still reads a non-finite seed is looking at a bug,
 * and `process-clips` refuses rather than quietly cutting as Jane.
 */
export function resolveSeed(f0Seed: number | null | undefined): number {
  return Number.isFinite(f0Seed) ? (f0Seed as number) : SEED_F0_CENTER;
}

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
