import { describe, expect, it } from "vitest";
import { buildReport, formatReport } from "./runReport.ts";
import type {
  AnalyticsEvent,
  SessionRecord,
  TimedEvent,
} from "../analytics/session.ts";

let clock = 0;

function session(
  over: Partial<SessionRecord>,
  events: AnalyticsEvent[] = [],
): SessionRecord {
  clock = 0;
  return {
    v: 1,
    sessionId: `s${Math.random().toString(36).slice(2)}`,
    playerId: "player1",
    startedAt: "2026-08-06T00:00:00.000Z",
    startedAtMs: 0,
    device: "ios/safari",
    calibration: { f0Center: 200, rangeSemitones: 5, rangeDownSemitones: 5, noiseFloor: 0.002 },
    events: events.map((e) => ({ ...e, t: (clock += 1000) }) as TimedEvent),
    ...over,
  };
}

function gate(
  tone: 1 | 2 | 3 | 4,
  outcome: "perfect" | "good" | "ok" | "collision" | "unheard",
  acc = 0.9,
  uttMs = 380,
): AnalyticsEvent {
  return { type: "gate", i: 0, tone, outcome, acc, uttMs, voicedFrac: 0.5, seeded: 0, excMs: 0 };
}

describe("funnel", () => {
  it("counts sessions, not runs", () => {
    // One tester playing six times is one person who got in, not six.
    const s = session({ playerId: "p1" }, [
      { type: "landed" },
      { type: "mic", ok: true },
      { type: "calib_done" },
      { type: "run_start", mode: "game", pace: "normal", corridor: "normal", cue: "pause" },
      gate(1, "perfect"),
      { type: "run_start", mode: "game", pace: "normal", corridor: "normal", cue: "pause" },
      gate(1, "perfect"),
    ]);
    const r = buildReport([s]);
    expect(r.sessions).toBe(1);
    expect(r.runs).toBe(2);
    expect(r.played).toBe(1);
  });

  it("counts a session that reached no gate as not played", () => {
    const r = buildReport([
      session({ calibration: null }, [{ type: "landed" }, { type: "mic", ok: false, reason: "permission-denied" }]),
    ]);
    expect(r.played).toBe(0);
    expect(r.micOk).toBe(0);
    expect(r.micFailed).toEqual({ "permission-denied": 1 });
  });

  it("records where calibration was abandoned", () => {
    const r = buildReport([
      session({ calibration: null }, [{ type: "calib_abandoned", step: "high" }]),
      session({ calibration: null }, [{ type: "calib_abandoned", step: "high" }]),
      session({ calibration: null }, [{ type: "calib_abandoned", step: "talk" }]),
    ]);
    expect(r.abandonedAt).toEqual({ high: 2, talk: 1 });
  });

  it("counts a returning player once, across sessions", () => {
    const r = buildReport([
      session({ playerId: "p1" }, [{ type: "landed" }]),
      session({ playerId: "p1" }, [{ type: "landed" }]),
      session({ playerId: "p2" }, [{ type: "landed" }]),
    ]);
    expect(r.sessions).toBe(3);
    expect(r.players).toBe(2);
    expect(r.returning).toBe(1);
  });
});

describe("per-tone accuracy", () => {
  it("excludes unheard gates from the accuracy mean", () => {
    // The counting rule that matters most. An unheard gate is neutral by
    // PRD §6 — averaging its zero in would make a microphone problem look
    // like a pronunciation problem, which is the wrong thing to go fix.
    const r = buildReport([
      session({}, [gate(3, "perfect", 0.9), gate(3, "unheard", 0), gate(3, "unheard", 0)]),
    ]);
    const t3 = r.perTone[3];
    expect(t3.gates).toBe(3);
    expect(t3.unheard).toBe(2);
    expect(t3.accCount).toBe(1);
    expect(t3.accSum).toBeCloseTo(0.9);
  });

  it("tallies each outcome against the tone that was asked for", () => {
    const r = buildReport([
      session({}, [
        gate(1, "perfect"),
        gate(1, "collision"),
        gate(2, "good"),
        gate(4, "ok"),
      ]),
    ]);
    expect(r.perTone[1].perfect).toBe(1);
    expect(r.perTone[1].collision).toBe(1);
    expect(r.perTone[2].good).toBe(1);
    expect(r.perTone[4].ok).toBe(1);
    expect(r.perTone[3].gates).toBe(0);
  });

  it("averages utterance length over every gate, heard or not", () => {
    // Unlike accuracy: a short utterance is exactly why a gate went unheard,
    // so dropping those would hide the cause.
    const r = buildReport([session({}, [gate(1, "perfect", 0.9, 400), gate(1, "unheard", 0, 100)])]);
    expect(r.perTone[1].uttSum).toBe(500);
  });
});

describe("quit histogram", () => {
  it("counts only quits, bucketed by how far they got", () => {
    const end = (reason: "quit" | "out_of_hearts", gates: number): AnalyticsEvent => ({
      type: "run_end",
      reason,
      gates,
      score: 0,
      bestMult: 1,
      missedEarly: 0,
    });
    const r = buildReport([
      session({}, [end("quit", 3), end("quit", 4), end("quit", 12), end("out_of_hearts", 2)]),
    ]);
    expect(r.quitHistogram).toEqual({ " 1-5": 2, "11-20": 1 });
  });

  it("prints buckets in ascending order, not alphabetical", () => {
    // "  21+" sorts before " 1-5" lexicographically, which reads backwards.
    const end = (gates: number): AnalyticsEvent => ({
      type: "run_end",
      reason: "quit",
      gates,
      score: 0,
      bestMult: 1,
      missedEarly: 0,
    });
    const text = formatReport(buildReport([session({}, [end(2), end(8), end(15), end(30)])]));
    const lines = text.split("\n");
    const start = lines.findIndex((l) => l.startsWith("quit after"));
    const order = lines.slice(start + 1, start + 5).map((l) => l.trim().split(" ")[0]);
    expect(order).toEqual(["1-5", "6-10", "11-20", "21+"]);
  });
});

describe("vocal register", () => {
  it("splits players by f0 so a mapping bug is visible", () => {
    const r = buildReport([
      session({ playerId: "low", calibration: { f0Center: 110, rangeSemitones: 5, rangeDownSemitones: 5, noiseFloor: 0.002 } }, [
        gate(3, "collision", 0.2),
        gate(3, "collision", 0.2),
      ]),
      session({ playerId: "high", calibration: { f0Center: 220, rangeSemitones: 5, rangeDownSemitones: 5, noiseFloor: 0.002 } }, [
        gate(3, "perfect", 0.95),
        gate(3, "perfect", 0.95),
      ]),
    ]);
    const [low, , high] = r.byRegister;
    expect(low.players).toBe(1);
    expect(low.acc).toBeCloseTo(0.2);
    expect(high.players).toBe(1);
    expect(high.acc).toBeCloseTo(0.95);
  });

  it("ignores players who never reached a gate", () => {
    const r = buildReport([session({ playerId: "p1" }, [{ type: "landed" }])]);
    expect(r.byRegister.every((b) => b.players === 0)).toBe(true);
  });
});

describe("formatReport", () => {
  it("renders without throwing on an empty report", () => {
    const text = formatReport(buildReport([]));
    expect(text).toContain("sessions=0");
  });

  it("flags a tone with a high unheard rate", () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      gate(3, i % 2 === 0 ? "unheard" : "perfect"),
    );
    const text = formatReport(buildReport([session({}, events)]));
    expect(text).toContain("T3 unheard 50%");
  });

  it("flags accuracy that varies by vocal register", () => {
    const many = (outcome: "perfect" | "collision", acc: number) =>
      Array.from({ length: 25 }, () => gate(2, outcome, acc));
    const text = formatReport(
      buildReport([
        session({ playerId: "low", calibration: { f0Center: 110, rangeSemitones: 5, rangeDownSemitones: 5, noiseFloor: 0.002 } }, many("collision", 0.2)),
        session({ playerId: "high", calibration: { f0Center: 220, rangeSemitones: 5, rangeDownSemitones: 5, noiseFloor: 0.002 } }, many("perfect", 0.95)),
      ]),
    );
    expect(text).toContain("varies");
    expect(text).toContain("suspect the chao mapping before the players");
  });

  it("says nothing alarming when the numbers are healthy", () => {
    const events = Array.from({ length: 40 }, () => gate(1, "perfect", 0.9));
    const text = formatReport(buildReport([session({}, events)]));
    expect(text).not.toContain("worth a look");
  });
});
