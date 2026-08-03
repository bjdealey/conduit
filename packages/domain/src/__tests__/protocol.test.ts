import { describe, expect, it } from "vitest";
import {
  MAX_EVENTS_PER_BATCH,
  MISSED_HEARTBEATS_BEFORE_OFFLINE,
  PROTOCOL_VERSION,
  RUN_EVENT_KINDS,
  isStale,
  isSupportedProtocol,
  isTerminal,
  orderEvents,
  type RunEvent,
} from "../protocol.ts";

const evt = (sequence: number, patch: Partial<RunEvent> = {}): RunEvent => ({
  runId: "run_1",
  sequence,
  kind: "log",
  message: `event ${sequence}`,
  at: "just now",
  ...patch,
});

describe("protocol versioning", () => {
  it("accepts the version this build speaks", () => {
    expect(isSupportedProtocol(PROTOCOL_VERSION)).toBe(true);
  });

  it("refuses a version it doesn't know, in both directions", () => {
    // A runner in the field is not redeployed in lockstep, so both an old and a
    // too-new runner must be refused explicitly rather than half-served.
    expect(isSupportedProtocol(0)).toBe(false);
    expect(isSupportedProtocol(PROTOCOL_VERSION + 1)).toBe(false);
  });
});

describe("heartbeat liveness", () => {
  it("tolerates a blip but not a silence", () => {
    // One missed beat is a network blip; evicting on it would flicker the pool and
    // re-place work that is actually still running.
    expect(isStale(15, 10)).toBe(false);
    expect(isStale(29, 10)).toBe(false);
    expect(isStale(31, 10)).toBe(true);
  });

  it("scales with the interval it was given", () => {
    expect(isStale(100, 60)).toBe(false);
    expect(isStale(200, 60)).toBe(true);
    expect(MISSED_HEARTBEATS_BEFORE_OFFLINE).toBeGreaterThan(1);
  });

  it("treats a runner that never beat as live until the window passes", () => {
    expect(isStale(0, 10)).toBe(false);
  });
});

describe("run events", () => {
  it("names exactly the terminal kinds", () => {
    const terminal = RUN_EVENT_KINDS.filter(isTerminal);
    expect([...terminal].sort()).toEqual(["failed", "finished"]);
  });

  it("orders by sequence, not by arrival", () => {
    // Clocks on ephemeral compute aren't to be trusted for ordering, so the runner's
    // own counter is the sort key.
    const out = orderEvents([evt(3), evt(1), evt(2)]);
    expect(out.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it("de-duplicates a redelivered event", () => {
    // At-least-once delivery means the same event legitimately arrives twice; a run
    // log that repeats itself is a run log nobody trusts.
    const out = orderEvents([evt(1), evt(2), evt(1)]);
    expect(out.map((e) => e.sequence)).toEqual([1, 2]);
  });

  it("keeps the later copy when an event is redelivered with a correction", () => {
    const out = orderEvents([evt(1, { message: "first" }), evt(1, { message: "corrected" })]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toBe("corrected");
  });

  it("keeps runs apart when events from several arrive together", () => {
    const out = orderEvents([evt(2, { runId: "run_b" }), evt(1), evt(1, { runId: "run_b" }), evt(2)]);
    expect(out.map((e) => `${e.runId}:${e.sequence}`)).toEqual(["run_1:1", "run_1:2", "run_b:1", "run_b:2"]);
  });

  it("handles an empty batch", () => {
    expect(orderEvents([])).toEqual([]);
  });

  it("bounds a batch, so one chatty workflow can't flood ingest", () => {
    expect(MAX_EVENTS_PER_BATCH).toBeGreaterThan(0);
    expect(MAX_EVENTS_PER_BATCH).toBeLessThanOrEqual(1000);
  });
});
