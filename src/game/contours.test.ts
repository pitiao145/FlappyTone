import { expect, test } from "vitest";
import { ContourRecorder } from "./contours.ts";

/** Feeds frames every 20ms over [from, to). */
function feed(
  r: ContourRecorder,
  from: number,
  to: number,
  voiced: boolean,
  chao = 3,
): void {
  for (let t = from; t < to; t += 20) r.push(chao, voiced, t);
}

test("a voiced run becomes a live contour rebased to its own start", () => {
  const r = new ContourRecorder();
  feed(r, 1000, 1400, true, 4);
  const live = r.live();
  expect(live).not.toBeNull();
  expect(live!.startedAtMs).toBe(1000);
  expect(live!.points[0].tMs).toBe(0);
  expect(live!.points.at(-1)!.tMs).toBe(380);
  expect(live!.points.every((p) => p.chao === 4)).toBe(true);
});

test("silence longer than the merge gap ends the utterance", () => {
  const r = new ContourRecorder({ mergeGapMs: 120, minMs: 180 });
  feed(r, 0, 400, true);
  feed(r, 400, 700, false);
  expect(r.live()).toBeNull();
  expect(r.finished()).toHaveLength(1);
  expect(r.finished()[0].endedAtMs).toBe(380);
});

test("a short blip is discarded rather than kept as an utterance", () => {
  const r = new ContourRecorder({ mergeGapMs: 120, minMs: 180 });
  feed(r, 0, 100, true);
  feed(r, 100, 400, false);
  expect(r.finished()).toHaveLength(0);
  expect(r.live()).toBeNull();
});

test("a gap shorter than the merge gap does not split a T3 creak dropout", () => {
  const r = new ContourRecorder({ mergeGapMs: 120, minMs: 180 });
  feed(r, 0, 200, true);
  feed(r, 200, 280, false); // 80ms of creak
  feed(r, 280, 500, true);
  feed(r, 500, 800, false);
  expect(r.finished()).toHaveLength(1);
  expect(r.finished()[0].points.at(-1)!.tMs).toBeGreaterThan(400);
});

test("only maxKept contours are retained, newest last", () => {
  const r = new ContourRecorder({ maxKept: 2, mergeGapMs: 120, minMs: 100 });
  for (let i = 0; i < 4; i++) {
    feed(r, i * 1000, i * 1000 + 300, true, i + 1);
    feed(r, i * 1000 + 300, i * 1000 + 800, false);
  }
  const kept = r.finished();
  expect(kept).toHaveLength(2);
  expect(kept.map((c) => c.points[0].chao)).toEqual([3, 4]);
});

test("clear forgets everything, in progress included", () => {
  const r = new ContourRecorder({ mergeGapMs: 120, minMs: 100 });
  feed(r, 0, 300, true);
  feed(r, 300, 700, false);
  feed(r, 700, 900, true);
  r.clear();
  expect(r.finished()).toHaveLength(0);
  expect(r.live()).toBeNull();
});
