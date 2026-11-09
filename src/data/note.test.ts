import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { armNote, markNoteAnswered, parseNoteCheck, resetNoteState, takeNoteCheck } from "./note.ts";

describe("note show-once logic", () => {
  beforeEach(() => resetNoteState());

  it("never asks before a run or round finished", () => {
    expect(takeNoteCheck()).toBe(false);
  });

  it("asks once per finish", () => {
    armNote();
    expect(takeNoteCheck()).toBe(true);
    expect(takeNoteCheck()).toBe(false);
  });

  it("asks again after the next finish when the card was only seen", () => {
    armNote();
    takeNoteCheck();
    armNote();
    expect(takeNoteCheck()).toBe(true);
  });

  it("never asks again in this load once answered", () => {
    armNote();
    takeNoteCheck();
    markNoteAnswered();
    armNote();
    expect(takeNoteCheck()).toBe(false);
  });
});

describe("parseNoteCheck", () => {
  const note = { peek: "p", body: "b", question: "q" };

  it("keeps a generic yes and a targeted note", () => {
    expect(parseNoteCheck({ show: true })).toEqual({ show: true });
    expect(parseNoteCheck({ show: true, note })).toEqual({ show: true, note });
  });

  it("drops extra fields such as an id", () => {
    expect(parseNoteCheck({ show: true, note: { ...note, id: "x" } })).toEqual({ show: true, note });
  });

  it.each([null, "yes", { show: "true" }, { show: false, note }, { show: true, note: null }, { show: true, note: { peek: "p" } }, { show: true, note: { ...note, body: "  " } }])(
    "answers no for %j",
    (raw) => {
      expect(parseNoteCheck(raw)).toEqual({ show: false });
    },
  );
});

describe("checkNote never throws", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("./supabase.ts");
    vi.resetModules();
  });

  async function loadWithFetch(fetchImpl: () => Promise<Response>) {
    vi.resetModules();
    vi.doMock("./supabase.ts", () => ({
      getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
      warn: () => {},
    }));
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    return import("./note.ts");
  }

  it("returns {show:false} on a network failure", async () => {
    const { checkNote } = await loadWithFetch(async () => {
      throw new TypeError("network down");
    });
    expect(await checkNote()).toEqual({ show: false });
  });

  it("returns {show:false} on a parse failure", async () => {
    const { checkNote } = await loadWithFetch(async () => new Response("not json", { status: 200 }));
    expect(await checkNote()).toEqual({ show: false });
  });

  it("returns {show:false} on a server error", async () => {
    const { checkNote } = await loadWithFetch(async () => new Response("{}", { status: 502 }));
    expect(await checkNote()).toEqual({ show: false });
  });

  it("returns the targeted note", async () => {
    const note = { peek: "p", body: "b", question: "q" };
    const { checkNote } = await loadWithFetch(async () => Response.json({ show: true, note }));
    expect(await checkNote()).toEqual({ show: true, note });
  });
});
