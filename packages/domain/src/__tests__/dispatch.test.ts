import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, claimableBy, exhausted, nextClaim, unservable, type QueuedRun } from "../dispatch.ts";
import { MAX_PER_CLASS, WARM_FLOOR, isNoop, scalePlan, shouldDrain } from "../autoscale.ts";
import { DEFAULT_REQUIREMENTS, type Runner, type RunnerClass, type WorkflowRequirements } from "../runner.ts";

const runner = (id: string, runnerClass: RunnerClass, patch: Partial<Runner> = {}): Runner => ({
  id,
  name: id,
  runnerClass,
  state: "Idle",
  platform: runnerClass === "lightweight" ? "linux" : "windows",
  authModels:
    runnerClass === "lightweight"
      ? ["none", "api-key", "oauth-client-credentials", "entra-service-principal", "managed-identity"]
      : ["none", "api-key", "oauth-client-credentials", "entra-service-principal", "managed-identity", "windows-integrated"],
  ephemeral: runnerClass !== "windows-interactive",
  headed: runnerClass === "windows-interactive",
  image: "conduit/runner:1.4.0",
  uptime: "2 minutes",
  runsCompleted: 0,
  ...patch,
});

const queued = (runId: string, patch: Partial<QueuedRun> = {}): QueuedRun => ({
  runId,
  workflowId: "wf_1",
  workflowVersion: 1,
  requirements: { ...DEFAULT_REQUIREMENTS },
  queuedAt: "2026-08-03T09:00:00Z",
  attempts: 0,
  ...patch,
});

const req = (patch: Partial<WorkflowRequirements> = {}): WorkflowRequirements => ({ ...DEFAULT_REQUIREMENTS, ...patch });

describe("what a runner may claim", () => {
  it("offers nothing to a runner that is already busy", () => {
    // A busy runner asking for work is a bug in the runner, not an invitation.
    expect(claimableBy(runner("l1", "lightweight", { state: "Busy" }), [queued("r1")])).toEqual([]);
    expect(claimableBy(runner("l1", "lightweight", { state: "Draining" }), [queued("r1")])).toEqual([]);
    expect(claimableBy(runner("l1", "lightweight", { state: "Offline" }), [queued("r1")])).toEqual([]);
  });

  it("uses the same fit rule the distributor places with", () => {
    // The two directions cannot disagree, because they share the predicate.
    const lightweight = runner("l1", "lightweight");
    expect(claimableBy(lightweight, [queued("r1", { requirements: req({ ui: "headed" }) })])).toEqual([]);
    expect(claimableBy(lightweight, [queued("r1", { requirements: req({ auth: "api-key" }) })])).toHaveLength(1);
  });

  it("lets a heavier runner take lighter work", () => {
    expect(claimableBy(runner("i1", "windows-interactive"), [queued("r1")])).toHaveLength(1);
  });
});

describe("which run is next", () => {
  it("takes the oldest first, so nothing starves", () => {
    const next = nextClaim(runner("l1", "lightweight"), [
      queued("r2", { queuedAt: "2026-08-03T10:00:00Z" }),
      queued("r1", { queuedAt: "2026-08-03T09:00:00Z" }),
    ]);
    expect(next?.runId).toBe("r1");
  });

  it("is deterministic on a tie, so two runners asking at once get a stable order", () => {
    const tie = [queued("r2"), queued("r1")];
    expect(nextClaim(runner("l1", "lightweight"), tie)?.runId).toBe("r1");
    expect(nextClaim(runner("l1", "lightweight"), tie)?.runId).toBe("r1");
  });

  it("returns null when nothing fits, rather than handing over the wrong run", () => {
    expect(nextClaim(runner("l1", "lightweight"), [queued("r1", { requirements: req({ ui: "headed" }) })])).toBeNull();
    expect(nextClaim(runner("l1", "lightweight"), [])).toBeNull();
  });

  it("stops handing out a run that has failed too many times", () => {
    const stuck = [queued("r1", { attempts: MAX_ATTEMPTS })];
    expect(nextClaim(runner("l1", "lightweight"), stuck)).toBeNull();
    // Surfaced rather than retried forever — an infinite retry turns a diagnosable
    // fault into mysterious queue growth.
    expect(exhausted(stuck)).toHaveLength(1);
  });
});

describe("work nothing can carry", () => {
  it("separates 'nothing free' from 'no runner of that class exists'", () => {
    const headed = queued("r1", { requirements: req({ ui: "headed" }) });
    expect(unservable([headed], [runner("l1", "lightweight")])).toHaveLength(1);
    // With a capable runner present — even a busy one — it is waiting, not stuck.
    expect(unservable([headed], [runner("i1", "windows-interactive", { state: "Busy" })])).toEqual([]);
  });
});

describe("autoscaling", () => {
  it("keeps a lightweight runner warm when nothing is queued", () => {
    const plan = scalePlan([], []);
    const lightweight = plan.start.find((s) => s.runnerClass === "lightweight");
    expect(lightweight?.count).toBe(WARM_FLOOR.lightweight);
    // The expensive Windows classes are not kept warm — their work is scheduled.
    expect(plan.start.find((s) => s.runnerClass === "windows-interactive")).toBeUndefined();
  });

  it("starts capacity for queued work, per the class that work needs", () => {
    const plan = scalePlan(
      [runner("l1", "lightweight", { state: "Busy" })],
      [queued("r1", { requirements: req({ ui: "headed" }) }), queued("r2", { requirements: req({ ui: "headed" }) })],
    );
    expect(plan.start.find((s) => s.runnerClass === "windows-interactive")?.count).toBe(2);
    // A headed workflow never causes a lightweight runner to be started for it.
    expect(plan.start.find((s) => s.runnerClass === "lightweight")?.count).toBe(WARM_FLOOR.lightweight);
  });

  it("never drains a busy runner", () => {
    // Killing a runner mid-execution to save a few pence is how an autoscaler earns
    // a reputation for causing incidents.
    const pool = [runner("l1", "lightweight", { state: "Busy" }), runner("l2", "lightweight", { state: "Busy" })];
    expect(scalePlan(pool, []).drain).toEqual([]);
  });

  it("drains idle capacity above the warm floor", () => {
    const pool = [runner("l1", "lightweight"), runner("l2", "lightweight"), runner("l3", "lightweight")];
    const plan = scalePlan(pool, []);
    expect(plan.drain).toHaveLength(pool.length - WARM_FLOOR.lightweight);
    expect(shouldDrain(plan, plan.drain[0].runnerId)).toBe(true);
  });

  it("retires the longest-serving runner first", () => {
    const pool = [
      runner("l1", "lightweight", { runsCompleted: 3 }),
      runner("l2", "lightweight", { runsCompleted: 99 }),
    ];
    const plan = scalePlan(pool, []);
    expect(plan.drain.map((d) => d.runnerId)).toEqual(["l2"]);
  });

  it("does not drain while there is queued work for that class", () => {
    const pool = [runner("l1", "lightweight"), runner("l2", "lightweight")];
    expect(scalePlan(pool, [queued("r1"), queued("r2")]).drain).toEqual([]);
  });

  it("reports hitting the ceiling instead of absorbing it silently", () => {
    const many = Array.from({ length: MAX_PER_CLASS.lightweight + 5 }, (_, i) => queued(`r${i}`));
    const plan = scalePlan([], many);
    const capped = plan.capped.find((c) => c.runnerClass === "lightweight");
    expect(capped?.queued).toBe(many.length);
    expect(capped?.ceiling).toBe(MAX_PER_CLASS.lightweight);
    // It still starts everything it is allowed to.
    expect(plan.start.find((s) => s.runnerClass === "lightweight")?.count).toBe(MAX_PER_CLASS.lightweight);
  });

  it("is a no-op on a pool that already matches demand", () => {
    const pool = [runner("l1", "lightweight")];
    expect(isNoop(scalePlan(pool, []))).toBe(true);
  });

  it("gives the same plan for the same inputs", () => {
    const pool = [runner("l2", "lightweight"), runner("l1", "lightweight")];
    expect(scalePlan(pool, [])).toEqual(scalePlan(pool, []));
  });
});
