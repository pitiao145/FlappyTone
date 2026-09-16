import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBucket, fakeEnv, type FakeBucket } from "./helpers.ts";

const db = vi.hoisted(() => ({
  upserts: [] as unknown[],
  conflictTargets: [] as (string | undefined)[],
  error: null as unknown,
  existing: new Set<string>(["ma1", "xiong2"]),
}));

vi.mock("../src/db.ts", () => ({
  serviceDb: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => {
            if (table !== "words") return { data: null, error: null };
            if (!db.existing.has(id)) return { data: null, error: null };
            return { data: { id }, error: null };
          },
        }),
      }),
      upsert: (row: unknown, opts?: { onConflict?: string }) => {
        db.upserts.push(row);
        db.conflictTargets.push(opts?.onConflict);
        return {
          select: () => ({
            maybeSingle: async () =>
              db.error ? { data: null, error: db.error } : { data: { word_id: "ok" }, error: null },
          }),
        };
      },
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
  db.upserts = [];
  db.conflictTargets = [];
  db.error = null;
  db.existing = new Set(["ma1", "xiong2"]);
});

describe("POST /raw", () => {
  it("writes only into its own speaker's prefix and row", async () => {
    const res = await post("/raw?id=xiong2&session=2026-09-16-abc", "RIFFfake-wav", "hunter2", env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; key: string };
    expect(json.key).toBe("raw/jane/2026-09-16-abc/xiong2.wav");
    expect([...raw.objects.keys()]).toEqual(["raw/jane/2026-09-16-abc/xiong2.wav"]);

    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({
      word_id: "xiong2",
      speaker_id: "jane",
      status: "recorded",
      raw_key: "raw/jane/2026-09-16-abc/xiong2.wav",
      recorded_session: "2026-09-16-abc",
    });
    expect(db.conflictTargets[0]).toBe("word_id,speaker_id");
  });

  it("takes no speaker from the client", async () => {
    // The request cannot express "write as someone else" — there is no
    // parameter for it, so a stale tab or a typo cannot cross-write.
    const res = await post(
      "/raw?id=xiong2&session=s1&speaker=mark&speaker_id=mark",
      "RIFFfake-wav",
      "hunter2",
      env,
    );
    expect(res.status).toBe(200);
    expect([...raw.objects.keys()][0]).toContain("raw/jane/");
    expect(db.upserts[0]).toMatchObject({ speaker_id: "jane" });
  });

  it("gives a second passcode a second speaker's prefix and row", async () => {
    await post("/raw?id=xiong2&session=s1", "RIFFfake-wav", "mark-code", env);
    expect([...raw.objects.keys()]).toEqual(["raw/mark/s1/xiong2.wav"]);
    expect(db.upserts[0]).toMatchObject({ speaker_id: "mark" });
  });

  it("500s and leaves the object in RAW when the db write fails", async () => {
    db.error = new Error("db down");
    const res = await post("/raw?id=ma1&session=jane-01", "RIFFfake-wav", "hunter2", env);
    expect(res.status).toBe(500);
    expect(raw.objects.has("raw/jane/jane-01/ma1.wav")).toBe(true);
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

  it("503s when RECORD_PASSCODES is unset", async () => {
    const noPasscode = fakeEnv({ RAW: raw as unknown as R2Bucket, RECORD_PASSCODES: "" });
    const res = await post("/raw?id=ma1&session=jane-01", "RIFFfake-wav", "hunter2", noPasscode);
    expect(res.status).toBe(503);
    expect(raw.objects.size).toBe(0);
  });
});
