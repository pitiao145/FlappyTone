/**
 * `GET /booth/words` — tells the recording booth what's left to record and
 * what's already in. One query, split client-side by status rather than two
 * queries, since both lists come from the same small table (120 rows).
 *
 * Response shape is deliberately narrow: `{id, hanzi, pinyin, tone, status}`
 * only. The booth needs to show Jane what to say next, not the clip
 * pipeline's internal bookkeeping (`raw_key`, `recorded_session`,
 * `contour`, `polyline`, …) — none of that is this route's business to leak.
 */
import { checkPasscode } from "../passcode.ts";
import { serviceDb } from "../db.ts";
import type { Env } from "../index.ts";

interface BoothWord {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  status: string;
}

export async function handleBoothWords(req: Request, env: Env): Promise<Response> {
  const denied = checkPasscode(req, env.RECORD_PASSCODE);
  if (denied) return denied;

  const { data, error } = await serviceDb(env)
    .from("words")
    .select("id,hanzi,pinyin,tone,status,position")
    .order("position", { ascending: true });

  if (error || !data) {
    return Response.json({ error: "Words are temporarily unavailable." }, { status: 503 });
  }

  const shape = (row: { id: string; hanzi: string; pinyin: string; tone: number; status: string }): BoothWord => ({
    id: row.id,
    hanzi: row.hanzi,
    pinyin: row.pinyin,
    tone: row.tone,
    status: row.status,
  });

  const pending = data.filter((w) => w.status === "pending").map(shape);
  const recorded = data.filter((w) => w.status === "recorded" || w.status === "published").map(shape);

  return Response.json({ pending, recorded });
}
