import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEnv } from "./helpers.ts";

interface Row {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  position: number;
  /** speaker id → style → that recording's status; absent means no row for that (speaker, style). */
  clips: Record<string, Record<string, string>>;
  /** this word's list memberships — unscoped by speaker, unlike `clips`. */
  lists?: string[];
}

const state = vi.hoisted(() => ({
  rows: [] as {
    id: string;
    hanzi: string;
    pinyin: string;
    tone: number;
    position: number;
    clips: Record<string, Record<string, string>>;
    lists?: string[];
  }[],
  speakers: {} as Record<string, string>,
  error: null as unknown,
  /** What the words query was actually scoped to — not a client-side filter. */
  queriedSpeaker: null as string | null,
}));

vi.mock("../src/db.ts", () => ({
  serviceDb: () => ({
    from: (table: string) => {
      if (table === "speakers") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => {
                const name = state.speakers[id];
                return name ? { data: { id, name }, error: null } : { data: null, error: null };
              },
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: (col: string, speaker: string) => {
            expect(col).toBe("word_clips.speaker_id");
            state.queriedSpeaker = speaker;
            return {
              order: async () => {
                if (state.error) return { data: null, error: state.error };
                const data = [...state.rows]
                  .sort((a, b) => a.position - b.position)
                  .map((r) => ({
                    id: r.id,
                    hanzi: r.hanzi,
                    pinyin: r.pinyin,
                    tone: r.tone,
                    position: r.position,
                    // A left join scoped to one speaker: no row for them ⇒ [].
                    // Up to two rows now — one per style.
                    word_clips: Object.entries(r.clips[speaker] ?? {}).map(([style, status]) => ({
                      style,
                      status,
                    })),
                    // Unscoped by speaker, unlike word_clips above.
                    word_lists: (r.lists ?? []).map((list_id) => ({ list_id })),
                  }));
                return { data, error: null };
              },
            };
          },
        }),
      };
    },
  }),
}));

const { handleBoothWords } = await import("../src/routes/boothWords.ts");

async function get(passcode: string | null = "hunter2", env = fakeEnv()) {
  const req = new Request("https://clips.flappytone.com/booth/words", {
    headers: passcode ? { "x-record-passcode": passcode } : {},
  });
  return handleBoothWords(req, env);
}

interface BoothWordBody {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  textbook: string;
  natural: string;
  lists: string[];
}

const rows: Row[] = [
  { id: "ma1", hanzi: "媽", pinyin: "mā", tone: 1, position: 2, clips: {}, lists: ["core-120"] },
  {
    id: "ma2",
    hanzi: "麻",
    pinyin: "má",
    tone: 2,
    position: 1,
    clips: { jane: { textbook: "pending" } },
    lists: ["core-120", "tocfl1"],
  },
  { id: "ma3", hanzi: "馬", pinyin: "mǎ", tone: 3, position: 1, clips: { jane: { textbook: "recorded" } } },
  {
    id: "ma4",
    hanzi: "罵",
    pinyin: "mà",
    tone: 4,
    position: 2,
    clips: {
      jane: { textbook: "published", natural: "recorded" },
      mark: { textbook: "recorded" },
    },
  },
  { id: "ma5", hanzi: "嗎", pinyin: "ma", tone: 4, position: 3, clips: { jane: { textbook: "retired" } } },
];

beforeEach(() => {
  state.rows = rows;
  state.speakers = { jane: "Jane", mark: "Mark" };
  state.error = null;
  state.queriedSpeaker = null;
});

describe("GET /booth/words", () => {
  it("401s a wrong passcode", async () => {
    expect((await get("wrong")).status).toBe(401);
  });

  it("503s an unconfigured passcode", async () => {
    expect((await get("hunter2", fakeEnv({ RECORD_PASSCODES: "" }))).status).toBe(503);
  });

  it("503s when the passcode names a speaker the roster does not hold", async () => {
    state.speakers = { mark: "Mark" };
    expect((await get()).status).toBe(503);
  });

  it("shows a speaker only their own list, scoped by the query", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { speaker: { id: string; name: string }; words: BoothWordBody[] };
    expect(state.queriedSpeaker).toBe("jane");
    expect(body.speaker).toEqual({ id: "jane", name: "Jane" });
    expect(body.words.every((w) => (w as unknown as { speakerId?: unknown }).speakerId === undefined)).toBe(true);
  });

  it("counts a word with no clip row for this speaker, in this style, as pending", async () => {
    const res = await get();
    const body = (await res.json()) as { words: BoothWordBody[] };
    const byId = Object.fromEntries(body.words.map((w) => [w.id, w]));
    // ma2 has an explicit textbook-pending row and no natural row at all —
    // both read pending. ma1 has no row for either style.
    expect(byId.ma2).toMatchObject({ textbook: "pending", natural: "pending" });
    expect(byId.ma1).toMatchObject({ textbook: "pending", natural: "pending" });
    expect(byId.ma3).toMatchObject({ textbook: "recorded", natural: "pending" });
  });

  it("carries both styles' status independently, for the same word and speaker", async () => {
    const res = await get();
    const body = (await res.json()) as { words: BoothWordBody[] };
    const ma4 = body.words.find((w) => w.id === "ma4")!;
    expect(ma4.textbook).toBe("published");
    expect(ma4.natural).toBe("recorded");
  });

  it("gives a second speaker their own split, not the first one's", async () => {
    const res = await get("mark-code");
    const body = (await res.json()) as { speaker: { id: string }; words: BoothWordBody[] };
    expect(state.queriedSpeaker).toBe("mark");
    expect(body.speaker.id).toBe("mark");
    const byId = Object.fromEntries(body.words.map((w) => [w.id, w]));
    expect(byId.ma4).toMatchObject({ textbook: "recorded", natural: "pending" });
    expect(byId.ma1).toMatchObject({ textbook: "pending", natural: "pending" });
  });

  it("shapes each word as {id, hanzi, pinyin, tone, textbook, natural, lists} only", async () => {
    const res = await get();
    const body = (await res.json()) as { words: Record<string, unknown>[] };
    expect(Object.keys(body.words[0]).sort()).toEqual(
      ["hanzi", "id", "lists", "natural", "pinyin", "textbook", "tone"],
    );
  });

  it("carries every word's list membership, unscoped by speaker", async () => {
    const res = await get("mark-code");
    const body = (await res.json()) as { words: { id: string; lists: string[] }[] };
    const byId = Object.fromEntries(body.words.map((w) => [w.id, w.lists]));
    expect(byId.ma2).toEqual(["core-120", "tocfl1"]);
    // ma3 has no word_lists row at all — the response carries an empty
    // array, never undefined, so the client never has to null-check it.
    expect(byId.ma3).toEqual([]);
  });

  it("503s when the words query fails", async () => {
    state.error = new Error("db down");
    expect((await get()).status).toBe(503);
  });
});
