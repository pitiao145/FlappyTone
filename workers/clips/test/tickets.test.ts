import { describe, expect, it } from "vitest";
import { checkTicket, ipDrift, signTicket, verifyTicket, TICKET_TTL_S, type Ticket } from "../src/tickets.ts";

const SECRET = "correct-horse-battery-staple";
const IP = "203.0.113.7";

describe("tickets", () => {
  it("signs then verifies, round-tripping the claims", async () => {
    const ticket: Ticket = { tier: "free", sub: "user-123", ip: IP };
    const jwt = await signTicket(ticket, SECRET);
    const verified = await verifyTicket(jwt, SECRET, IP);
    expect(verified).toEqual(ticket);
  });

  it("round-trips a guest ticket with no sub", async () => {
    const ticket: Ticket = { tier: "guest", ip: IP };
    const jwt = await signTicket(ticket, SECRET);
    const verified = await verifyTicket(jwt, SECRET, IP);
    expect(verified).toEqual(ticket);
  });

  it("rejects a ticket signed with a different secret", async () => {
    const jwt = await signTicket({ tier: "pro", ip: IP }, SECRET);
    expect(await verifyTicket(jwt, "some-other-secret", IP)).toBeNull();
  });

  it("rejects an expired ticket", async () => {
    const issuedAt = new Date(Date.now() - (TICKET_TTL_S + 60) * 1000);
    const jwt = await signTicket({ tier: "free", ip: IP }, SECRET, issuedAt);
    expect(await verifyTicket(jwt, SECRET, IP)).toBeNull();
  });

  it("rejects a ticket presented from a different IP", async () => {
    const jwt = await signTicket({ tier: "free", ip: IP }, SECRET);
    expect(await verifyTicket(jwt, SECRET, "198.51.100.1")).toBeNull();
  });

  it("rejects garbage input without throwing", async () => {
    expect(await verifyTicket("not-a-jwt", SECRET, IP)).toBeNull();
  });
});

describe("checkTicket reasons", () => {
  it("reports a missing ticket", async () => {
    expect(await checkTicket(null, SECRET, IP)).toEqual({ ok: false, reason: "missing" });
  });

  it("reports an expired ticket as expired, not invalid", async () => {
    const issuedAt = new Date(Date.now() - (TICKET_TTL_S + 60) * 1000);
    const jwt = await signTicket({ tier: "free", ip: IP }, SECRET, issuedAt);
    expect(await checkTicket(jwt, SECRET, IP)).toEqual({ ok: false, reason: "expired" });
  });

  it("reports a forged ticket as invalid", async () => {
    const jwt = await signTicket({ tier: "pro", ip: IP }, SECRET);
    expect(await checkTicket(jwt, "other", IP)).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports an IP move with how far it moved", async () => {
    const jwt = await signTicket({ tier: "guest", ip: IP }, SECRET);
    expect(await checkTicket(jwt, SECRET, "203.0.113.99")).toEqual({
      ok: false,
      reason: "ip_mismatch",
      drift: "same_prefix",
    });
    expect(await checkTicket(jwt, SECRET, "198.51.100.1")).toMatchObject({ drift: "other_prefix" });
    expect(await checkTicket(jwt, SECRET, "2001:db8::1")).toMatchObject({ drift: "family" });
  });

  it("compares IPv6 by /48", () => {
    expect(ipDrift("2001:db8:aa:1::1", "2001:db8:aa:2::9")).toBe("same_prefix");
    expect(ipDrift("2001:db8:aa::1", "2001:db8:bb::1")).toBe("other_prefix");
  });
});
