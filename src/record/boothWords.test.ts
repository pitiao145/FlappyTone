import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBoothWords, statusFor, type BoothWord } from "./boothWords.ts";

const words: BoothWord[] = [
  { id: "ce4", hanzi: "測", pinyin: "cè", tone: 4, textbook: "pending", natural: "pending", lists: ["tocfl1"] },
  { id: "ma1b", hanzi: "媽", pinyin: "mā", tone: 1, textbook: "recorded", natural: "pending", lists: ["core-120"] },
];
const speaker = { id: "jane", name: "Jane" };

const ok = (body: unknown) =>
  vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
  ) as unknown as typeof fetch;

describe("fetchBoothWords", () => {
  it("parses a 200 into the word list, both styles' status intact", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ speaker, words }), { status: 200 })),
    ) as unknown as typeof fetch;
    const result = await fetchBoothWords("open", fetchImpl);
    expect(result.words).toEqual(words);
  });

  it("sends the passcode header", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ speaker, words: [] }), { status: 200 })),
    ) as unknown as typeof fetch;
    await fetchBoothWords("secret", fetchImpl);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/booth/words");
    expect((init as RequestInit).headers).toMatchObject({ "x-record-passcode": "secret" });
  });

  it("carries the speaker the server resolved, not one the client chose", async () => {
    const res = await fetchBoothWords("aaa", ok({ speaker, words: [] }));
    expect(res.speaker).toEqual({ id: "jane", name: "Jane" });
  });

  it("throws when the server sends no speaker", async () => {
    await expect(fetchBoothWords("aaa", ok({ words: [] }))).rejects.toThrow();
    await expect(fetchBoothWords("aaa", ok({ speaker: { id: "jane" }, words: [] }))).rejects.toThrow();
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

describe("statusFor", () => {
  it("reads the field for the requested style", () => {
    expect(statusFor(words[1], "textbook")).toBe("recorded");
    expect(statusFor(words[1], "natural")).toBe("pending");
  });
});

describe("requireRecordBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws a clear message when VITE_CLIPS_BASE_URL is unset", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_CLIPS_BASE_URL", "");
    const { requireRecordBaseUrl } = await import("./boothWords.ts");
    expect(() => requireRecordBaseUrl()).toThrow("Recording isn't configured — tell Pierre.");
  });

  it("returns the base URL when configured — this is what RecordApp's passcode check and Uploader.send() both call before hitting the Worker", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_CLIPS_BASE_URL", "https://clips.example.com");
    const { requireRecordBaseUrl } = await import("./boothWords.ts");
    expect(requireRecordBaseUrl()).toBe("https://clips.example.com");
  });
});
