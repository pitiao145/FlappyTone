/**
 * `GET /booth/words` — tells the recording booth what's left to record and
 * what's already in, **for the speaker its passcode resolved to**.
 *
 * SPEAKER scoping is in the query, not a client-side filter: a list that is
 * not yours is a list you can act on by mistake, and the booth's whole
 * isolation guarantee is that another speaker's rows are never in the room.
 *
 * LIST scoping (which curated word list — `hsk1`, `tocfl2`, `core-120`, …—
 * a word belongs to) is deliberately the opposite: every word's full list
 * membership rides along on every response, unfiltered, and `Overview.tsx`
 * decides what to show or grey out. Recording priority (e.g. "TOCFL only
 * this week") changes far more often than who may write whose rows, so it
 * belongs in a UI a recorder can see change, not a server-side allowlist
 * only Pierre can edit.
 *
 * A word with no `word_clips` row for this speaker counts as `pending` — a
 * second voice starts with 120 words to record, not an empty booth.
 *
 * Response shape is deliberately narrow: `{id, hanzi, pinyin, tone, status,
 * lists}` only, plus the speaker's id and display name. The booth needs to
 * show who is recording, what to say next, and which lists it belongs to —
 * not the clip pipeline's internal bookkeeping (`raw_key`,
 * `recorded_session`, `contour`, `polyline`, …).
 */
import { isDenied, resolveSpeaker } from "../passcode.ts";
import { serviceDb } from "../db.ts";
import type { Env } from "../index.ts";

interface BoothWord {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  status: string;
  /** This word's list memberships (`hsk1`, `tocfl2`, `core-120`, …) — lets the
   * booth show/grey lists client-side without the server picking for it. */
  lists: string[];
}

interface WordRow {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  position: number;
  word_clips: { status: string }[] | { status: string } | null;
  word_lists: { list_id: string }[] | null;
}

function clipStatus(row: WordRow): string {
  const clips = row.word_clips;
  if (!clips) return "pending";
  const one = Array.isArray(clips) ? clips[0] : clips;
  return one?.status ?? "pending";
}

export async function handleBoothWords(req: Request, env: Env): Promise<Response> {
  const resolved = resolveSpeaker(req, env);
  if (isDenied(resolved)) return resolved;
  const { speaker } = resolved;

  const db = serviceDb(env);

  const { data: speakerRow, error: speakerError } = await db
    .from("speakers")
    .select("id,name")
    .eq("id", speaker)
    .maybeSingle();

  if (speakerError || !speakerRow) {
    // The passcode named a speaker the roster does not hold — a misconfigured
    // secret, same class as an unparseable one, not a user error.
    return Response.json({ error: "Recording is not configured." }, { status: 503 });
  }

  // Left join, scoped to this speaker inside the join filter so a word with no
  // row for them still comes back (and reads as `pending`). `word_lists` is a
  // second, unscoped left join — every word's list membership, regardless of
  // speaker — so the booth can group/greylist by list client-side.
  const { data, error } = await db
    .from("words")
    .select("id,hanzi,pinyin,tone,position,word_clips(status),word_lists(list_id)")
    .eq("word_clips.speaker_id", speaker)
    .order("position", { ascending: true });

  if (error || !data) {
    return Response.json({ error: "Words are temporarily unavailable." }, { status: 503 });
  }

  const rows = data as unknown as WordRow[];
  const pending: BoothWord[] = [];
  const recorded: BoothWord[] = [];

  for (const row of rows) {
    const status = clipStatus(row);
    const word: BoothWord = {
      id: row.id,
      hanzi: row.hanzi,
      pinyin: row.pinyin,
      tone: row.tone,
      status,
      lists: (row.word_lists ?? []).map((l) => l.list_id),
    };
    if (status === "pending") pending.push(word);
    else if (status === "recorded" || status === "published") recorded.push(word);
  }

  return Response.json({
    speaker: { id: speakerRow.id, name: speakerRow.name },
    pending,
    recorded,
  });
}
