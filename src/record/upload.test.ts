import { describe, expect, it, vi } from "vitest";
import { Uploader, type UploadState } from "./upload.ts";

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });

function make(fetchImpl: typeof fetch) {
  const states: UploadState[] = [];
  const uploader = new Uploader({
    sessionId: "s1",
    passcode: "open",
    onChange: (s) => states.push(s),
    fetchImpl,
    sleep: () => Promise.resolve(), // no real backoff in tests
  });
  return { uploader, states };
}

const ok = () => Promise.resolve(new Response(null, { status: 200 }));
const boom = () => Promise.resolve(new Response(null, { status: 500 }));

describe("Uploader", () => {
  it("uploads a take and marks it done", async () => {
    const fetchImpl = vi.fn(ok) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(uploader.getState().byId.ma1).toBe("done");
    expect(uploader.getState().pending).toBe(0);
  });

  it("sends the id, session and passcode the server checks", async () => {
    const fetchImpl = vi.fn(ok) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    uploader.enqueue("hao3", blob());
    await uploader.flush();
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("id=hao3");
    expect(url).toContain("session=s1");
    expect((init as RequestInit).headers).toMatchObject({ "x-record-passcode": "open" });
  });

  it("retries a server error rather than losing the take", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(() => {
      calls++;
      return calls < 3 ? boom() : ok();
    }) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(calls).toBe(3);
    expect(uploader.getState().byId.ma1).toBe("done");
  });

  it("retries a network failure", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(() => {
      calls++;
      return calls < 2 ? Promise.reject(new Error("offline")) : ok();
    }) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(uploader.getState().byId.ma1).toBe("done");
  });

  it("gives up immediately on a bad passcode instead of retrying forever", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 401 })),
    ) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(uploader.getState().byId.ma1).toBe("failed");
    expect(uploader.getState().failed).toBe(1);
  });

  it("eventually gives up and surfaces the failure", async () => {
    const fetchImpl = vi.fn(boom) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(uploader.getState().byId.ma1).toBe("failed");
  });

  it("retries what failed when asked", async () => {
    let fail = true;
    const fetchImpl = vi.fn(() => (fail ? boom() : ok())) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(uploader.getState().byId.ma1).toBe("failed");

    fail = false;
    uploader.retryFailed();
    await uploader.flush();
    expect(uploader.getState().byId.ma1).toBe("done");
  });

  it("does not upload a superseded take twice", async () => {
    const fetchImpl = vi.fn(ok) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    // Re-recording before the queue drains: only the latest take should go.
    uploader.enqueue("ma1", blob());
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("confirms a word only once the server has stored it", async () => {
    // What resume is allowed to trust. Confirming on capture meant a word that
    // never reached storage was remembered as done and skipped on the way back.
    const confirmed: string[] = [];
    const uploader = new Uploader({
      sessionId: "s1",
      passcode: "open",
      onChange: () => {},
      onConfirmed: (id) => confirmed.push(id),
      fetchImpl: vi.fn(ok) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
    });
    uploader.enqueue("ma1", blob());
    expect(confirmed).toEqual([]); // queued, not stored
    await uploader.flush();
    expect(confirmed).toEqual(["ma1"]);
  });

  it("never confirms a word whose upload gave up", async () => {
    const confirmed: string[] = [];
    const uploader = new Uploader({
      sessionId: "s1",
      passcode: "open",
      onChange: () => {},
      onConfirmed: (id) => confirmed.push(id),
      fetchImpl: vi.fn(boom) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
    });
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(confirmed).toEqual([]);
    expect(uploader.getState().byId.ma1).toBe("failed");
  });

  it("confirms once, not once per attempt", async () => {
    let calls = 0;
    const confirmed: string[] = [];
    const uploader = new Uploader({
      sessionId: "s1",
      passcode: "open",
      onChange: () => {},
      onConfirmed: (id) => confirmed.push(id),
      fetchImpl: vi.fn(() => (++calls < 3 ? boom() : ok())) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
    });
    uploader.enqueue("ma1", blob());
    await uploader.flush();
    expect(confirmed).toEqual(["ma1"]);
  });

  it("reports pending work so the UI can say what is outstanding", () => {
    const fetchImpl = vi.fn(
      () => new Promise<Response>(() => {}), // never resolves
    ) as unknown as typeof fetch;
    const { uploader } = make(fetchImpl);
    uploader.enqueue("ma1", blob());
    uploader.enqueue("ma2", blob());
    expect(uploader.getState().pending).toBe(2);
  });
});
