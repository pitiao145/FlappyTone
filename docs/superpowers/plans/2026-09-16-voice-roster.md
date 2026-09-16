# Voice Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every word carry a recording from more than one speaker, so a male player hears cues in their own range, without changing the words, the tiers, the gating or the scoring.

**Architecture:** A `speakers` roster table plus a `word_clips` child table keyed `(word_id, speaker_id)`; every measurement (`polyline`, the three clocks, `clip_key`) moves off `words` onto the child row, so each voice flies its own corridor. The Worker serves `/clip/:speaker/:id`, the booth derives its speaker from the passcode and can write nowhere else, and the app resolves the player's stored *axis* (`{gender}`) to a speaker at load.

**Tech Stack:** Supabase Postgres (migrations via the Supabase MCP `apply_migration`), Cloudflare Workers + R2, React 19 + TypeScript + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-voice-roster-design.md` — read it before Task 1. The plan argues from the spec; where they disagree, the spec wins and you stop and say so.

**Branch:** cut `voice-roster` from `main` **after** `audio-migration` is merged. Do not start on `audio-migration`.

## Global Constraints

- **Migrations go through the Supabase MCP `apply_migration`**, never the dashboard. Regenerate and commit `src/data/database.types.ts` after each. Run `get_advisors` (security **and** performance) before calling a schema change done.
- **Raw-SQL migrations must include explicit `GRANT`s.** RLS narrows access; it does not grant it.
- **No client write policy** on `speakers` or `word_clips`. Service role only, same shape as `words`.
- **`min_tier` stays on `words`.** It is game access. Do not move it, do not add a per-speaker tier, do not reintroduce the first-N-words-per-tone rule.
- **`src/data/` never throws into a caller.** Every failure degrades.
- **Hard rules from CLAUDE.md apply throughout:** rAF loop outside React; `AudioWorkletNode` only; semitones not Hz; every audio API call behind a user gesture; `src/pitch/` has zero Web Audio; tunables live in `src/game/tuning.ts`; dev tooling behind `import.meta.env.DEV`; "couldn't hear that" never scores wrong; all hanzi Traditional.
- **Node-only scripts** must be in `tsconfig.node.json`'s `include` and `tsconfig.app.json`'s `exclude`.
- **Jane's speaker id is `jane`, her `f0_seed` is exactly `168`.** Her 120 polylines must not move by a decimal. `npm run export-fallback` producing a non-empty `git diff` on `src/data/wordsFallback.json` is a task failure.
- **Speaker id alphabet is `^[a-z0-9]{1,16}$`** — in the DB check constraint, in the Worker's path validation, and in the booth. One alphabet, three places, no variation.
- Commit once per task. Never push, never open a PR without Pierre's go-ahead.

## Model assignment

| Task | What it is | Model | Why |
|---|---|---|---|
| 1 | Migration `0015` + backfill | Sonnet 5 | SQL is written out verbatim below; the work is applying it and verifying row counts. |
| 2 | Catalog wire shape + flattener | Sonnet 5 | Pure types and a pure function, but it is the seam test and it must be got exactly right. |
| 3 | Worker `/clip/:speaker/:id` | **Opus 5** | Cache-key poisoning ships wrong audio to every player at once and is invisible to every other test. |
| 4 | App read path + cache keys | **Opus 5** | Touches `reference.ts`/`prefetch.ts`, under hard rule 4, plus two silent-failure cache keys. |
| 5 | `voice.ts` resolution | Haiku 4.5 | One pure function, fully specified, with its tests written out below. |
| 6 | Settings + calibration auto-pick | **Opus 5** | Calibration is delicate and a wrong settings-key move wipes every player's calibration. |
| 7 | Booth isolation in the Worker | **Opus 5** | Auth and cross-write containment. |
| 8 | Booth UI speaker name | Haiku 4.5 | Delete a constant, read a field. |
| 9 | Pipeline per-speaker | **Opus 5** | `f0_seed` and the byte-identical polyline guard; this is where silent corruption lives. |
| 10 | `voice` on `run_end` | Haiku 4.5 | One property through a closed allowlist. |
| 11 | Contract migration | Sonnet 5 | Drops and a route removal, gated on Task 9 having shipped. |

Tasks 1–4 and 7–10 can be reviewed independently. Task 11 must not run until the male set is recorded and `speakers.active` has been flipped.

---

### Task 1: Migration `0015` — the roster and the child table

**Files:**
- Create: `supabase/migrations/0015_voice_roster.sql`
- Modify: `src/data/database.types.ts` (regenerated, committed)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `public.speakers` and `public.word_clips` as defined below. Every later task reads these column names exactly as written here.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0015_voice_roster.sql`:

```sql
-- 0015_voice_roster.sql
-- A word stops having one recording.
--
-- `speakers` is the roster; `word_clips` holds everything that is MEASURED
-- from a recording, keyed (word_id, speaker_id). `words` keeps only what is
-- true of the word regardless of who says it — including `min_tier`, which is
-- game access and identical for every voice.
--
-- The old measurement columns on `words` are deliberately LEFT IN PLACE here.
-- They are dropped in a later migration, after the app reads the new shape, so
-- there is a window where both work and a rollback loses nothing.

create table public.speakers (
  id         text primary key check (id ~ '^[a-z0-9]{1,16}$'),
  name       text not null,
  gender     text not null check (gender in ('female','male')),
  accent     text not null default 'tw',
  -- The clip pipeline's pitch-search SEED, not a measurement. Jane's is the
  -- literal 168 that `clipPipeline.ts` pinned; seeding from anything else
  -- moved 90 of 120 polylines in the 3rd decimal (see DECISIONS.md).
  f0_seed    numeric not null,
  is_default boolean not null default false,
  -- False until this speaker's set is complete enough to expose to players.
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

-- Exactly one default, enforced rather than assumed: resolution falls back to
-- it, so two defaults would make which voice a player hears non-deterministic.
create unique index speakers_one_default on public.speakers (is_default) where is_default;

create table public.word_clips (
  word_id          text not null references public.words(id) on delete cascade,
  speaker_id       text not null references public.speakers(id) on delete restrict,
  status           text not null default 'pending'
                   check (status in ('pending','recorded','published','retired')),
  clip_key         text,
  raw_key          text,
  duration_s       numeric,
  onset_s          numeric,
  clip_s           numeric,
  polyline         jsonb,
  contour          jsonb,
  recorded_session text,
  recorded_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (word_id, speaker_id)
);

-- The primary key already indexes `word_id` (it leads the key), so only the
-- other foreign key needs its own — an unindexed FK is the standard
-- `get_advisors` performance lint.
create index word_clips_speaker_idx on public.word_clips (speaker_id);
create index word_clips_speaker_status_idx on public.word_clips (speaker_id, status);

-- Reuses `words_touch_updated_at`, whose search_path was pinned in 0014. Do
-- not write a second function: a copy would arrive unpinned and re-trigger the
-- `function_search_path_mutable` advisor.
create trigger word_clips_touch before update on public.word_clips
  for each row execute function public.words_touch_updated_at();

alter table public.speakers   enable row level security;
alter table public.word_clips enable row level security;

create policy speakers_select   on public.speakers   for select to anon, authenticated using (true);
create policy word_clips_select on public.word_clips for select to anon, authenticated using (true);

-- RLS narrows; it does not grant. Without these, correct policies still yield
-- "permission denied for table".
grant select on public.speakers   to anon, authenticated;
grant select on public.word_clips to anon, authenticated;

insert into public.speakers (id, name, gender, accent, f0_seed, is_default, active)
values ('jane', 'Jane', 'female', 'tw', 168, true, true);

-- Backfill, preserving clip_key/raw_key VERBATIM: they are explicit columns,
-- not conventions, so every existing R2 object keeps its current key and no
-- bulk move is needed.
insert into public.word_clips (
  word_id, speaker_id, status, clip_key, raw_key,
  duration_s, onset_s, clip_s, polyline, contour,
  recorded_session, recorded_at, updated_at
)
select
  id, 'jane', status, clip_key, raw_key,
  duration_s, onset_s, clip_s, polyline, contour,
  recorded_session, recorded_at, updated_at
from public.words;
```

- [ ] **Step 2: Apply it**

Apply via the Supabase MCP `apply_migration` with name `0015_voice_roster`. Not the dashboard, not `execute_sql`.

- [ ] **Step 3: Verify the backfill row-for-row**

Run via the Supabase MCP `execute_sql`:

```sql
select
  (select count(*) from public.words)                                        as words,
  (select count(*) from public.word_clips where speaker_id = 'jane')         as jane_rows,
  (select count(*) from public.word_clips
     where speaker_id = 'jane' and status = 'published')                     as jane_published,
  (select count(*) from public.words w
     join public.word_clips c on c.word_id = w.id and c.speaker_id = 'jane'
     where w.clip_key is distinct from c.clip_key
        or w.raw_key  is distinct from c.raw_key
        or w.polyline::text is distinct from c.polyline::text)               as mismatched;
```

Expected: `words = 120`, `jane_rows = 120`, `jane_published = 120`, `mismatched = 0`.

Then the three-clocks invariant, which must return zero rows:

```sql
select word_id from public.word_clips
where status = 'published'
  and (onset_s >= clip_s or clip_s < onset_s + duration_s);
```

- [ ] **Step 4: Run the advisors**

Run the Supabase MCP `get_advisors` for `security` and again for `performance`. Both must come back clean for the two new tables. An unindexed foreign key or a missing RLS policy here is a task failure, not a follow-up.

- [ ] **Step 5: Regenerate types**

Run the Supabase MCP `generate_typescript_types` and write the result to `src/data/database.types.ts`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: passes. Nothing reads the new tables yet, so this only proves the regenerated types still compile.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0015_voice_roster.sql src/data/database.types.ts
git commit -m "feat(db): speakers roster and word_clips, backfilled for jane"
```

---

### Task 2: The catalog wire shape

`word_clips` is an embedded array in a PostgREST response, but `wordsFromCatalog` in `src/game/words.ts` parses a **flat** row and has a test suite that pins that. Rather than reshape the parser, flatten the embed before it reaches the parser. `wordsFromCatalog` keeps its contract and its tests; the flattening is a new pure function with its own.

**Files:**
- Modify: `src/data/catalogRows.ts`
- Modify: `src/data/catalogSeam.test.ts`
- Modify: `src/game/words.ts` (add `speakerId` to `Word`)

**Interfaces:**
- Consumes: the column names from Task 1.
- Produces:
  - `CATALOG_SELECT: string` — now an embed select.
  - `flattenCatalogRows(rows: unknown[]): unknown[]` — one flat row per `(word, clip)` pair; rows without exactly one clip are dropped.
  - `Word.speakerId: string` on the type in `src/game/words.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/data/catalogSeam.test.ts`:

```ts
import { CATALOG_SELECT, flattenCatalogRows } from "./catalogRows.ts";
import { wordsFromCatalog } from "../game/words.ts";

describe("CATALOG_SELECT", () => {
  it("embeds word_clips as an inner join, so a word with no clip for this speaker never arrives", () => {
    expect(CATALOG_SELECT).toContain("word_clips!inner(");
  });

  it("asks for the measurements from the clip, not the word", () => {
    // The old columns still exist on `words` until the contract migration.
    // Selecting them from `words` would silently serve Jane's geometry to
    // every speaker — the exact bug this task exists to prevent.
    const wordPart = CATALOG_SELECT.slice(0, CATALOG_SELECT.indexOf("word_clips"));
    for (const col of ["polyline", "duration_s", "onset_s", "clip_s", "clip_key"]) {
      expect(wordPart).not.toContain(col);
    }
  });
});

describe("flattenCatalogRows", () => {
  const row = {
    id: "ma1b",
    hanzi: "媽",
    pinyin: "mā",
    english: "mother",
    tone: 1,
    tones: [1],
    syllables: 1,
    position: 0,
    min_tier: "free",
    word_clips: [
      {
        speaker_id: "jane",
        status: "published",
        clip_key: "clips/ma1b.wav",
        duration_s: 0.6,
        onset_s: 0.1,
        clip_s: 0.9,
        polyline: [[0, 4.5], [1, 4.5]],
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
  };

  it("lifts the clip's fields onto the word and carries the speaker", () => {
    const [flat] = flattenCatalogRows([row]) as Record<string, unknown>[];
    expect(flat.id).toBe("ma1b");
    expect(flat.speaker_id).toBe("jane");
    expect(flat.clip_key).toBe("clips/ma1b.wav");
    expect(flat.duration_s).toBe(0.6);
    expect(flat.updated_at).toBe("2026-09-01T00:00:00Z");
  });

  it("produces rows wordsFromCatalog can parse", () => {
    const words = wordsFromCatalog(flattenCatalogRows([row]));
    expect(words).toHaveLength(1);
    expect(words[0].speakerId).toBe("jane");
    expect(words[0].clipKey).toBe("clips/ma1b.wav");
  });

  it("drops a row with no clip rather than inventing geometry", () => {
    expect(flattenCatalogRows([{ ...row, word_clips: [] }])).toEqual([]);
  });

  it("drops a row with more than one clip — the query is supposed to be speaker-scoped", () => {
    const two = { ...row, word_clips: [row.word_clips[0], { ...row.word_clips[0], speaker_id: "mark" }] };
    expect(flattenCatalogRows([two])).toEqual([]);
  });

  it("survives junk without throwing", () => {
    expect(flattenCatalogRows([null, 3, "x", {}])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/data/catalogSeam.test.ts`
Expected: FAIL — `flattenCatalogRows` is not exported.

- [ ] **Step 3: Implement**

In `src/data/catalogRows.ts`, replace `CATALOG_SELECT` and add the flattener:

```ts
/**
 * The measurement fields, which now live on `word_clips` rather than `words`.
 * Named once so the select and the flattener cannot drift apart.
 */
const CLIP_COLUMNS = [
  "speaker_id",
  "status",
  "clip_key",
  "duration_s",
  "onset_s",
  "clip_s",
  "polyline",
  "updated_at",
] as const;

/**
 * `!inner` matters: a word with no clip for the selected speaker must not
 * arrive at all. An outer join would deliver it with a null polyline, which
 * `wordsFromCatalog` drops anyway — but only after the row has travelled, and
 * only as long as nobody later "fixes" the parser to be lenient.
 */
export const CATALOG_SELECT =
  `id,hanzi,pinyin,english,tone,tones,syllables,position,min_tier,word_clips!inner(${CLIP_COLUMNS.join(",")})`;

/**
 * Lifts the embedded clip onto the word, producing the flat shape
 * `wordsFromCatalog` has always parsed.
 *
 * Exactly one clip per word or the row is dropped. Zero means the embed
 * filter did not apply; more than one means the query was not speaker-scoped.
 * Both are query bugs, and serving a word with the wrong voice's geometry is
 * worse than serving one word fewer.
 */
export function flattenCatalogRows(rows: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const clips = rec.word_clips;
    if (!Array.isArray(clips) || clips.length !== 1) continue;
    const clip = clips[0];
    if (!clip || typeof clip !== "object") continue;
    const { word_clips: _drop, ...word } = rec;
    out.push({ ...word, ...(clip as Record<string, unknown>) });
  }
  return out;
}
```

Then in `src/game/words.ts`, add to the `Word` interface and to `wordsFromCatalog`'s parsing:

```ts
  /**
   * Which speaker's recording this word's audio and geometry come from.
   * Part of the cache key everywhere a clip is stored, because a cached entry
   * keyed on id alone serves the wrong voice with no error.
   */
  speakerId: string;
```

Parse it the same way the other required strings are parsed — a row whose `speaker_id` is missing or not a non-empty string is dropped, not defaulted. Defaulting would silently attribute a clip to Jane.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/data/catalogSeam.test.ts src/game/words.test.ts`
Expected: PASS. `words.test.ts` fixtures need `speaker_id: "jane"` added; that is part of this step.

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: both pass. `src/data/words.ts` does not compile yet if it passes unflattened rows — wire the `flattenCatalogRows` call in Task 4, and if the compiler complains here, that is Task 4's work arriving early; leave the call site alone and only satisfy the type.

- [ ] **Step 6: Commit**

```bash
git add src/data/catalogRows.ts src/data/catalogSeam.test.ts src/game/words.ts src/game/words.test.ts
git commit -m "feat(catalog): speaker-scoped wire shape and a flattener for the embed"
```

---

### Task 3: The Worker serves `/clip/:speaker/:id`

**Files:**
- Modify: `workers/clips/src/routes/clip.ts`
- Modify: `workers/clips/src/index.ts`
- Test: `workers/clips/src/routes/clip.test.ts`

**Interfaces:**
- Consumes: `word_clips`/`speakers` from Task 1.
- Produces: `GET /clip/:speaker/:id?v=` (the new canonical route) and `GET /clip/:id?v=` (default speaker, one release only).

- [ ] **Step 1: Write the failing tests**

The first of these is the one that matters. Add to `workers/clips/src/routes/clip.test.ts`:

```ts
it("does not share a cache entry between two speakers", async () => {
  // The bug this prevents ships the WRONG VOICE to every player at once, with
  // no error anywhere, and is invisible to every other test in this file.
  await handleClip(req("/clip/jane/ma1b?v=1", janeTicket), env, ctx);
  const stored = [...cachePutKeys];
  await handleClip(req("/clip/mark/ma1b?v=1", janeTicket), env, ctx);
  const both = [...cachePutKeys];
  expect(both).toHaveLength(2);
  expect(both[1]).not.toBe(stored[0]);
  expect(both[0]).toContain("/clip/jane/");
  expect(both[1]).toContain("/clip/mark/");
});

it("serves each speaker its own object", async () => {
  const jane = await handleClip(req("/clip/jane/ma1b?v=1", janeTicket), env, ctx);
  const mark = await handleClip(req("/clip/mark/ma1b?v=1", janeTicket), env, ctx);
  expect(await jane.arrayBuffer()).not.toEqual(await mark.arrayBuffer());
});

it("rejects a bad speaker slug — after the ticket check, so an unauthenticated probe still gets 401", async () => {
  expect((await handleClip(req("/clip/JANE/ma1b", janeTicket), env, ctx)).status).toBe(400);
  expect((await handleClip(req("/clip/../ma1b", janeTicket), env, ctx)).status).toBe(400);
  expect((await handleClip(req("/clip/%2e%2e/ma1b", janeTicket), env, ctx)).status).toBe(400);
  expect((await handleClip(req("/clip/jane/ma1b", null)), env, ctx).status).toBe(401);
});

it("404s a speaker who has not published that word", async () => {
  expect((await handleClip(req("/clip/mark/xiong2", janeTicket), env, ctx)).status).toBe(404);
});

it("still gates a pro word on the ticket's tier, for every speaker", async () => {
  expect((await handleClip(req("/clip/mark/prow", guestTicket), env, ctx)).status).toBe(403);
});

it("keeps /clip/:id working, on the default speaker", async () => {
  const res = await handleClip(req("/clip/ma1b?v=1", janeTicket), env, ctx);
  expect(res.status).toBe(200);
  expect([...cachePutKeys][0]).toContain("/clip/jane/");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run worker:test`
Expected: FAIL — the route reads a single-segment path.

- [ ] **Step 3: Implement**

In `workers/clips/src/routes/clip.ts`:

```ts
/** Same alphabet as the DB check constraint. Validate, never sanitise. */
const SPEAKER_RE = /^[a-z0-9]{1,16}$/;

interface WordRow {
  clipKey: string | null;
  minTier: string;
}

/**
 * Keyed "speaker:id", not id. A map keyed on id alone would resolve a male
 * request to whatever row happened to load last.
 */
async function loadWords(env: Env): Promise<{ words: Map<string, WordRow>; defaultSpeaker: string }> {
  const db = serviceDb(env);
  const [clips, speakers] = await Promise.all([
    db.from("word_clips").select("word_id,speaker_id,clip_key,words!inner(min_tier)").eq("status", "published"),
    db.from("speakers").select("id,is_default"),
  ]);
  if (clips.error || !clips.data || speakers.error || !speakers.data) throw new Error("words query failed");
  const map = new Map<string, WordRow>();
  for (const row of clips.data as unknown as Array<{
    word_id: string; speaker_id: string; clip_key: string | null; words: { min_tier: string };
  }>) {
    map.set(`${row.speaker_id}:${row.word_id}`, { clipKey: row.clip_key, minTier: row.words.min_tier });
  }
  const def = speakers.data.find((s) => s.is_default)?.id;
  if (!def) throw new Error("no default speaker");
  return { words: map, defaultSpeaker: def };
}
```

And in the handler, parse the path into at most two segments:

```ts
  // Deliberately NOT decoded — see the comment above ID_RE. `%2e%2e` is
  // rejected by the regexes as the literal text it is.
  const rest = url.pathname.slice("/clip/".length);
  const slash = rest.indexOf("/");

  const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  const ticket = match ? await verifyTicket(match[1], env.CLIP_TOKEN_SECRET, callerIp(req)) : null;
  if (!ticket) return Response.json({ error: "Missing or invalid token." }, { status: 401 });

  let inventory: { words: Map<string, WordRow>; defaultSpeaker: string };
  try {
    inventory = await words(env, Date.now());
  } catch {
    return Response.json({ error: "Clips are temporarily unavailable." }, { status: 503 });
  }

  // Back-compat for exactly one release: an old, content-hashed bundle is
  // still in some player's tab, and without this every cue it asks for 404s
  // at once. Remove in the contract task.
  const speaker = slash === -1 ? inventory.defaultSpeaker : rest.slice(0, slash);
  const id = slash === -1 ? rest : rest.slice(slash + 1);

  if (!SPEAKER_RE.test(speaker)) return Response.json({ error: "Bad speaker." }, { status: 400 });
  if (!ID_RE.test(id)) return Response.json({ error: "Bad clip id." }, { status: 400 });

  const word = inventory.words.get(`${speaker}:${id}`);
```

The cache key becomes — and this line is the whole point of the task:

```ts
  const cacheKey = new Request(`${CACHE_HOST}/clip/${speaker}/${id}?v=${encodeURIComponent(v)}`);
```

In `workers/clips/src/index.ts` the `startsWith("/clip/")` branch is unchanged; the handler owns the parsing. Update its comment to say the route is `/clip/:speaker/:id` with a one-release fallback.

- [ ] **Step 4: Run the tests**

Run: `npm run worker:test`
Expected: PASS, all of them.

- [ ] **Step 5: Deploy and probe live**

```bash
npm run worker:deploy
```

Then, with a ticket minted from `POST /token`, confirm by hand: `/clip/jane/ma1b` returns 200 `audio/wav`; `/clip/mark/ma1b` returns 404 (no `mark` yet); `/clip/JANE/ma1b` returns 400; `/clip/jane/ma1b` without an `Authorization` header returns 401; `/clip/ma1b` still returns 200.

- [ ] **Step 6: Commit**

```bash
git add workers/clips/src/routes/clip.ts workers/clips/src/routes/clip.test.ts workers/clips/src/index.ts
git commit -m "feat(worker): serve /clip/:speaker/:id with a speaker-scoped cache key"
```

---

### Task 4: The app reads a speaker's catalog

**Files:**
- Modify: `src/data/words.ts`
- Modify: `src/audio/reference.ts`
- Test: `src/data/words.test.ts`, `src/audio/reference.test.ts`

**Interfaces:**
- Consumes: `flattenCatalogRows`, `CATALOG_SELECT`, `Word.speakerId` (Task 2); `/clip/:speaker/:id` (Task 3).
- Produces:
  - `fetchCatalog(opts: { speaker: string; listId?: string }): Promise<Word[]>`
  - `catalogFromCache(speaker: string): Word[] | null`
  - `CATALOG_KEY_PREFIX = "toneflap.catalog.v2."`

- [ ] **Step 1: Write the failing tests**

```ts
it("caches per speaker, so a switch cannot serve the other voice", async () => {
  await fetchCatalog({ speaker: "jane" });
  expect(localStorage.getItem("toneflap.catalog.v2.jane")).toBeTruthy();
  expect(localStorage.getItem("toneflap.catalog.v2.mark")).toBeNull();
  expect(catalogFromCache("mark")).toBeNull();
});

it("falls back to the bundled snapshot for a speaker it has never cached", async () => {
  // The bundle is the default speaker's. A non-default speaker offline gets
  // the default's corridors and a synthetic sweep — no audio plays offline
  // either way, so this is the honest degradation, not a wrong-voice bug.
  const words = await fetchCatalog({ speaker: "mark" });
  expect(words.length).toBeGreaterThan(0);
});

it("keys loadClip's in-flight map by speaker", async () => {
  // Same word id, two speakers: two fetches, not one cache hit serving the
  // wrong voice.
  await Promise.all([loadClip(janeWord), loadClip(markWord)]);
  expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
    expect.stringContaining("/clip/jane/ma1b"),
    expect.stringContaining("/clip/mark/ma1b"),
  ]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/data/words.test.ts src/audio/reference.test.ts`
Expected: FAIL — `fetchCatalog` takes no speaker.

- [ ] **Step 3: Implement the catalog read**

In `src/data/words.ts`:

```ts
/**
 * v2 because the row shape changed (measurements moved to `word_clips`), and
 * per-speaker because a cache keyed on neither would hand a player the other
 * voice's geometry with no error and no way to notice.
 */
export const CATALOG_KEY_PREFIX = "toneflap.catalog.v2.";

const keyFor = (speaker: string): string => `${CATALOG_KEY_PREFIX}${speaker}`;
```

`catalogFromCache(speaker)` and `writeCache(speaker, rows)` take the speaker. In `fetchCatalog`, the query becomes speaker-scoped and the rows are flattened before parsing:

```ts
      let query = supabase
        .from("words")
        .select(select)
        .eq("word_clips.speaker_id", opts.speaker)
        .eq("word_clips.status", "published");
      // ...
        const rows = flattenCatalogRows((data ?? []) as unknown[]);
```

Note `words.status` is no longer filtered — publication is a property of the recording now, not of the word. Leave a comment saying so, because its absence looks like an omission.

Everything else about this function is unchanged, including the rule that a live read parsing to zero words keeps the cache rather than caching the emptiness.

- [ ] **Step 4: Implement the clip read**

In `src/audio/reference.ts`, the URL and the in-flight map key both gain the speaker:

```ts
  const url = `${CLIPS_BASE_URL}/clip/${word.speakerId}/${word.id}?v=${encodeURIComponent(word.updatedAt)}`;
```

The `loads` map key becomes `` `${word.speakerId}:${word.id}` `` everywhere it is read, written or deleted — including the `TicketError` path that removes the entry so the next gate retries. Missing one of those three is a silent wrong-voice bug.

`src/audio/prefetch.ts` needs no change: it plans over the already-filtered pool.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/data/words.test.ts src/audio/reference.test.ts && npm test`
Expected: PASS. `src/data/words.test.ts` imports `CATALOG_KEY` in seven places; those become `` `${CATALOG_KEY_PREFIX}jane` `` and that retargeting is part of this step. Call sites that pass no speaker will not compile — pass the resolved speaker from Task 5 once it exists; until then, pass `"jane"` explicitly at each call site rather than defaulting it inside `fetchCatalog`, so Task 6 cannot miss one.

- [ ] **Step 6: Commit**

```bash
git add src/data/words.ts src/audio/reference.ts src/data/words.test.ts src/audio/reference.test.ts
git commit -m "feat(catalog): speaker-scoped catalog fetch, cache and clip URL"
```

---

### Task 5: Resolving a preference to a speaker

**Files:**
- Create: `src/game/voice.ts`
- Create: `src/game/voice.test.ts`
- Modify: `src/game/tuning.ts`

**Interfaces:**
- Consumes: nothing. Pure.
- Produces:
  - `type Gender = "female" | "male"`
  - `interface Speaker { id: string; name: string; gender: Gender; accent: string; isDefault: boolean; active: boolean }`
  - `interface VoicePref { gender?: Gender }`
  - `resolveSpeaker(roster: Speaker[], pref: VoicePref | null): Speaker | null`
  - `guessGender(f0Center: number): Gender`
  - `tuning().voiceMatchF0Hz: number` (default `160`)

- [ ] **Step 1: Write the failing test**

Create `src/game/voice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveSpeaker, guessGender, type Speaker } from "./voice.ts";

const jane: Speaker = { id: "jane", name: "Jane", gender: "female", accent: "tw", isDefault: true, active: true };
const mark: Speaker = { id: "mark", name: "Mark", gender: "male", accent: "tw", isDefault: false, active: true };

describe("resolveSpeaker", () => {
  it("matches a stored preference on its axis", () => {
    expect(resolveSpeaker([jane, mark], { gender: "male" })?.id).toBe("mark");
  });

  it("falls back to the default when nobody active matches", () => {
    expect(resolveSpeaker([jane], { gender: "male" })?.id).toBe("jane");
  });

  it("falls back to the default when a speaker has been deactivated", () => {
    expect(resolveSpeaker([jane, { ...mark, active: false }], { gender: "male" })?.id).toBe("jane");
  });

  it("falls back to the default when the axis is ambiguous", () => {
    // Two active male speakers: a preference of {gender:'male'} does not name
    // one of them, and picking arbitrarily would make the voice a player hears
    // depend on row order.
    const second = { ...mark, id: "liang", name: "Liang" };
    expect(resolveSpeaker([jane, mark, second], { gender: "male" })?.id).toBe("jane");
  });

  it("uses the default when there is no preference", () => {
    expect(resolveSpeaker([jane, mark], null)?.id).toBe("jane");
  });

  it("never returns an inactive speaker, even the default", () => {
    expect(resolveSpeaker([{ ...jane, active: false }], null)).toBeNull();
  });

  it("returns null for an empty roster rather than throwing", () => {
    expect(resolveSpeaker([], { gender: "male" })).toBeNull();
  });
});

describe("guessGender", () => {
  it("reads a typical female centre as female", () => {
    expect(guessGender(200)).toBe("female");
  });

  it("reads a typical male centre as male", () => {
    expect(guessGender(115)).toBe("male");
  });

  it("splits at the tunable threshold", () => {
    expect(guessGender(159)).toBe("male");
    expect(guessGender(161)).toBe("female");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/voice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the tunable**

In `src/game/tuning.ts`, add to the tuning interface and to `DEFAULT_TUNING`:

```ts
  /**
   * The f0 centre, in Hz, below which a player is matched to a male speaker.
   *
   * A threshold on a continuum: adult female centres cluster near 190-220Hz
   * and male near 100-130Hz, so 160 separates them with room either side. What
   * is being matched is pitch RANGE, not gender — a low-voiced woman matched
   * to the male recordings is the right outcome for the game, and the Settings
   * switch exists for everyone the guess suits badly.
   */
  voiceMatchF0Hz: number;
```

Default: `160`.

- [ ] **Step 4: Implement**

Create `src/game/voice.ts`. No `src/data/` import — this module is read by game code and the UI, and must not drag the Supabase graph into either.

```ts
export function resolveSpeaker(roster: Speaker[], pref: VoicePref | null): Speaker | null {
  const active = roster.filter((s) => s.active);
  const fallback = active.find((s) => s.isDefault) ?? null;
  if (!pref?.gender) return fallback;
  const matches = active.filter((s) => s.gender === pref.gender);
  // Exactly one, or fall back: zero means nobody active fits, and more than
  // one means the preference does not name a speaker. Picking arbitrarily
  // would make the voice depend on row order.
  return matches.length === 1 ? matches[0] : fallback;
}

export function guessGender(f0Center: number): Gender {
  return f0Center < tuning().voiceMatchF0Hz ? "male" : "female";
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/game/voice.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/voice.ts src/game/voice.test.ts src/game/tuning.ts
git commit -m "feat(voice): resolve a stored preference to an active speaker"
```

---

### Task 6: The preference, the switch and the calibration auto-pick

**Files:**
- Modify: `src/game/settings.ts`
- Modify: `src/ui/Calibration.tsx`
- Modify: `src/ui/Settings.tsx`
- Create: `src/data/speakers.ts`
- Test: `src/game/settings.test.ts`

**Interfaces:**
- Consumes: `resolveSpeaker`, `guessGender`, `Speaker` (Task 5); `fetchCatalog({speaker})` (Task 4).
- Produces: `CalibrationSettings.voice?: VoicePref`; `fetchSpeakers(): Promise<Speaker[]>` (never throws, falls back to a bundled `jane`).

- [ ] **Step 1: Write the failing test**

```ts
it("keeps a v3 record without a voice field", () => {
  // Added additively. Bumping the settings key would wipe every player's
  // calibration to gain one field — the trade runHistory.ts already refused.
  localStorage.setItem("toneflap.settings.v3", JSON.stringify({
    f0Center: 200, noiseFloor: 0.01, rangeSemitones: 6, rangeDownSemitones: 6,
  }));
  const s = loadSettings();
  expect(s?.f0Center).toBe(200);
  expect(s?.voice).toBeUndefined();
});

it("round-trips a stored voice preference", () => {
  saveSettings({ f0Center: 115, noiseFloor: 0.01, rangeSemitones: 6, rangeDownSemitones: 6, voice: { gender: "male" } });
  expect(loadSettings()?.voice).toEqual({ gender: "male" });
});

it("drops a malformed voice rather than failing the whole record", () => {
  localStorage.setItem("toneflap.settings.v3", JSON.stringify({
    f0Center: 200, noiseFloor: 0.01, rangeSemitones: 6, rangeDownSemitones: 6, voice: { gender: "banana" },
  }));
  const s = loadSettings();
  expect(s?.f0Center).toBe(200);
  expect(s?.voice).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/settings.test.ts`
Expected: FAIL — `voice` is not on the type.

- [ ] **Step 3: Add the field**

`CalibrationSettings` gains `voice?: VoicePref`. **Do not change `KEY`** — it stays `toneflap.settings.v3`. Validation follows the `rangeDownSemitones` precedent: an absent or malformed `voice` is dropped, and the rest of the record is kept, never rejected.

- [ ] **Step 4: Add the roster fetch**

Create `src/data/speakers.ts`, obeying the `src/data/` never-throw contract:

```ts
/** The roster, or the bundled floor. Never throws, never returns empty. */
const BUNDLED: Speaker[] = [
  { id: "jane", name: "Jane", gender: "female", accent: "tw", isDefault: true, active: true },
];

export async function fetchSpeakers(): Promise<Speaker[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) return BUNDLED;
    const { data, error } = await supabase.from("speakers").select("id,name,gender,accent,is_default,active");
    if (error || !data?.length) {
      warn("speakers", `roster read failed: ${error?.message ?? "empty"}`);
      return BUNDLED;
    }
    return data.map((r) => ({
      id: r.id,
      name: r.name,
      gender: r.gender as Gender,
      accent: r.accent,
      isDefault: r.is_default,
      active: r.active,
    }));
  } catch (err) {
    warn("speakers", "roster read threw", err);
    return BUNDLED;
  }
}
```

- [ ] **Step 5: Wire the calibration auto-pick**

In `src/ui/Calibration.tsx`, the `talk` step already computes `computeF0Center(f0s)` and calls `setF0Center(centre)` before advancing to `done`. Immediately after `setF0Center(centre)`, and **only when the loaded settings carry no `voice`**, store `{ gender: guessGender(centre) }`.

The `done` step's existing warm effect then resolves the roster and prefetches **that** speaker's four `CALIBRATION_WORD_IDS`. If any of the four is not published for the resolved speaker, warm the default speaker's instead and use the default for the flight — the same partial-inventory rule, applied one screen earlier.

Two things not to do: do not re-guess when a preference exists (including on re-calibration), and do not move the `ensureMic`/gesture boundary.

- [ ] **Step 6: Add the Settings control**

In `src/ui/Settings.tsx`, a two-option control under the voice section, writing `settings.voice`. **It does not render while fewer than two speakers are `active`** — with only Jane there is nothing to switch to.

Changing it must not tear down a live run: reuse the `run.setWords()` seam that the late-tier answer already uses, and refetch the catalog for the new speaker in its own effect.

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass. Then confirm the dev-tooling and landing-chunk greps from CLAUDE.md hard rule 7 and the landing split still come back clean.

- [ ] **Step 8: Commit**

```bash
git add src/game/settings.ts src/game/settings.test.ts src/ui/Calibration.tsx src/ui/Settings.tsx src/data/speakers.ts
git commit -m "feat(voice): auto-pick a speaker from calibration, switchable in Settings"
```

---

### Task 7: Booth isolation in the Worker

**Files:**
- Modify: `workers/clips/src/passcode.ts`
- Modify: `workers/clips/src/routes/auth.ts`, `boothWords.ts`, `raw.ts`
- Modify: `workers/clips/src/index.ts` (`Env`)
- Test: `workers/clips/src/passcode.test.ts`, `workers/clips/src/routes/raw.test.ts`

**Interfaces:**
- Consumes: `speakers`/`word_clips` from Task 1.
- Produces: `resolveSpeaker(req: Request, env: Env): { speaker: string } | Response` in `passcode.ts`. Note this shares a name with Task 5's app-side function and is a different function in a different runtime — do not import one from the other.

- [ ] **Step 1: Write the failing tests**

```ts
it("resolves each code to its own speaker", () => {
  const env = { RECORD_PASSCODES: '{"aaa":"jane","bbb":"mark"}' } as Env;
  expect(resolveSpeaker(reqWith("aaa"), env)).toEqual({ speaker: "jane" });
  expect(resolveSpeaker(reqWith("bbb"), env)).toEqual({ speaker: "mark" });
});

it("401s an unknown code", () => {
  expect((resolveSpeaker(reqWith("ccc"), env) as Response).status).toBe(401);
});

it("503s on an unset or unparseable secret, never falls open", () => {
  expect((resolveSpeaker(reqWith("aaa"), {} as Env) as Response).status).toBe(503);
  expect((resolveSpeaker(reqWith("aaa"), { RECORD_PASSCODES: "{" } as Env) as Response).status).toBe(503);
});

it("rejects a speaker slug the DB could not hold", () => {
  const env = { RECORD_PASSCODES: '{"aaa":"NOT A SLUG"}' } as Env;
  expect((resolveSpeaker(reqWith("aaa"), env) as Response).status).toBe(503);
});

it("writes only into its own speaker's prefix and row", async () => {
  await handleRaw(rawReq("aaa", "xiong2", "2026-09-16-abc"), env);
  expect(putKeys).toEqual(["raw/jane/2026-09-16-abc/xiong2.wav"]);
  expect(upserts).toEqual([
    {
      word_id: "xiong2",
      speaker_id: "jane",
      status: "recorded",
      raw_key: "raw/jane/2026-09-16-abc/xiong2.wav",
      recorded_session: "2026-09-16-abc",
    },
  ]);
  expect(upsertConflictTarget).toBe("word_id,speaker_id");
});

it("takes no speaker from the client", async () => {
  // The request cannot express "write as someone else" — there is no
  // parameter for it, so a stale tab or a typo cannot cross-write.
  await handleRaw(rawReq("aaa", "xiong2", "s1", { speaker: "mark" }), env);
  expect(putKeys[0]).toContain("raw/jane/");
});

it("shows a speaker only their own list", async () => {
  const res = await handleBoothWords(reqWith("aaa"), env);
  const body = await res.json();
  expect([...body.pending, ...body.recorded].every((w) => w.speakerId === undefined)).toBe(true);
  expect(queriedSpeaker).toBe("jane");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run worker:test`
Expected: FAIL — `resolveSpeaker` does not exist.

- [ ] **Step 3: Implement**

Replace `checkPasscode` with `resolveSpeaker` in `workers/clips/src/passcode.ts`:

```ts
const SPEAKER_RE = /^[a-z0-9]{1,16}$/;

/**
 * The speaker is derived from the passcode and from nothing else. No booth
 * route accepts a speaker from the client, so a recorder cannot express
 * "write as someone else" — the vocabulary does not exist.
 *
 * Returns a discriminated union rather than `Response | null` so a route that
 * forgets the denial branch does not compile. With a speaker to carry, an
 * unchecked null would be a silent cross-write, not just a silent bypass.
 */
export function resolveSpeaker(req: Request, env: { RECORD_PASSCODES?: string }): { speaker: string } | Response {
  let map: Record<string, string>;
  try {
    map = JSON.parse(env.RECORD_PASSCODES ?? "") as Record<string, string>;
    if (!map || typeof map !== "object") throw new Error("not an object");
  } catch {
    return Response.json({ error: "Recording is not configured." }, { status: 503 });
  }
  const given = req.headers.get(PASSCODE_HEADER) ?? "";
  // Every entry, no early exit: response time must reveal neither how many
  // codes exist nor which prefix matched.
  let found: string | null = null;
  for (const [code, speaker] of Object.entries(map)) {
    if (equals(given, code)) found = speaker;
  }
  if (found === null) return Response.json({ error: "Wrong code." }, { status: 401 });
  if (!SPEAKER_RE.test(found)) {
    return Response.json({ error: "Recording is not configured." }, { status: 503 });
  }
  return { speaker: found };
}
```

`Env` swaps `RECORD_PASSCODE: string` for `RECORD_PASSCODES: string`.

`/booth/words` queries `word_clips` for that speaker joined to `words`, and returns the same narrow shape plus the speaker's display name:
`{ speaker: { id, name }, pending: [...], recorded: [...] }`. A word with no `word_clips` row for this speaker counts as `pending`.

`/raw` builds `raw/${speaker}/${session}/${id}.wav` and upserts `word_clips` with an explicit `onConflict: "word_id,speaker_id"`, never an update keyed on `word_id` alone. The existing order is preserved: passcode → validation → words lookup → R2 put → DB write.

- [ ] **Step 4: Run the tests**

Run: `npm run worker:test`
Expected: PASS.

- [ ] **Step 5: Set the secret and deploy**

```bash
npx wrangler secret put RECORD_PASSCODES --config workers/clips/wrangler.toml
```

Value is a JSON object mapping each code to a speaker id. Then `npm run worker:deploy`. Delete the old `RECORD_PASSCODE` secret only after the deploy is confirmed working.

- [ ] **Step 6: Commit**

```bash
git add workers/clips/src
git commit -m "feat(worker): derive the booth's speaker from its passcode, and confine writes to it"
```

---

### Task 8: The booth shows who is recording

**Files:**
- Modify: `src/record/boothWords.ts`, `src/record/Overview.tsx`
- Test: `src/record/boothWords.test.ts`

**Interfaces:**
- Consumes: `/booth/words`'s `{ speaker: { id, name }, pending, recorded }` (Task 7).
- Produces: `BoothWordsResponse.speaker: { id: string; name: string }`.

- [ ] **Step 1: Write the failing test**

```ts
it("carries the speaker the server resolved, not one the client chose", async () => {
  const res = await fetchBoothWords("aaa", fakeFetch({ speaker: { id: "jane", name: "Jane" }, pending: [], recorded: [] }));
  expect(res.speaker).toEqual({ id: "jane", name: "Jane" });
});

it("throws when the server sends no speaker", async () => {
  await expect(fetchBoothWords("aaa", fakeFetch({ pending: [], recorded: [] }))).rejects.toThrow();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/record/boothWords.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Delete the `BOOTH_VOICE` constant from `src/record/boothWords.ts`. Add `speaker` to `BoothWordsResponse` and validate it in `fetchBoothWords` alongside the two arrays — a missing speaker throws, like any other unexpected shape. The booth throws on purpose; it is not a player surface.

In `src/record/Overview.tsx`, the header line becomes `Recording as: {speaker.name}` — above the word list, before anything is armed, so someone handed the wrong code sees it on the first screen.

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/record
git commit -m "feat(record): show the server-resolved speaker in the booth"
```

---

### Task 9: The pipeline records for a speaker

**Files:**
- Modify: `src/dev/clipPipeline.ts`, `src/dev/process-clips.ts`, `src/dev/clipReview.ts`, `src/dev/export-fallback.ts`, `src/dev/verify-clips.ts`, `src/dev/import-words.ts`
- Test: `src/dev/clipCut.test.ts` (the golden test — must not move)

**Interfaces:**
- Consumes: `speakers.f0_seed`, `word_clips` (Task 1).
- Produces: `npm run process-clips -- --speaker <id>`; clips written to `clips/{speaker}/{id}.wav`.

- [ ] **Step 1: Capture the baseline**

```bash
npm run export-fallback
git diff --exit-code src/data/wordsFallback.json
```

Expected: no diff (the file is current). If it diffs before you change anything, stop and report — something upstream already moved.

- [ ] **Step 2: Write the failing test**

Extend `src/dev/clipCut.test.ts` so the golden assertion takes the seed as a parameter and stays non-vacuous:

```ts
it("is byte-stable for Jane's anchors at her own seed", () => {
  for (const anchor of ANCHORS) {
    expect(cutClip(anchor.samples, anchor.rate, { seedF0: 168 }).polyline).toEqual(anchor.golden);
  }
});

it("would NOT be stable at another speaker's seed — proving the golden bites", () => {
  const moved = ANCHORS.some(
    (a) => JSON.stringify(cutClip(a.samples, a.rate, { seedF0: 110 }).polyline) !== JSON.stringify(a.golden),
  );
  expect(moved).toBe(true);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/dev/clipCut.test.ts`
Expected: FAIL — `cutClip` takes no seed option.

- [ ] **Step 4: Implement**

`SEED_F0_CENTER` stops being the only answer: `clipPipeline.ts` takes the seed as a parameter, keeps `168` as the exported constant for Jane and as the default, and `process-clips` passes `speakers.f0_seed` for the `--speaker` it was given. Reading the seed from the catalog's last published word is what moved 90 polylines once; do not reintroduce it.

`process-clips`:
- requires `--speaker <id>`, validated against the `speakers` table (an unknown id exits non-zero rather than defaulting);
- reads raw takes from `raw/{speaker}/...`;
- writes `clips/{speaker}/{id}.wav`;
- upserts `word_clips` on `(word_id, speaker_id)`, and its narrow UPDATE still never touches `min_tier`.

`clipReview`: tone-median thresholds computed over that speaker's own published `word_clips` rows. It still flags, never blocks.

`export-fallback`: exports the default speaker only (`speakers.is_default`), and its header says why.

`verify-clips`: takes `--speaker`, or checks every active speaker and reports per speaker.

`import-words`: unchanged in its `min_tier='free'` default — `min_tier` did not move. It creates `words` rows only; `word_clips` rows are created by `/raw` or by `process-clips`.

- [ ] **Step 5: Prove nothing moved**

```bash
npx vitest run src/dev/clipCut.test.ts
npm run process-clips -- --speaker jane --dry-run
npm run export-fallback
git diff --exit-code src/data/wordsFallback.json
git diff --exit-code fixtures/anchors
```

Expected: tests pass, the dry run reports no changes, and **both diffs are empty**. A non-empty diff on either is a task failure — Jane's measurements must be byte-identical across this refactor.

- [ ] **Step 6: Commit**

```bash
git add src/dev
git commit -m "feat(pipeline): per-speaker seeds, keys and review thresholds"
```

---

### Task 10: Report the voice

**Files:**
- Modify: `src/analytics/session.ts`
- Test: `src/analytics/session.test.ts`

**Interfaces:**
- Consumes: the resolved speaker id (Task 6).
- Produces: `voice: string` on the `run_end` event.

- [ ] **Step 1: Write the failing test**

```ts
it("carries the voice on run_end", () => {
  expect(runEnd({ ...base, voice: "mark" }).properties.voice).toBe("mark");
});

it("still drops anything outside the allowlist", () => {
  expect(runEnd({ ...base, voice: "mark" }).properties).not.toHaveProperty("$host");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/analytics/session.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add `voice` to the `run_end` member of the `AnalyticsEvent` union **and** to `posthog.ts`'s `before_send` allowlist. Both, or the property is built and then stripped at the transport boundary. It is a speaker id — not anything the player typed — so the "nothing the player typed" promise is intact.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/analytics
git commit -m "feat(analytics): report which voice a run was flown with"
```

---

### Task 11: Contract — **do not run until the male set is live**

Gated on: Task 9 shipped, the male set recorded and published, `speakers.active = true` flipped, and one production deploy verified on the new `/clip/:speaker/:id` route.

**Files:**
- Create: `supabase/migrations/0016_words_drop_clip_columns.sql`
- Modify: `workers/clips/src/routes/clip.ts`

- [ ] **Step 1: Confirm nothing reads the old columns**

```bash
grep -rn "clip_key\|duration_s\|onset_s\|clip_s\|polyline\|raw_key\|recorded_session" src workers --include="*.ts" --include="*.tsx" | grep -v word_clips
```

Expected: no hit that reads them off `words`. Any hit is a blocker, not a warning.

- [ ] **Step 2: Write and apply the migration**

```sql
-- 0016_words_drop_clip_columns.sql
-- Every measurement now lives on `word_clips`; these have been dead since the
-- app started reading the new shape. Dropped in their own migration, after a
-- verified production deploy, so the expand step stayed reversible.
alter table public.words
  drop column clip_key, drop column raw_key,
  drop column duration_s, drop column onset_s, drop column clip_s,
  drop column polyline, drop column contour,
  drop column recorded_session, drop column recorded_at,
  drop column status;
```

Note `status` goes too — publication is a property of a recording now.

- [ ] **Step 3: Remove the back-compat route**

In `workers/clips/src/routes/clip.ts`, a path with no slash becomes a 400 rather than resolving to the default speaker. Update the test that asserted the fallback to assert the 400.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run worker:test && npm run build`, regenerate `src/data/database.types.ts`, and run `get_advisors` for both categories.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_words_drop_clip_columns.sql src/data/database.types.ts workers/clips/src
git commit -m "refactor(db): drop the per-word clip columns now that word_clips owns them"
```

---

## Docs to update (fold into the task that makes each true)

- **CLAUDE.md** — "The clip catalog and its Worker": the pipeline shape, `/clip/:speaker/:id`, the speakers roster, and a new numbered pipeline rule that `word_clips` is per-speaker and `f0_seed` is per-speaker. Update in Tasks 3, 7 and 9.
- **PRD.md** — §4 (backend row), §9 (audio reference is a roster now), §8 (the Settings control). Update in Task 6.
- **`src/game/toneAverages.ts`** — extend its generated header to say the averages are the **default speaker's** and that this is deliberate: the shape is Chao-space and already normalised per speaker, so the classifier is voice-independent by construction. Without this line it reads as an oversight and someone will turn it into a per-speaker table, changing scoring for every player. Add in Task 6.
- **DECISIONS.md** — one entry, written in Task 1 and extended in Task 9: why a speaker rather than a `voice` enum, why the geometry is per-voice, and that `AVERAGED_TONE_SHAPE`/`toneClassifier.ts` stay voice-independent **on purpose** so nobody "fixes" it into a per-speaker table and changes scoring for every player.
- **docs/SPECS/R2_SETUP.md** — the WAF rate-limit rules should cover `/auth` and `/booth/*` as well as `/clip/*` and `/token`. Note in Task 7.
