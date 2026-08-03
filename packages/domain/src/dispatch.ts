/**
 * Dispatch — handing a queued run to a runner, exactly once.
 *
 * `pickRunner` answers "where should this go" for one workflow against a pool. This
 * answers the mirror question a runner asks: "given what I am, which queued run
 * should I take?" Same rules, opposite direction.
 *
 * The hard part is not the matching, it is the *once*. Two runners polling a second
 * apart will both see the same queued run, and if both take it the workflow executes
 * twice — which for a payment reconciliation or an email dispatch is not a degraded
 * experience but a real-world incident. The database does the excluding
 * (`for update skip locked`); this module states the selection rule the SQL
 * implements, so the ordering is written down and testable rather than living only
 * inside a query.
 */
import { runnerFits } from "./distributor.ts";
import { AVAILABLE_RUNNER_STATES, type Runner, type WorkflowRequirements } from "./runner.ts";

/** A run waiting for a runner. */
export type QueuedRun = {
  runId: string;
  workflowId: string;
  /** The exact version to execute — never "latest", which may carry no approval. */
  workflowVersion: number;
  requirements: WorkflowRequirements;
  /** Queue order. Older runs go first. */
  queuedAt: string;
  /** How many times this run has been handed out and come back unfinished. */
  attempts: number;
};

/** How many times a run may be retried before it stops being handed out. */
export const MAX_ATTEMPTS = 3;

/**
 * The queued runs a given runner could legitimately execute.
 *
 * Filtered on the same `runnerFits` the distributor uses, so a run can never be
 * claimed by a runner the placement rules would not have chosen — the two directions
 * cannot disagree, because they share the predicate.
 */
export function claimableBy(runner: Runner, queue: readonly QueuedRun[]): QueuedRun[] {
  // A busy or draining runner asking for work is a bug in the runner, not an
  // invitation to give it more. Same availability set the distributor places against.
  if (!AVAILABLE_RUNNER_STATES.includes(runner.state)) return [];
  return queue.filter((r) => r.attempts < MAX_ATTEMPTS && runnerFits(runner, r.requirements));
}

/**
 * Which run this runner should take next, or null.
 *
 * Oldest first, because a queue that isn't FIFO starves whatever is unlucky. Ties
 * break on run id so the answer is reproducible: two runners asking in the same
 * instant get a deterministic order, and the database's row lock decides which of
 * them actually gets it.
 */
export function nextClaim(runner: Runner, queue: readonly QueuedRun[]): QueuedRun | null {
  const eligible = claimableBy(runner, queue).sort(
    (a, b) => a.queuedAt.localeCompare(b.queuedAt) || a.runId.localeCompare(b.runId),
  );
  return eligible[0] ?? null;
}

/**
 * Runs that have been handed out too many times.
 *
 * Surfaced rather than retried forever: a run that three runners have picked up and
 * failed to finish is telling you something about the workflow, and hiding it behind
 * an infinite retry turns a diagnosable fault into mysterious queue growth.
 */
export function exhausted(queue: readonly QueuedRun[]): QueuedRun[] {
  return queue.filter((r) => r.attempts >= MAX_ATTEMPTS);
}

/**
 * Queued runs nothing in the current pool can carry.
 *
 * Distinct from "nothing is free right now": these need a *class* the pool does not
 * have. That is a capacity gap the autoscaler should close, and while it is open the
 * runs are stuck rather than merely waiting — worth saying out loud on Home.
 */
export function unservable(queue: readonly QueuedRun[], pool: readonly Runner[]): QueuedRun[] {
  return queue.filter((r) => !pool.some((runner) => runnerFits(runner, r.requirements)));
}
