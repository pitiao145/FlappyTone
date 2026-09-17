import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEnv } from "./helpers.ts";

interface Row {
  id: string;
  hanzi: string;
  pinyin: string;
  tone: number;
  position: number;
  /** speaker id → that speaker's clip status; absent means no `word_clips` row. */
  clips: Record<string, string>;
}

const state = vi.hoisted(() => ({
  rows: [] as {
    id: string;
    hanzi: string;
    pinyin: string;
    tone: number;
    position: number;
    clips: Record<string, string>;
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
                    word_clips: r.clips[speaker] ? [{ status: r.clips[speaker] }] : [],
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

const rows: Row[] = [
  { id: "ma1", hanzi: "媽", pinyin: "mā", tone: 1, position: 2, clips: {} },
  { id: "ma2", hanzi: "麻", pinyin: "má", tone: 2, position: 1, clips: { jane: "pending" } },
  { id: "ma3", hanzi: "馬", pinyin: "mǎ", tone: 3, position: 1, clips: { jane: "recorded" } },
  {
    id: "ma4",
    hanzi: "罵",
    pinyin: "mà",
    tone: 4,
    position: 2,
    clips: { jane: "published", mark: "recorded" },
  },
  { id: "ma5", hanzi: "嗎", pinyin: "ma", tone: 4, position: 3, clips: { jane: "retired" } },
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
    const body = (await res.json()) as {
      speaker: { id: string; name: string };
      pending: Record<string, unknown>[];
      recorded: Record<string, unknown>[];
    };
    expect(state.queriedSpeaker).toBe("jane");
    expect(body.speaker).toEqual({ id: "jane", name: "Jane" });
    expect([...body.pending, ...body.recorded].every((w) => w.speakerId === undefined)).toBe(true);
  });

  it("counts a word with no clip row for this speaker as pending", async () => {
    const res = await get();
    const body = (await res.json()) as { pending: { id: string }[]; recorded: { id: string }[] };
    // ma2 has an explicit pending row, ma1 has none at all — both pending.
    expect(body.pending.map((w) => w.id)).toEqual(["ma2", "ma1"]);
    expect(body.recorded.map((w) => w.id)).toEqual(["ma3", "ma4"]);
  });

  it("gives a second speaker their own split, not the first one's", async () => {
    const res = await get("mark-code");
    const body = (await res.json()) as {
      speaker: { id: string };
      pending: { id: string }[];
      recorded: { id: string }[];
    };
    expect(state.queriedSpeaker).toBe("mark");
    expect(body.speaker.id).toBe("mark");
    expect(body.recorded.map((w) => w.id)).toEqual(["ma4"]);
    expect(body.pending.map((w) => w.id)).toEqual(["ma2", "ma3", "ma1", "ma5"]);
  });

  it("shapes each word as {id, hanzi, pinyin, tone, status} only", async () => {
    const res = await get();
    const body = (await res.json()) as { pending: Record<string, unknown>[] };
    expect(Object.keys(body.pending[0]).sort()).toEqual(["hanzi", "id", "pinyin", "status", "tone"]);
  });

  it("503s when the words query fails", async () => {
    state.error = new Error("db down");
    expect((await get()).status).toBe(503);
  });
});
