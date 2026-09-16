import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBucket, fakeEnv, type FakeBucket } from "./helpers.ts";

const wordsUpdate = vi.hoisted(() => ({
  calls: [] as unknown[],
  error: null as unknown,
  existing: new Set<string>(["ma1"]),
}));

vi.mock("../src/db.ts", () => ({
  serviceDb: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => {
            if (!wordsUpdate.existing.has(id)) return { data: null, error: null };
            return { data: { id }, error: null };
          },
        }),
      }),
      update: (patch: unknown) => ({
        eq: (_col: string, id: string) => ({
          select: () => ({
            maybeSingle: async () => {
              wordsUpdate.calls.push({ patch, id });
              if (wordsUpdate.error) return { data: null, error: wordsUpdate.error };
              return { data: { id }, error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

const { handleRaw } = await import("../src/routes/raw.ts");

async function post(
  path: string,
  body: string | Uint8Array,
  passcode: string | null = "hunter2",
  env = fakeEnv(),
) {
  const req = new Request(`https://clips.flappytone.com${path}`, {
    method: "POST",
    headers: passcode ? { "x-record-passcode": passcode } : {},
    body,
  });
  return handleRaw(req, env);
}

let raw: FakeBucket;
let env: ReturnType<typeof fakeEnv>;

beforeEach(() => {
  raw = fakeBucket();
  env = fakeEnv({ RAW: raw as unknown as R2Bucket });
  wordsUpdate.calls = [];
  wordsUpdate.error = null;
  wordsUpdate.existing = new Set(["ma1"]);
});

describe("POST /raw", () => {
  it("puts the object and flips status on the happy path", async () => {
    const res = await post("/raw?id=ma1&session=jane-01", "RIFFfake-wav", "hunter2", env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; key: string };
    expect(json.ok).toBe(true);
    expect(json.key).toBe("raw/jane-01/ma1.wav");
    expect(raw.objects.has("raw/jane-01/ma1.wav")).toBe(true);

    expect(wordsUpdate.calls).toHaveLength(1);
    const call = wordsUpdate.calls[0] as { patch: Record<string, unknown>; id: string };
    expect(call.id).toBe("ma1");
    expect(call.patch).toMatchObject({
      status: "recorded",
      raw_key: "raw/jane-01/ma1.wav",
      recorded_session: "jane-01",
    });
    expect(typeof call.patch.recorded_at).toBe("string");
  });

  it("500s and leaves the object in RAW when the db update fails", async () => {
    wordsUpdate.error = new Error("db down");
    const res = await post("/raw?id=ma1&session=jane-01", "RIFFfake-wav", "hunter2", env);
    expect(res.status).toBe(500);
    expect(raw.objects.has("raw/jane-01/ma1.wav")).toBe(true);
  });

  it("404s when id is not a words row", async () => {
    const res = await post("/raw?id=nope&session=jane-01", "RIFFfake-wav", "hunter2", env);
    expect(res.status).toBe(404);
    expect(raw.objects.size).toBe(0);
  });

  it("400s a bad id", async () => {
    const res = await post("/raw?id=BAD&session=jane-01", "RIFFfake-wav", "hunter2", env);
    expect(res.status).toBe(400);
  });

  it("400s a bad session", async () => {
    const res = await post("/raw?id=ma1&session=Bad_Session!", "RIFFfake-wav", "hunter2", env);
    expect(res.status).toBe(400);
  });

  it("400s an empty body", async () => {
    const res = await post("/raw?id=ma1&session=jane-01", "", "hunter2", env);
    expect(res.status).toBe(400);
  });

  it("413s a too-large body", async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    const res = await post("/raw?id=ma1&session=jane-01", big, "hunter2", env);
    expect(res.status).toBe(413);
  });

  it("401s a wrong passcode", async () => {
    const res = await post("/raw?id=ma1&session=jane-01", "RIFFfake-wav", "wrong", env);
    expect(res.status).toBe(401);
    expect(raw.objects.size).toBe(0);
  });

  it("503s when RECORD_PASSCODE is unset", async () => {
    const noPasscode = fakeEnv({ RAW: raw as unknown as R2Bucket, RECORD_PASSCODE: "" });
    const res = await post("/raw?id=ma1&session=jane-01", "RIFFfake-wav", "hunter2", noPasscode);
    expect(res.status).toBe(503);
  });
});
