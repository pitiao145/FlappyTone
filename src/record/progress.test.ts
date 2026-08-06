import { beforeEach, describe, expect, it } from "vitest";
import { clearProgress, loadProgress, saveProgress } from "./progress.ts";

/** Minimal in-memory Storage, so these tests need no DOM. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

/** A Storage that throws on everything, like a blocked or full one. */
const hostileStorage = new Proxy({} as Storage, {
  get() {
    return () => {
      throw new Error("blocked");
    };
  },
});

describe("progress", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it("starts a fresh session when there is nothing saved", () => {
    const p = loadProgress(storage);
    expect(p.done).toEqual([]);
    expect(p.sessionId).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+$/);
  });

  it("round-trips, so reopening resumes where she left off", () => {
    const p = loadProgress(storage);
    saveProgress({ ...p, done: ["ma1", "ma2"] }, storage);
    const back = loadProgress(storage);
    expect(back.sessionId).toBe(p.sessionId);
    expect(back.done).toEqual(["ma1", "ma2"]);
  });

  it("keeps the session id across a resume, so blobs land in one folder", () => {
    const first = loadProgress(storage).sessionId;
    saveProgress({ sessionId: first, done: [] }, storage);
    expect(loadProgress(storage).sessionId).toBe(first);
  });

  it("recovers from corrupt storage instead of blanking the page", () => {
    const p = loadProgress(memoryStorage({ "flaptone.record.progress.v1": "{not json" }));
    expect(p.done).toEqual([]);
    expect(p.sessionId).toBeTruthy();
  });

  it("ignores a saved value of the wrong shape", () => {
    const p = loadProgress(memoryStorage({ "flaptone.record.progress.v1": '{"done":"nope"}' }));
    expect(p.done).toEqual([]);
  });

  it("survives storage that throws, so she can still record", () => {
    expect(() => saveProgress({ sessionId: "x", done: [] }, hostileStorage)).not.toThrow();
    expect(() => clearProgress(hostileStorage)).not.toThrow();
    expect(loadProgress(hostileStorage).done).toEqual([]);
  });

  it("forgets everything on start over", () => {
    saveProgress({ sessionId: "s", done: ["ma1"] }, storage);
    clearProgress(storage);
    expect(loadProgress(storage).done).toEqual([]);
  });
});
