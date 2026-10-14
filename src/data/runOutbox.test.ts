import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainOutbox, enqueueRun, loadOutbox, MAX_ITEMS, type OutboxItem } from "./runOutbox.ts";
import { resultForStatus } from "./runlog.ts";

vi.mock("./supabase.ts", () => ({ getSupabase: vi.fn(), currentSession: vi.fn(), warn: vi.fn() }));

let storageMap: Record<string, string>;
beforeEach(() => {
  storageMap = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storageMap[k] ?? null,
    setItem: (k: string, v: string) => {
      storageMap[k] = v;
    },
    removeItem: (k: string) => {
      delete storageMap[k];
    },
  } as Storage);
});

const item = (runId: string, userId = "u1"): OutboxItem => ({
  userId,
  day: "2026-10-14",
  run: { runId, mode: "game", score: 1, gates: 0, outcome: "finished", tone_acc: null, per_key: {}, wordIds: [] },
});

describe("run outbox (brief 05)", () => {
  it("dedupes by runId", () => {
    enqueueRun(item("a"));
    enqueueRun(item("a"));
    expect(loadOutbox()).toHaveLength(1);
  });

  it("caps the queue, dropping the oldest", () => {
    for (let i = 0; i < MAX_ITEMS + 3; i++) enqueueRun(item(`r${i}`));
    const q = loadOutbox();
    expect(q).toHaveLength(MAX_ITEMS);
    expect(q[0].run.runId).toBe("r3");
  });

  it("a failed post keeps the run for the next load, and the retry sends the same runId", async () => {
    enqueueRun(item("a"));
    enqueueRun(item("b"));
    const offline = vi.fn().mockResolvedValue("retry");
    expect(await drainOutbox("u1", offline)).toBe(0);
    expect(offline).toHaveBeenCalledTimes(1); // stops at the first failure
    expect(loadOutbox().map((i) => i.run.runId)).toEqual(["a", "b"]);

    const seen: string[] = [];
    expect(await drainOutbox("u1", async (i) => (seen.push(i.run.runId), "done"))).toBe(2);
    expect(seen).toEqual(["a", "b"]);
    expect(loadOutbox()).toEqual([]);
  });

  it("a thrown post is a retry, never a crash", async () => {
    enqueueRun(item("a"));
    expect(await drainOutbox("u1", () => Promise.reject(new Error("net")))).toBe(0);
    expect(loadOutbox()).toHaveLength(1);
  });

  it("only drains the signed-in account's runs", async () => {
    enqueueRun(item("a", "u1"));
    enqueueRun(item("b", "u2"));
    const post = vi.fn().mockResolvedValue("done");
    await drainOutbox("u1", post);
    expect(post).toHaveBeenCalledTimes(1);
    expect(loadOutbox().map((i) => i.userId)).toEqual(["u2"]);
  });

  it("drops a run the server will never accept, retries the rest", () => {
    expect(resultForStatus(200)).toBe("done");
    expect(resultForStatus(400)).toBe("done");
    expect(resultForStatus(403)).toBe("done");
    expect(resultForStatus(401)).toBe("retry");
    expect(resultForStatus(429)).toBe("retry");
    expect(resultForStatus(502)).toBe("retry");
    expect(resultForStatus(503)).toBe("retry");
  });
});
