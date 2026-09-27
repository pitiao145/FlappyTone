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
 * A word with no `word_clips` row for this speaker, in a given style, counts
 * as `pending` for that style — a second voice (or a first natural take)
 * starts with 120 words to record, not an empty booth.
 *
 * Since migration 0024 gave a recording a style, a word can hold up to two
 * `word_clips` rows for this speaker — one per style — so the embed is no
 * longer collapsed to one status. Response shape carries BOTH: `{id, hanzi,
 * pinyin, tone, lists, textbook, natural}`, each style field a status
 * (`pending`/`recorded`/`published`). One fetch, both styles, no
 * reconciliation — the list picker's pills are (list × style), and a pill's
 * green state needs the OTHER style's pending count too (to decide whether
 * "TOCFL1 natural" is done), so splitting server-side into one style's
 * pending/recorded lists would force a second request just to render pill
 * colour. `Overview.tsx` derives its own pending/recorded split for whichever
 * pill is active. The rest of the response is unchanged: narrow, no clip
 * pipeline bookkeeping (`raw_key`, `recorded_session`, `contour`,
 * `polyline`, …).
 */
import { isDenied, resolveSpeaker } from "../passcode.ts";
import { serviceDb } from "../db.ts";
import type { Env } from "../index.ts";

interface BoothWord {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  textbook: string;
  natural: string;
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
  word_clips: { style: string; status: string }[] | { style: string; status: string } | null;
  word_lists: { list_id: string }[] | null;
}

function statusByStyle(row: WordRow): { textbook: string; natural: string } {
  const clips = row.word_clips;
  const list = clips ? (Array.isArray(clips) ? clips : [clips]) : [];
  const byStyle = new Map(list.map((c) => [c.style, c.status]));
  return {
    textbook: byStyle.get("textbook") ?? "pending",
    natural: byStyle.get("natural") ?? "pending",
  };
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
    .select("id,hanzi,pinyin,tone,position,word_clips(style,status),word_lists(list_id)")
    .eq("word_clips.speaker_id", speaker)
    .order("position", { ascending: true });

  if (error || !data) {
    return Response.json({ error: "Words are temporarily unavailable." }, { status: 503 });
  }

  const rows = data as unknown as WordRow[];
  const words: BoothWord[] = rows.map((row) => ({
    id: row.id,
    hanzi: row.hanzi,
    pinyin: row.pinyin,
    tone: row.tone,
    ...statusByStyle(row),
    lists: (row.word_lists ?? []).map((l) => l.list_id),
  }));

  return Response.json({
    speaker: { id: speakerRow.id, name: speakerRow.name },
    words,
  });
}
