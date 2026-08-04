/**
 * The node registry — what this runner can actually execute.
 *
 * **Stage 1 is the headless, API-first set, and it says so.** A node the registry
 * doesn't hold is not quietly skipped and not silently "succeeded": the run fails at
 * that step, naming the node and what this runner does execute. A browser step
 * reported as fine by a runner with no browser is the single worst outcome available
 * here — the flow would look green and have done nothing.
 *
 * Adding a node type is a function in this folder and one line below. Nothing else in
 * the engine knows what any node does.
 */
import { assertEquals, assertResolves } from "./assert.ts";
import { dataSet } from "./data.ts";
import { httpRequest } from "./http-request.ts";
import { metricsRecord } from "./metrics.ts";
import { StepError, type NodeExecutor } from "./types.ts";

/** Executors by node type id — the same ids the palette and `node_types` use. */
export const EXECUTORS: Readonly<Record<string, NodeExecutor>> = Object.freeze({
  "http.request": httpRequest,
  "assert.equals": assertEquals,
  "assert.resolves": assertResolves,
  "data.set": dataSet,
  "metrics.record": metricsRecord,
});

/** Node type ids this runner executes, in palette order. */
export const EXECUTABLE_ACTIONS: readonly string[] = Object.freeze(Object.keys(EXECUTORS));

/** Whether this runner can execute a node type. The builder reads this to warn before
 *  a run rather than after it. */
export function isExecutable(actionId: string): boolean {
  return actionId in EXECUTORS;
}

/** The executor for a node type, or a failure that explains the gap. */
export function executorFor(stepId: string, actionId: string): NodeExecutor {
  const executor = EXECUTORS[actionId];
  if (!executor) {
    throw new StepError(
      `no executor for "${actionId}" — this runner executes ${EXECUTABLE_ACTIONS.join(", ")}`,
      stepId,
      actionId,
    );
  }
  return executor;
}

export { StepError } from "./types.ts";
export type { NodeDeps, NodeExecutor, StepInput, StepOutcome } from "./types.ts";
