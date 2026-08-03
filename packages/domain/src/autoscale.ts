/**
 * Pool autoscaling — deciding what to start and what to wind down.
 *
 * This is the half of the elasticity story the pool view can only *show*. "Fewer,
 * cheaper runners that shut down when idle instead of sitting always-on" is a claim
 * about a policy, and until the policy exists the pool is just a list that happens to
 * change.
 *
 * A pure function over the current pool and the current queue, deliberately: capacity
 * decisions are the ones people most want to argue with, and an autoscaler nobody can
 * reason about gets switched off. Everything here is inspectable and reproducible —
 * same pool and same queue, same plan.
 */
import { requiredRunnerClass, RUNNER_CLASSES, type Runner, type RunnerClass } from "./runner.ts";
import type { QueuedRun } from "./dispatch.ts";

/**
 * How many runners of a class to keep up when nothing is queued.
 *
 * Non-zero for lightweight because a cold start is dead time on the critical path of
 * every trigger, and one warm runner is cheap. Zero for the Windows classes because
 * they are not cheap, and their work is scheduled rather than interactive — a minute
 * of start-up on a nightly batch costs nothing.
 */
export const WARM_FLOOR: Readonly<Record<RunnerClass, number>> = Object.freeze({
  lightweight: 1,
  "windows-service-account": 0,
  "windows-interactive": 0,
});

/**
 * The most runners of one class the pool may hold.
 *
 * A ceiling exists so a runaway trigger storm cannot spend without bound. Hitting it
 * is reported rather than silently absorbed — a queue that stays long against a
 * capped pool is a capacity decision someone should make, not a fact to hide.
 */
export const MAX_PER_CLASS: Readonly<Record<RunnerClass, number>> = Object.freeze({
  lightweight: 12,
  "windows-service-account": 4,
  "windows-interactive": 2,
});

/** What the autoscaler wants to happen. */
export type ScalePlan = {
  /** How many runners to start, per class. Only classes with a non-zero count appear. */
  start: { runnerClass: RunnerClass; count: number; reason: string }[];
  /** Runners to wind down: they finish their current work, then exit. */
  drain: { runnerId: string; reason: string }[];
  /** Classes where demand exceeds the ceiling — reported, never silently absorbed. */
  capped: { runnerClass: RunnerClass; queued: number; ceiling: number }[];
};

/** Runners of a class that count as capacity: up, or on the way up. */
function liveOfClass(pool: readonly Runner[], runnerClass: RunnerClass): Runner[] {
  return pool.filter((r) => r.runnerClass === runnerClass && r.state !== "Offline" && r.state !== "Draining");
}

/**
 * Decide what the pool should do.
 *
 * Demand per class is the queued work that *needs* that class — computed from each
 * run's requirements, not from a label — so a headed workflow never causes a
 * lightweight runner to be started for it.
 *
 * The two directions are deliberately asymmetric. Scaling up counts only idle
 * capacity, so a busy pool grows even though its runners are healthy. Scaling down
 * only ever drains an idle runner above the warm floor, and never one that is busy:
 * a runner mid-execution has a workflow in flight, and killing it to save a few pence
 * is how an autoscaler earns a reputation for causing incidents.
 */
export function scalePlan(pool: readonly Runner[], queue: readonly QueuedRun[]): ScalePlan {
  const plan: ScalePlan = { start: [], drain: [], capped: [] };

  for (const runnerClass of RUNNER_CLASSES) {
    const demand = queue.filter((r) => requiredRunnerClass(r.requirements) === runnerClass).length;
    const live = liveOfClass(pool, runnerClass);
    const idle = live.filter((r) => r.state === "Idle" || r.state === "Starting");
    const floor = WARM_FLOOR[runnerClass];
    const ceiling = MAX_PER_CLASS[runnerClass];

    // Want enough to cover queued work, and never fewer than the warm floor.
    const want = Math.max(demand, floor);
    const shortfall = want - idle.length;
    const room = ceiling - live.length;

    if (shortfall > 0 && room > 0) {
      const count = Math.min(shortfall, room);
      plan.start.push({
        runnerClass,
        count,
        reason:
          demand > idle.length
            ? `${demand} queued, ${idle.length} free`
            : `keeping ${floor} warm so a trigger doesn't wait on a cold start`,
      });
    }

    if (shortfall > room && demand > 0) {
      plan.capped.push({ runnerClass, queued: demand, ceiling });
    }

    // Wind down spare idle capacity above the floor. Busy and starting runners are
    // never touched — one is doing work, the other has already been paid for.
    const spare = idle.filter((r) => r.state === "Idle").length - Math.max(demand, floor);
    if (spare > 0) {
      const drainable = live
        .filter((r) => r.state === "Idle")
        // Retire the longest-serving first: an ephemeral runner's whole promise is
        // that it doesn't accumulate anything, and the oldest has had most chance to.
        .sort((a, b) => b.runsCompleted - a.runsCompleted || a.id.localeCompare(b.id))
        .slice(0, spare);
      for (const r of drainable) {
        plan.drain.push({ runnerId: r.id, reason: `idle, ${idle.length} free against ${demand} queued` });
      }
    }
  }

  return plan;
}

/** Whether the plan says this runner should wind down — what a heartbeat replies. */
export function shouldDrain(plan: ScalePlan, runnerId: string): boolean {
  return plan.drain.some((d) => d.runnerId === runnerId);
}

/** Whether the plan changes anything, so a quiet pool logs nothing. */
export function isNoop(plan: ScalePlan): boolean {
  return plan.start.length === 0 && plan.drain.length === 0;
}
