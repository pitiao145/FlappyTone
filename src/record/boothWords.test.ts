import { describe, expect, it, vi } from "vitest";
import { fetchBoothWords, type BoothWord } from "./boothWords.ts";

const pending: BoothWord[] = [{ id: "ce4", hanzi: "測", pinyin: "cè", tone: 4, status: "pending" }];
const recorded: BoothWord[] = [{ id: "ma1b", hanzi: "媽", pinyin: "mā", tone: 1, status: "recorded" }];

describe("fetchBoothWords", () => {
  it("parses a 200 into pending/recorded", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ pending, recorded }), { status: 200 })),
    ) as unknown as typeof fetch;
    const result = await fetchBoothWords("open", fetchImpl);
    expect(result.pending).toEqual(pending);
    expect(result.recorded).toEqual(recorded);
  });

  it("sends the passcode header", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ pending: [], recorded: [] }), { status: 200 })),
    ) as unknown as typeof fetch;
    await fetchBoothWords("secret", fetchImpl);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/booth/words");
    expect((init as RequestInit).headers).toMatchObject({ "x-record-passcode": "secret" });
  });

  it("throws 'Wrong code.' on 401", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 401 })),
    ) as unknown as typeof fetch;
    await expect(fetchBoothWords("bad", fetchImpl)).rejects.toThrow("Wrong code.");
  });

  it("throws on a 503", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 503 })),
    ) as unknown as typeof fetch;
    await expect(fetchBoothWords("open", fetchImpl)).rejects.toThrow(/switched on/i);
  });

  it("throws on a network error", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    await expect(fetchBoothWords("open", fetchImpl)).rejects.toThrow(/online/i);
  });

  it("throws on a malformed body", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ oops: true }), { status: 200 })),
    ) as unknown as typeof fetch;
    await expect(fetchBoothWords("open", fetchImpl)).rejects.toThrow();
  });
});
