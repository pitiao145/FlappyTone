import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function req(body: unknown, auth: string | null = "Bearer valid-token"): Request {
  const headers: Record<string, string> = {};
  if (auth !== null) headers.authorization = auth;
  return new Request("https://example.test/api/note", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function load(opts: {
  user?: { id: string; is_anonymous?: boolean; email?: string } | null;
  eligible?: boolean;
  rpcError?: unknown;
} = {}) {
  const user = "user" in opts ? opts.user : { id: "user-1", is_anonymous: false, email: "a@b.co" };
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> => {
    if (name === "note_eligible") return { data: opts.eligible ?? true, error: opts.rpcError ?? null };
    // No targeted note for this account: the generic path, as before 0035.
    if (name === "note_claim_targeted") return { data: [], error: null };
    if (name === "note_answer_targeted") return { data: false, error: null };
    return { data: null, error: null };
  });
  const insert = vi.fn(async () => ({ error: null }));
  vi.doMock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
      from: vi.fn((table: string) => {
        expect(table).toBe("feedback");
        return { insert };
      }),
      rpc,
    })),
  }));
  vi.resetModules();
  const mod = await import("./note.js");
  return { ...mod, rpc, insert };
}

describe("parseNoteBody", () => {
  it("accepts the three actions", async () => {
    const { parseNoteBody } = await load();
    expect(parseNoteBody({ action: "check" })).toEqual({ action: "check" });
    expect(parseNoteBody({ action: "dismiss" })).toEqual({ action: "dismiss", kind: "generic", context: {} });
    expect(parseNoteBody({ action: "dismiss", kind: "targeted" })).toEqual({
      action: "dismiss",
      kind: "targeted",
      context: {},
    });
    expect(parseNoteBody({ action: "send", message: " hi ", wantsChat: false, context: { tier: "free" } })).toEqual({
      action: "send",
      kind: "generic",
      message: "hi",
      wantsChat: false,
      context: { tier: "free" },
    });
  });

  it.each([
    null,
    { action: "nope" },
    { action: "send", message: "   ", wantsChat: false },
    { action: "send", message: "x".repeat(1001), wantsChat: false },
    { action: "send", message: "hi" },
    { action: "send", message: "hi", wantsChat: false, context: { nested: { a: 1 } } },
    { action: "send", message: "hi", wantsChat: false, context: { long: "x".repeat(81) } },
    { action: "dismiss", context: [1] },
    { action: "dismiss", kind: "other" },
    { action: "send", kind: 1, message: "hi", wantsChat: false },
  ])("rejects %j", async (body) => {
    const { parseNoteBody } = await load();
    expect(parseNoteBody(body)).toBeNull();
  });
});

describe("POST /api/note", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.restoreAllMocks();
    vi.doUnmock("@supabase/supabase-js");
  });

  it("returns 401 without a bearer token", async () => {
    const { POST } = await load();
    expect((await POST(req({ action: "check" }, null))).status).toBe(401);
  });

  it("returns 403 for an anonymous session", async () => {
    const { POST, rpc } = await load({ user: { id: "u", is_anonymous: true } });
    expect((await POST(req({ action: "check" }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers check with the server's eligibility and its thresholds", async () => {
    const { POST, rpc, NOTE_MIN_DAYS, NOTE_MIN_RUNS } = await load({ eligible: false });
    const res = await POST(req({ action: "check" }));
    expect(await res.json()).toEqual({ show: false });
    expect(rpc).toHaveBeenCalledWith("note_eligible", {
      p_user: "user-1",
      p_min_days: NOTE_MIN_DAYS,
      p_min_runs: NOTE_MIN_RUNS,
    });
  });

  it("refuses a write once the player no longer qualifies", async () => {
    const { POST, insert } = await load({ eligible: false });
    const res = await POST(req({ action: "send", message: "hi", wantsChat: true }));
    expect(res.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });

  it("stores the session email only when the player wants a chat", async () => {
    const { POST, insert } = await load();
    await POST(req({ action: "send", message: "hi", wantsChat: true, context: { email: "evil@x.co" } }));
    await POST(req({ action: "send", message: "hi", wantsChat: false }));
    const rows = insert.mock.calls.map((c) => (c as unknown[])[0] as Record<string, unknown>);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      source: "note",
      message: "hi",
      wants_chat: true,
      contact_email: "a@b.co",
      tier: "free",
    });
    expect(rows[1]).toMatchObject({ wants_chat: false, contact_email: null });
  });

  it("records a dismiss on the profile, not as feedback", async () => {
    const { POST, insert, rpc } = await load();
    expect((await POST(req({ action: "dismiss" }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("note_dismiss", { p_user: "user-1" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 502 when the eligibility check fails", async () => {
    const { POST } = await load({ rpcError: { message: "boom" } });
    expect((await POST(req({ action: "check" }))).status).toBe(502);
  });
});

/**
 * Targeted notes (migration 0035), against a small in-memory model of
 * note_claim_targeted / note_answer_targeted / note_eligible that follows the
 * SQL: claim once across all targets, answer once within 7 days, and only a
 * generic reply uses up the generic note.
 */
describe("POST /api/note — targeted notes", () => {
  const A = "user-a";
  const B = "user-b";
  const C = "user-c";
  const COPY = { peek: "Peek", body: "Body", question: "Question?" };

  type Note = {
    id: string;
    targets: string[];
    shown_at: number | null;
    shown_to: string | null;
    answered_at: number | null;
  };

  async function loadTargeted(userId: string, db: { notes: Note[]; feedback: Record<string, unknown>[]; dismissals: Record<string, number> }) {
    const user = { id: userId, is_anonymous: false, email: `${userId}@test.dev` };
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      const p = args.p_user as string;
      if (name === "note_claim_targeted") {
        const n = db.notes.find((x) => x.shown_at === null && x.targets.includes(p));
        if (!n) return { data: [], error: null };
        n.shown_at = Date.now();
        n.shown_to = p;
        return { data: [{ id: n.id, ...COPY }], error: null };
      }
      if (name === "note_answer_targeted") {
        const week = 7 * 24 * 3600 * 1000;
        const n = db.notes.find(
          (x) =>
            x.shown_to === p &&
            x.answered_at === null &&
            x.shown_at !== null &&
            x.shown_at > Date.now() - week &&
            x.targets.includes(p),
        );
        if (!n) return { data: false, error: null };
        n.answered_at = Date.now();
        if (args.p_message !== null) {
          db.feedback.push({
            user_id: p,
            source: "note",
            note_id: n.id,
            message: args.p_message,
            wants_chat: args.p_wants_chat,
            contact_email: args.p_wants_chat ? args.p_contact_email : null,
          });
        }
        return { data: true, error: null };
      }
      if (name === "note_eligible") {
        // Activity is enough for everyone here. Only a generic reply
        // (no note_id) uses up the generic note (0035).
        const sentGeneric = db.feedback.some((f) => f.user_id === p && f.note_id == null);
        return { data: !sentGeneric, error: null };
      }
      if (name === "note_dismiss") {
        db.dismissals[p] = (db.dismissals[p] ?? 0) + 1;
        return { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    const insert = vi.fn(async (row: Record<string, unknown>) => {
      db.feedback.push(row);
      return { error: null };
    });
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
        auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
        from: vi.fn(() => ({ insert })),
        rpc,
      })),
    }));
    vi.resetModules();
    const mod = await import("./note.js");
    return { ...mod, rpc, insert };
  }

  function freshDb() {
    return {
      notes: [{ id: "note-1", targets: [A, B], shown_at: null, shown_to: null, answered_at: null }] as Note[],
      feedback: [] as Record<string, unknown>[],
      dismissals: {} as Record<string, number>,
    };
  }

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.restoreAllMocks();
    vi.doUnmock("@supabase/supabase-js");
  });

  async function check(userId: string, db: ReturnType<typeof freshDb>) {
    const { POST } = await loadTargeted(userId, db);
    return (await POST(req({ action: "check" }))).json();
  }

  it("shows once across both accounts; after that the generic check decides", async () => {
    const db = freshDb();
    expect(await check(A, db)).toEqual({ show: true, note: COPY });
    // The targeted note is used up; the generic note is separate (here the
    // model says both accounts qualify for it).
    expect(await check(A, db)).toEqual({ show: true });
    expect(await check(B, db)).toEqual({ show: true });
  });

  it("shows on B when B checks first, then never on A", async () => {
    const db = freshDb();
    expect(await check(B, db)).toEqual({ show: true, note: COPY });
    expect(await check(A, db)).not.toHaveProperty("note");
  });

  it("never answers with the note's id", async () => {
    const db = freshDb();
    const body = await check(A, db);
    expect(JSON.stringify(body)).not.toContain("note-1");
  });

  it("a send writes one feedback row with note_id; a second send is refused", async () => {
    const db = freshDb();
    await check(A, db);
    const { POST, insert } = await loadTargeted(A, db);
    const first = await POST(req({ action: "send", kind: "targeted", message: "hi", wantsChat: true }));
    expect(first.status).toBe(200);
    expect(db.feedback).toHaveLength(1);
    expect(db.feedback[0]).toMatchObject({ user_id: A, note_id: "note-1", message: "hi", contact_email: `${A}@test.dev` });
    expect(insert).not.toHaveBeenCalled();
    const second = await POST(req({ action: "send", kind: "targeted", message: "again", wantsChat: false }));
    expect(second.status).toBe(409);
    expect(db.feedback).toHaveLength(1);
  });

  it("B cannot answer the note A was shown", async () => {
    const db = freshDb();
    await check(A, db);
    const { POST } = await loadTargeted(B, db);
    expect((await POST(req({ action: "send", kind: "targeted", message: "hi", wantsChat: false }))).status).toBe(409);
    expect(db.feedback).toHaveLength(0);
    expect(db.notes[0].answered_at).toBeNull();
  });

  it("passes the session email only when the player wants a chat", async () => {
    const db = freshDb();
    await check(A, db);
    const { POST, rpc } = await loadTargeted(A, db);
    await POST(req({ action: "send", kind: "targeted", message: "hi", wantsChat: false, context: { email: "evil@x.co" } }));
    const call = rpc.mock.calls.find((c) => c[0] === "note_answer_targeted");
    expect(call?.[1]).toMatchObject({ p_user: A, p_message: "hi", p_wants_chat: false, p_contact_email: null });
  });

  it("dismiss closes the note without touching note_dismissals", async () => {
    const db = freshDb();
    await check(A, db);
    const { POST, rpc } = await loadTargeted(A, db);
    expect((await POST(req({ action: "dismiss", kind: "targeted" }))).status).toBe(200);
    expect(db.notes[0].answered_at).not.toBeNull();
    expect(db.feedback).toHaveLength(0);
    expect(rpc.mock.calls.some((c) => c[0] === "note_dismiss")).toBe(false);
    expect(db.dismissals[A]).toBeUndefined();
    // Closed: a later targeted send is refused.
    expect((await POST(req({ action: "send", kind: "targeted", message: "hi", wantsChat: false }))).status).toBe(409);
  });

  it("an account with no targeted note gets the generic result, unchanged", async () => {
    const db = freshDb();
    expect(await check(C, db)).toEqual({ show: true });
    const { POST, insert, rpc } = await loadTargeted(C, db);
    expect((await POST(req({ action: "send", message: "hi", wantsChat: false }))).status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(db.feedback[0]).toMatchObject({ user_id: C, source: "note", tier: "free" });
    expect(db.feedback[0].note_id).toBeUndefined();
    expect(rpc.mock.calls.some((c) => c[0] === "note_eligible")).toBe(true);
  });

  it("generic dismiss still counts on the profile", async () => {
    const db = freshDb();
    const { POST } = await loadTargeted(C, db);
    expect((await POST(req({ action: "dismiss" }))).status).toBe(200);
    expect(db.dismissals[C]).toBe(1);
  });

  it("answering a targeted note does not use up the generic one", async () => {
    const db = freshDb();
    await check(A, db);
    const { POST } = await loadTargeted(A, db);
    await POST(req({ action: "send", kind: "targeted", message: "hi", wantsChat: false }));
    expect(await check(A, db)).toEqual({ show: true });
    expect((await POST(req({ action: "send", message: "generic reply", wantsChat: false }))).status).toBe(200);
    expect(db.feedback.map((f) => f.note_id ?? null)).toEqual(["note-1", null]);
    // And the generic one is used up now.
    expect(await check(A, db)).toEqual({ show: false });
  });

  it("a stale targeted card is never saved as a generic reply", async () => {
    const db = freshDb();
    await check(A, db);
    const { POST, insert } = await loadTargeted(A, db);
    await POST(req({ action: "dismiss", kind: "targeted" }));
    const res = await POST(req({ action: "send", kind: "targeted", message: "late", wantsChat: false }));
    expect(res.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
    expect(db.feedback).toHaveLength(0);
  });

  it("a generic answer never touches the targeted note", async () => {
    const db = freshDb();
    await check(A, db);
    const { POST, rpc } = await loadTargeted(A, db);
    await POST(req({ action: "dismiss" }));
    expect(rpc.mock.calls.some((c) => c[0] === "note_answer_targeted")).toBe(false);
    expect(db.notes[0].answered_at).toBeNull();
    expect(db.dismissals[A]).toBe(1);
  });

  it("returns 502 when the claim fails", async () => {
    const { POST, rpc } = await load();
    rpc.mockImplementation(async () => ({ data: null, error: { message: "boom" } }));
    expect((await POST(req({ action: "check" }))).status).toBe(502);
  });
});
