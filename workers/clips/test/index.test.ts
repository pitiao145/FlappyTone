/**
 * Integration-style coverage of the exported `fetch` itself: the router and
 * the CORS wrapper, which unit tests of the route handlers never exercise.
 */
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";
import { PASSCODE_HEADER } from "../src/passcode.ts";
import { TEST_IP, fakeCtx, fakeEnv } from "./helpers.ts";

const ORIGIN = "https://flappytone.com";

const call = (path: string, init: RequestInit = {}) =>
  worker.fetch(
    new Request(`https://clips.flappytone.com${path}`, {
      ...init,
      headers: { origin: ORIGIN, "CF-Connecting-IP": TEST_IP, ...(init.headers ?? {}) },
    }),
    fakeEnv(),
    fakeCtx(),
  );

describe("worker fetch", () => {
  it("answers an OPTIONS preflight with 204 and CORS headers", async () => {
    const res = await call("/token", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("404s an unknown path, still CORS-readable", async () => {
    const res = await call("/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("routes POST /token and returns a guest ticket", async () => {
    const res = await call("/token", { method: "POST" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { tier: string }).tier).toBe("guest");
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("does not route GET /token", async () => {
    expect((await call("/token")).status).toBe(404);
  });

  it("401s GET /clip/:id without a ticket (route is wired)", async () => {
    expect((await call("/clip/ba1?v=1")).status).toBe(401);
  });

  it("gates /auth on the passcode, on GET and POST", async () => {
    expect((await call("/auth")).status).toBe(401);
    expect((await call("/auth", { method: "POST" })).status).toBe(401);
    const ok = await call("/auth", { headers: { [PASSCODE_HEADER]: "hunter2" } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("omits CORS headers for a disallowed origin", async () => {
    const res = await worker.fetch(
      new Request("https://clips.flappytone.com/nope", { headers: { origin: "https://evil.com" } }),
      fakeEnv(),
      fakeCtx(),
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
