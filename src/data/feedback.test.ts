import { beforeEach, describe, expect, it, vi } from "vitest";

import { submitFeedback } from "./feedback.ts";
import * as supabaseModule from "./supabase.ts";

vi.mock("./supabase.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase.ts")>();
  return { ...actual, getSupabase: vi.fn(), warn: vi.fn() };
});

const base = { rating: 4, screen: "gameover", tier: "guest" as const };

function clientWith(insert: ReturnType<typeof vi.fn>) {
  vi.mocked(supabaseModule.getSupabase).mockReturnValue({
    from: () => ({ insert }),
  } as unknown as ReturnType<typeof supabaseModule.getSupabase>);
}

describe("submitFeedback", () => {
  beforeEach(() => vi.mocked(supabaseModule.getSupabase).mockReset());

  it("refuses a blank message without touching the network", async () => {
    const insert = vi.fn();
    clientWith(insert);
    expect(await submitFeedback({ ...base, message: "   " })).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("resolves false with no client configured", async () => {
    vi.mocked(supabaseModule.getSupabase).mockReturnValue(null);
    expect(await submitFeedback({ ...base, message: "hi" })).toBe(false);
  });

  it("never sends user_id — the column default fills it from the session", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    clientWith(insert);
    expect(await submitFeedback({ ...base, message: "  great game  " })).toBe(true);
    const row = insert.mock.calls[0][0];
    expect(row).not.toHaveProperty("user_id");
    expect(row.message).toBe("great game");
  });

  it("resolves false on an insert error or a throw, never throws", async () => {
    clientWith(vi.fn().mockResolvedValue({ error: { message: "rls" } }));
    expect(await submitFeedback({ ...base, message: "x" })).toBe(false);
    clientWith(vi.fn().mockRejectedValue(new Error("network")));
    expect(await submitFeedback({ ...base, message: "x" })).toBe(false);
  });
});
