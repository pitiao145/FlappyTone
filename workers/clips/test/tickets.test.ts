import { describe, expect, it } from "vitest";
import { signTicket, verifyTicket, TICKET_TTL_S, type Ticket } from "../src/tickets.ts";

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
