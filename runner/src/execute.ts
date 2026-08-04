/**
 * Executing one piece of work — the part both modes share.
 *
 * `serve` gets its work from the control plane and `run` reads it from a file, but
 * what happens next is identical: check the work is ours to carry, hand it to the
 * engine, report events. Same engine, same events, same result shape.
 */
import { explainRequirements, runnerFits, type RunEvent, type Runner, type RunWork } from "@conduit/domain";
import { allowAnyUrl, blockPrivateNetworks, executeRun, type RunResult } from "@conduit/runtime";
import type { RunnerIdentity } from "./config.ts";

/** How this process looks to the placement rules. */
export function asRunner(identity: RunnerIdentity, runsCompleted = 0): Runner {
  return {
    id: identity.runnerId,
    name: identity.name,
    runnerClass: identity.runnerClass,
    state: "Idle",
    platform: identity.platform,
    authModels: identity.authModels,
    ephemeral: identity.ephemeral,
    headed: identity.headed,
    image: identity.image,
    uptime: "",
    runsCompleted,
  };
}

/**
 * Why this runner cannot carry this work, or null.
 *
 * The requirements ride along with the work precisely so a runner can check them: the
 * claim should never hand out work that doesn't fit, so a mismatch here means the
 * control plane and the runner disagree about what this runner is — and finding that
 * out before the flow starts is the difference between one clear failure and a run
 * that dies obscurely three steps in.
 */
export function mismatch(identity: RunnerIdentity, work: RunWork): string | null {
  if (!work.requirements) return null;
  if (runnerFits(asRunner(identity), work.requirements)) return null;
  return `this runner cannot carry ${work.runId}: ${explainRequirements(work.requirements)}`;
}

/** How to execute: what the workflow may read, and what it may reach. */
export type ExecuteOptions = {
  env: Record<string, string>;
  allowPrivateHosts: boolean;
  onEvent?: (event: RunEvent) => void;
};

/** A run that never started, reported in the same shape as one that did. */
function refused(work: RunWork, message: string, onEvent?: (event: RunEvent) => void): RunResult {
  const at = new Date().toISOString();
  const events: RunEvent[] = [
    { runId: work.runId, sequence: 1, kind: "started", message: `Run started — ${work.workflowId}`, at },
    { runId: work.runId, sequence: 2, kind: "failed", message: `Run failed — ${message}`, at },
  ];
  for (const event of events) onEvent?.(event);
  return { runId: work.runId, state: "failed", events, stepsExecuted: 0, elapsedMs: 0, failure: { message }, metrics: [] };
}

export async function runWork(work: RunWork, identity: RunnerIdentity, options: ExecuteOptions): Promise<RunResult> {
  const refusal = mismatch(identity, work);
  if (refusal) return refused(work, refusal, options.onEvent);

  return executeRun(work, {
    env: options.env,
    // A workflow authored by someone else runs here. Unless this runner exists to call
    // an internal API — and says so — it does not get to reach inside the network it
    // happens to be sitting in.
    urlPolicy: options.allowPrivateHosts ? allowAnyUrl : blockPrivateNetworks,
    onEvent: options.onEvent,
  });
}
