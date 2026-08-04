/**
 * Starting a run — the control plane's side of execution, from the app.
 *
 * Two paths, one code path for everything after them:
 *
 * - **With a backend**, the app *queues* the run and stops. A runner claims it,
 *   executes it, and posts its log back; the app watches `run_events`. That is the
 *   real architecture — Conduit dispatches and observes, runners execute.
 * - **With no backend**, the browser tab is the runner. It executes the flow through
 *   `@conduit/runtime` — the same engine the runner CLI hosts, emitting the same
 *   protocol events — so the prototype demonstrates a real run rather than a rehearsal
 *   of one.
 *
 * The fallback between them is deliberate and *loud*: if the control plane refuses the
 * trigger, the run says so in its own log and then executes locally, rather than
 * failing silently or pretending it went to the pool.
 */
import { fetchTransport, executeRun, isExecutable, type RunResult } from "@conduit/runtime";
import type { ExecutableStep, RunEvent, RunWork } from "@conduit/domain";
import { CURRENT_SCHEMA_VERSION, latestVersion } from "@conduit/domain";
import { flattenSteps } from "../data/actions";
import type { Workflow, WorkflowStep } from "../data/types";
import { enqueueRun } from "./api";
import { isSupabaseConfigured } from "./supabase";

/** How long a run started from the app may take before it gives up. Shorter than the
 *  pool's budget: this one has somebody watching it. */
const APP_DEADLINE_SECONDS = 120;

/**
 * The work a runner would be handed for this workflow.
 *
 * The app's authored step and the wire's executable step are the same shape by
 * construction — that is why the builder can produce something a runner executes
 * without a translation layer that could quietly drop a field.
 */
export function toRunWork(workflow: Workflow, runId: string): RunWork {
  return {
    runId,
    workflowId: workflow.id,
    // The version that exists, never "the latest edit" — a run records what it ran.
    workflowVersion: latestVersion(workflow.versions)?.version ?? 1,
    requirements: workflow.requirements,
    schemaVersion: workflow.schemaVersion || CURRENT_SCHEMA_VERSION,
    steps: workflow.steps as ExecutableStep[],
    deadlineSeconds: APP_DEADLINE_SECONDS,
  };
}

/** Steps in this flow that no runner in the pool can execute yet. Named so the builder
 *  can say so before a run rather than after it. */
export function unexecutableSteps(steps: readonly WorkflowStep[]): string[] {
  const missing: string[] = [];
  for (const step of flattenSteps(steps)) {
    if (!isExecutable(step.actionId) && !missing.includes(step.actionId)) missing.push(step.actionId);
  }
  return missing;
}

/** Where a run is actually happening. */
export type RunHost = "pool" | "browser";

/** What starting a run amounted to. `result` is absent when the pool took it — the
 *  events will arrive from the runner instead. */
export type StartedRun = { host: RunHost; runId: string; result?: RunResult; note?: string };

/** How to start one: the flow, the run's id, and where to send what comes back. */
export type StartOptions = {
  workflow: Workflow;
  runId: string;
  onEvent: (event: RunEvent) => void;
  /** A line from the control plane rather than from a runner — where the run went,
   *  or why it didn't. Kept off the event stream because `sequence` is the runner's. */
  onNote?: (message: string) => void;
};

/**
 * Execute the flow here, in this tab.
 *
 * `fetchTransport()` is the browser's own `fetch`, which means the browser's origin
 * rules apply: a workflow calling an API that sends no CORS headers fails here and
 * succeeds on a runner. That is a property of running in a page, not a limit of the
 * engine, and it is one more reason the pool is where runs belong.
 */
export function executeInBrowser(options: StartOptions): Promise<RunResult> {
  return executeRun(toRunWork(options.workflow, options.runId), {
    http: fetchTransport(),
    onEvent: options.onEvent,
  });
}

export async function startRun(options: StartOptions): Promise<StartedRun> {
  if (!isSupabaseConfigured) {
    return { host: "browser", runId: options.runId, result: await executeInBrowser(options) };
  }

  try {
    const queued = await enqueueRun(toRunWork(options.workflow, options.runId));
    options.onNote?.(`Queued for the pool — ${queued.rationale}`);
    return { host: "pool", runId: queued.runId };
  } catch (error) {
    // A refused trigger is worth reading, not swallowing: today it usually means the
    // browser has no admin identity to present, which is a fact about the auth story
    // rather than a fault in the flow.
    const why = error instanceof Error ? error.message : String(error);
    options.onNote?.(`The pool refused the trigger (${why}) — executing in this tab instead`);
    return { host: "browser", runId: options.runId, result: await executeInBrowser(options), note: why };
  }
}
