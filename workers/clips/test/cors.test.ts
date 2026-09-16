import { describe, expect, it } from "vitest";
import { corsHeaders, isAllowedOrigin } from "../src/cors.ts";

const ALLOWED =
  "https://flappytone.com,https://www.flappytone.com,https://*.vercel.app,http://localhost:5173,https://localhost:5173";

describe("isAllowedOrigin", () => {
  it("allows an exact listed origin", () => {
    expect(isAllowedOrigin("https://flappytone.com", ALLOWED)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", ALLOWED)).toBe(true);
  });

  it("matches the vercel.app wildcard for a real preview subdomain", () => {
    expect(isAllowedOrigin("https://foo.vercel.app", ALLOWED)).toBe(true);
    expect(isAllowedOrigin("https://flappytone-git-audio-migration-pitiao145.vercel.app", ALLOWED)).toBe(true);
  });

  it("rejects a bare, non-subdomain vercel.app lookalike", () => {
    // No dot boundary before "vercel.app" — must not match the wildcard.
    expect(isAllowedOrigin("https://notvercel.app", ALLOWED)).toBe(false);
    expect(isAllowedOrigin("https://vercel.app", ALLOWED)).toBe(false);
  });

  it("rejects an attacker origin that merely contains the suffix in its path/query", () => {
    expect(isAllowedOrigin("https://evil.com/?x=.vercel.app", ALLOWED)).toBe(false);
    expect(isAllowedOrigin("https://evil.com", ALLOWED)).toBe(false);
  });

  it("rejects an origin that only differs by scheme", () => {
    expect(isAllowedOrigin("http://flappytone.com", ALLOWED)).toBe(false);
    expect(isAllowedOrigin("http://foo.vercel.app", ALLOWED)).toBe(false);
  });

  it("rejects a subdomain trick like evil-vercel.app or foo.evil.com.vercel.app.evil.com", () => {
    expect(isAllowedOrigin("https://evilvercel.app", ALLOWED)).toBe(false);
    expect(isAllowedOrigin("https://foo.vercel.app.evil.com", ALLOWED)).toBe(false);
  });

  it("rejects a null origin", () => {
    expect(isAllowedOrigin(null, ALLOWED)).toBe(false);
  });

  it("rejects a malformed origin without throwing", () => {
    expect(isAllowedOrigin("not-a-url", ALLOWED)).toBe(false);
    expect(isAllowedOrigin("", ALLOWED)).toBe(false);
  });
});

describe("corsHeaders", () => {
  it("returns real headers for an allowed origin, echoing it back", () => {
    const headers = corsHeaders("https://flappytone.com", ALLOWED) as Record<string, string>;
    expect(headers["access-control-allow-origin"]).toBe("https://flappytone.com");
  });

  it("returns {} for a disallowed origin", () => {
    expect(corsHeaders("https://evil.com", ALLOWED)).toEqual({});
  });

  it("returns {} for a null origin", () => {
    expect(corsHeaders(null, ALLOWED)).toEqual({});
  });
});
