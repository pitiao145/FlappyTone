/**
 * The roster read's never-throw/never-empty contract, and the row mapping.
 *
 * The mapping is the part worth pinning: a renamed `is_default` column yields
 * `isDefault: undefined`, `resolveSpeaker` then finds no default, and the game
 * resolves to the wrong voice (or to none) with no error anywhere — the same
 * silent-seam class `catalogSeam.test.ts` exists for.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSpeakers, loadRoster } from "./speakers.ts";
import * as supabase from "./supabase.ts";

type SelectResult = { data: unknown; error: { message: string } | null };

/** A client stub whose `.from().select()` resolves to `result`. */
function clientReturning(result: SelectResult) {
  return {
    from: () => ({ select: () => Promise.resolve(result) }),
  } as unknown as supabase.FlappyToneClient;
}

const ROWS = [
  { id: "jane", name: "Jane", gender: "female", accent: "tw", is_default: true, active: true },
  { id: "mark", name: "Mark", gender: "male", accent: "tw", is_default: false, active: true },
];

describe("fetchSpeakers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps the wire row's snake_case onto the Speaker shape", async () => {
    vi.spyOn(supabase, "getSupabase").mockReturnValue(clientReturning({ data: ROWS, error: null }));
    const roster = await fetchSpeakers();
    expect(roster).toEqual([
      { id: "jane", name: "Jane", gender: "female", accent: "tw", isDefault: true, active: true },
      { id: "mark", name: "Mark", gender: "male", accent: "tw", isDefault: false, active: true },
    ]);
  });

  it("falls back to the bundled floor with no client", async () => {
    vi.spyOn(supabase, "getSupabase").mockReturnValue(null);
    const roster = await fetchSpeakers();
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ id: "jane", isDefault: true, active: true });
  });

  it("falls back to the bundled floor when the query errors", async () => {
    vi.spyOn(supabase, "warn").mockImplementation(() => undefined);
    vi.spyOn(supabase, "getSupabase").mockReturnValue(
      clientReturning({ data: null, error: { message: "boom" } }),
    );
    expect(await fetchSpeakers()).toHaveLength(1);
  });

  it("falls back to the bundled floor on an empty roster", async () => {
    vi.spyOn(supabase, "warn").mockImplementation(() => undefined);
    vi.spyOn(supabase, "getSupabase").mockReturnValue(clientReturning({ data: [], error: null }));
    // Never empty: an empty roster resolves to no speaker, which is a game
    // with no reference audio.
    expect(await fetchSpeakers()).toHaveLength(1);
  });

  it("never throws, even when the client itself does", async () => {
    vi.spyOn(supabase, "warn").mockImplementation(() => undefined);
    vi.spyOn(supabase, "getSupabase").mockImplementation(() => {
      throw new Error("no");
    });
    await expect(fetchSpeakers()).resolves.toHaveLength(1);
  });
});

describe("loadRoster", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads once per session and hands every caller the same answer", async () => {
    const getSupabase = vi
      .spyOn(supabase, "getSupabase")
      .mockReturnValue(clientReturning({ data: ROWS, error: null }));
    const [a, b] = await Promise.all([loadRoster(), loadRoster()]);
    expect(a).toBe(b);
    expect(await loadRoster()).toBe(a);
    expect(getSupabase).toHaveBeenCalledTimes(1);
  });
});
