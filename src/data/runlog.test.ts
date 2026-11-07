import { beforeEach, describe, expect, it, vi } from "vitest";

const accountUserId = vi.fn<() => Promise<string | null>>();
vi.mock("./supabase.ts", () => ({ getSupabase: vi.fn(() => null), currentSession: vi.fn(), warn: vi.fn() }));
vi.mock("./stats.ts", () => ({
  accountUserId: () => accountUserId(),
  ensureProfile: vi.fn(async () => true),
  refreshServerStats: vi.fn(async () => undefined),
}));

const { postRunLog, rememberRunAccount } = await import("./runlog.ts");
const { loadOutbox } = await import("./runOutbox.ts");

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

const run = (runId: string) => ({
  runId,
  mode: "game" as const,
  score: 1,
  gates: 0,
  outcome: "quit" as const,
  tone_acc: null,
  per_key: {},
  wordIds: [],
});

describe("postRunLog on a closing page (brief 31)", () => {
  it("puts the run in the outbox before its first await once the account is known", async () => {
    accountUserId.mockResolvedValue("u1");
    rememberRunAccount();
    await Promise.resolve();
    await Promise.resolve();
    // The account lookup never answers now, as on a page that is unloading.
    accountUserId.mockReturnValue(new Promise(() => {}));
    void postRunLog(run("r1"));
    expect(loadOutbox().map((i) => [i.userId, i.run.runId])).toEqual([["u1", "r1"]]);
  });

  it("queues nothing for a guest", async () => {
    accountUserId.mockResolvedValue(null);
    rememberRunAccount();
    await Promise.resolve();
    await Promise.resolve();
    await postRunLog(run("r2"));
    expect(loadOutbox()).toEqual([]);
  });
});
