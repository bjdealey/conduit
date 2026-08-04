/**
 * The polling loop, driven against a fake control plane.
 *
 * What is being pinned here is the shape of a runner's life — register, claim,
 * execute, report, and leave when told — not the execution itself, which the
 * end-to-end test proves against a real server.
 */
import { describe, expect, it } from "vitest";
import type { HeartbeatResponse, RunEvent, RunWork } from "@conduit/domain";
import type { ControlPlane } from "../src/client.ts";
import { ProtocolError } from "../src/client.ts";
import { identityFromEnv } from "../src/config.ts";
import { serve } from "../src/loop.ts";

const config = {
  ...identityFromEnv({ CONDUIT_RUNNER_ID: "rnr_loop", CONDUIT_RUNNER_NAME: "loop-runner" }),
  controlPlaneUrl: "https://control.test/functions/v1/runner",
  token: "runner-token",
  pollSeconds: 0.001,
  env: {},
  allowPrivateHosts: true,
};

const work = (runId: string): RunWork => ({
  runId,
  workflowId: "wf_loop",
  workflowVersion: 1,
  requirements: { auth: "none", ui: "none", platform: "any" },
  schemaVersion: 2,
  steps: [{ kind: "action", id: "stp_1", actionId: "data.set", config: { name: "answer", value: "42" } }],
  deadlineSeconds: 30,
});

/** A control plane that hands out a fixed queue, then nothing. */
function fakeControl(queue: RunWork[], onHeartbeat?: (n: number) => HeartbeatResponse) {
  const ingested: RunEvent[] = [];
  let heartbeats = 0;
  const control: ControlPlane = {
    register: async () => ({ accepted: true, heartbeatSeconds: 0.05, protocolVersion: 2 }),
    heartbeat: async () => onHeartbeat?.(++heartbeats) ?? { drain: false },
    claim: async () => queue.shift() ?? null,
    ingest: async (events) => {
      ingested.push(...events);
      return { accepted: events.length, highWatermark: events.at(-1)?.sequence ?? 0 };
    },
  };
  return { control, ingested, heartbeats: () => heartbeats };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 5)));

describe("serve", () => {
  it("registers, claims, executes, and reports the whole log", async () => {
    const fake = fakeControl([work("run_1")]);
    const summary = await serve(config, { control: fake.control, sleep, log: () => {}, maxIdlePolls: 1 });

    expect(summary).toMatchObject({ runnerId: "rnr_loop", runsCompleted: 1, runsFailed: 0, stopped: "idle" });
    expect(fake.ingested.map((e) => e.kind)).toEqual(["started", "step-started", "step-finished", "finished"]);
    expect(fake.ingested.every((e) => e.runId === "run_1")).toBe(true);
    // Sequences arrive contiguous from 1 — that is what makes ingest idempotent by
    // (run_id, sequence) rather than merely append-only.
    expect(fake.ingested.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
  });

  it("counts a failed run as done, not as a reason to stop", async () => {
    const failing: RunWork = {
      ...work("run_bad"),
      steps: [{ kind: "action", id: "stp_1", actionId: "assert.equals", config: { actual: "1", expected: "2" } }],
    };
    const fake = fakeControl([failing, work("run_good")]);
    const summary = await serve(config, { control: fake.control, sleep, log: () => {}, maxIdlePolls: 1 });

    expect(summary).toMatchObject({ runsCompleted: 1, runsFailed: 1 });
    expect(fake.ingested.filter((e) => e.kind === "failed")).toHaveLength(1);
  });

  it("finishes the run in hand, then leaves, when the pool drains", async () => {
    // Drain from the first beat; the run already claimed still completes.
    const fake = fakeControl([work("run_1"), work("run_2")], () => ({ drain: true }));
    const summary = await serve(config, { control: fake.control, sleep, log: () => {} });

    expect(summary.stopped).toBe("drain");
    expect(summary.runsCompleted).toBeGreaterThanOrEqual(1);
    expect(fake.heartbeats()).toBeGreaterThan(0);
  });

  it("stops after maxRuns — one run per runner is a legitimate deployment", async () => {
    const fake = fakeControl([work("run_1"), work("run_2")]);
    const summary = await serve(config, { control: fake.control, sleep, log: () => {}, maxRuns: 1 });
    expect(summary).toMatchObject({ runsCompleted: 1, stopped: "max-runs" });
  });

  it("keeps polling through a claim failure, but not through a rejected token", async () => {
    let calls = 0;
    const flaky: ControlPlane = {
      register: async () => ({ accepted: true, heartbeatSeconds: 0.05, protocolVersion: 2 }),
      heartbeat: async () => ({ drain: false }),
      claim: async () => {
        calls++;
        if (calls === 1) throw new ProtocolError("claim refused: gateway timeout", 504);
        return null;
      },
      ingest: async (events) => ({ accepted: events.length, highWatermark: 0 }),
    };
    const lines: string[] = [];
    const summary = await serve(config, { control: flaky, sleep, log: (l) => lines.push(l), maxIdlePolls: 1 });
    expect(summary.stopped).toBe("idle");
    expect(lines.some((l) => l.includes("claim failed"))).toBe(true);

    const unauthorised: ControlPlane = {
      ...flaky,
      claim: async () => {
        throw new ProtocolError("claim refused: unauthorised", 401);
      },
    };
    await expect(serve(config, { control: unauthorised, sleep, log: () => {} })).rejects.toThrow(/unauthorised/);
  });

  it("says what it lost when the log cannot be delivered, rather than dropping it quietly", async () => {
    const control: ControlPlane = {
      register: async () => ({ accepted: true, heartbeatSeconds: 0.05, protocolVersion: 2 }),
      heartbeat: async () => ({ drain: false }),
      claim: async () => work("run_1"),
      ingest: async () => {
        throw new ProtocolError("ingest refused: 503");
      },
    };
    const lines: string[] = [];
    const summary = await serve(config, { control, sleep, log: (l) => lines.push(l), maxRuns: 1 });
    expect(summary.runsCompleted).toBe(1);
    expect(lines.some((l) => l.startsWith("ingest failed, dropping"))).toBe(true);
  });
});
