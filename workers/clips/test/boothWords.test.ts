import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEnv } from "./helpers.ts";

const wordsQuery = vi.hoisted(() => ({
  rows: [] as { id: string; hanzi: string; pinyin: string; tone: number; status: string; position: number }[],
  error: null as unknown,
}));

vi.mock("../src/db.ts", () => ({
  serviceDb: () => ({
    from: () => ({
      select: () => ({
        order: async () => ({
          data: wordsQuery.error ? null : [...wordsQuery.rows].sort((a, b) => a.position - b.position),
          error: wordsQuery.error,
        }),
      }),
    }),
  }),
}));

const { handleBoothWords } = await import("../src/routes/boothWords.ts");

async function get(passcode: string | null = "hunter2", env = fakeEnv()) {
  const req = new Request("https://clips.flappytone.com/booth/words", {
    headers: passcode ? { "x-record-passcode": passcode } : {},
  });
  return handleBoothWords(req, env);
}

beforeEach(() => {
  wordsQuery.rows = [
    { id: "ma1", hanzi: "媽", pinyin: "mā", tone: 1, status: "pending", position: 2 },
    { id: "ma2", hanzi: "麻", pinyin: "má", tone: 2, status: "pending", position: 1 },
    { id: "ma3", hanzi: "馬", pinyin: "mǎ", tone: 3, status: "recorded", position: 1 },
    { id: "ma4", hanzi: "罵", pinyin: "mà", tone: 4, status: "published", position: 2 },
    { id: "ma5", hanzi: "嗎", pinyin: "ma", tone: 0, status: "retired", position: 3 },
  ];
  wordsQuery.error = null;
});

describe("GET /booth/words", () => {
  it("401s a wrong passcode", async () => {
    expect((await get("wrong")).status).toBe(401);
  });

  it("503s an unconfigured passcode", async () => {
    const env = fakeEnv({ RECORD_PASSCODE: "" });
    expect((await get("hunter2", env)).status).toBe(503);
  });

  it("splits pending vs recorded-or-published, ordered by position", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pending: { id: string }[];
      recorded: { id: string }[];
    };
    expect(body.pending.map((w) => w.id)).toEqual(["ma2", "ma1"]);
    expect(body.recorded.map((w) => w.id)).toEqual(["ma3", "ma4"]);
  });

  it("shapes each word as {id, hanzi, pinyin, tone, status} only", async () => {
    const res = await get();
    const body = (await res.json()) as { pending: Record<string, unknown>[] };
    expect(Object.keys(body.pending[0]).sort()).toEqual(["hanzi", "id", "pinyin", "status", "tone"]);
  });
});
