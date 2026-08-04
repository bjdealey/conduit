/**
 * The engine — a flow, executed start to finish.
 *
 * It walks the step tree, evaluates the conditionals, calls one executor per action,
 * and reports what happened as protocol `RunEvent`s. That last part is the contract
 * that matters: the engine produces *exactly* the events a runner posts to
 * `runner/ingest`, so the same log renders whether it came from this process, from a
 * runner in another datacentre, or from the browser tab that authored the flow.
 *
 * What it deliberately does not do: reach the network itself (the transport is
 * injected), read a clock it wasn't given, decide where a run should execute (that is
 * the distributor's job, upstream), or continue past a step that failed.
 */
import {
  CURRENT_SCHEMA_VERSION,
  isBranch,
  type ExecutableStep,
  type RunConclusion,
  type RunEvent,
  type RunEventKind,
  type RunWork,
} from "@conduit/domain";
import { createRunContext, type RunContext, type RunMetric } from "./context.ts";
import { evaluateCondition, explainCondition, ExpressionError } from "./expression.ts";
import { allowAnyUrl, fetchTransport, type HttpTransport, type UrlPolicy } from "./http.ts";
import { executorFor, StepError } from "./nodes/index.ts";

/** How long one HTTP step may take before the transport gives up. */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;

/** The wall-clock budget for a whole run, when the work doesn't state one. Matches
 *  `RUN_DEADLINE_SECONDS` in the runner Edge Function. */
export const DEFAULT_DEADLINE_SECONDS = 900;

/** The host seams and settings an execution needs. Every one has a default, so a
 *  caller that just wants to run a flow can pass nothing. */
export type EngineDeps = {
  http?: HttpTransport;
  /** Milliseconds since the epoch. Injected so tests can drive elapsed time. */
  now?: () => number;
  /** Which URLs this host will call. Defaults to allowing anything. */
  urlPolicy?: UrlPolicy;
  httpTimeoutMs?: number;
  /**
   * Values the *runner* holds — API keys, base URLs, tenant ids — readable as
   * `{{ env.NAME }}`. The control plane never sends these: they are the runner's, and
   * they are masked out of every event this engine emits.
   */
  env?: Record<string, string>;
  /** Called as each event is produced, so a caller can stream rather than wait. */
  onEvent?: (event: RunEvent) => void;
};

/** What one execution amounted to. */
export type RunResult = {
  runId: string;
  /** The two ways a run can end. There is no "partly". */
  state: RunConclusion;
  /** Every event, in order — the same batch a runner posts to `ingest`. */
  events: RunEvent[];
  /** Actions executed, not counting branches. */
  stepsExecuted: number;
  elapsedMs: number;
  /** Present when the run failed: which step, and why. */
  failure?: { stepId?: string; actionId?: string; message: string };
  /** Points the flow recorded with `metrics.record`. */
  metrics: readonly RunMetric[];
};

/** The run ran out of wall clock. Distinct from a step failing: nothing is wrong with
 *  the flow, it is simply not allowed to take this long. */
class DeadlineError extends Error {
  readonly seconds: number;

  constructor(seconds: number) {
    super(`run exceeded its ${seconds}s budget`);
    this.name = "DeadlineError";
    this.seconds = seconds;
  }
}

/** Every action in a tree, for the "N steps" line — branches are not work. */
function countActions(steps: readonly ExecutableStep[]): number {
  return steps.reduce(
    (total, step) => total + (isBranch(step) ? countActions(step.then ?? []) + countActions(step.else ?? []) : 1),
    0,
  );
}

export async function executeRun(work: RunWork, deps: EngineDeps = {}): Promise<RunResult> {
  const now = deps.now ?? (() => Date.now());
  const nodeDeps = {
    http: deps.http ?? fetchTransport(),
    now,
    urlPolicy: deps.urlPolicy ?? allowAnyUrl,
    httpTimeoutMs: deps.httpTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS,
  };
  const ctx: RunContext = createRunContext(
    { runId: work.runId, workflowId: work.workflowId, workflowVersion: work.workflowVersion },
    deps.env ?? {},
  );

  const startedAt = now();
  const deadlineMs = (work.deadlineSeconds > 0 ? work.deadlineSeconds : DEFAULT_DEADLINE_SECONDS) * 1000;
  const events: RunEvent[] = [];
  let sequence = 0;
  let executed = 0;

  /** Emit one event: numbered by the runner's own counter, never by a clock, and
   *  masked before it leaves. */
  const emit = (kind: RunEventKind, message: string, stepId?: string): void => {
    const event: RunEvent = {
      runId: work.runId,
      sequence: ++sequence,
      kind,
      message: ctx.redact(message),
      at: new Date(now()).toISOString(),
      ...(stepId ? { stepId } : {}),
    };
    events.push(event);
    deps.onEvent?.(event);
  };

  const walk = async (steps: readonly ExecutableStep[]): Promise<void> => {
    for (const step of steps) {
      const elapsed = now() - startedAt;
      if (elapsed > deadlineMs) throw new DeadlineError(Math.round(deadlineMs / 1000));

      if (isBranch(step)) {
        // The condition is evaluated once and the log says what it saw. On a headless
        // run this line is the only account of why the flow went the way it did.
        const taken = evaluateCondition(step.condition, ctx.scope());
        const arm = taken ? step.then : step.else;
        emit(
          "log",
          `if ${step.condition} → ${taken ? "then" : "else"} (${explainCondition(step.condition, ctx.scope())})${
            (arm ?? []).length === 0 ? ", empty" : ""
          }`,
          step.id,
        );
        await walk(arm ?? []);
        continue;
      }

      executed++;
      emit("step-started", `${executed}. ${step.actionId}`, step.id);
      const outcome = await executorFor(step.id, step.actionId)({ step, ctx, deps: nodeDeps });
      if (outcome.output !== undefined) ctx.recordStep(step.id, outcome.output);
      emit("step-finished", outcome.message, step.id);
    }
  };

  const total = countActions(work.steps ?? []);
  emit("started", `Run started — ${work.workflowId} v${work.workflowVersion}, ${total} step${total === 1 ? "" : "s"}`);

  const finish = (state: RunConclusion, failure?: RunResult["failure"]): RunResult => ({
    runId: work.runId,
    state,
    events,
    stepsExecuted: executed,
    elapsedMs: now() - startedAt,
    ...(failure ? { failure } : {}),
    metrics: ctx.metrics,
  });

  // A flow written by a newer control plane may contain step shapes this build has
  // never heard of. Refusing it is the only safe answer: executing the half we
  // recognise would silently drop the rest.
  if ((work.schemaVersion ?? 1) > CURRENT_SCHEMA_VERSION) {
    const message = `flow is schema v${work.schemaVersion}; this runner understands v${CURRENT_SCHEMA_VERSION}`;
    emit("failed", `Run failed — ${message}`);
    return finish("failed", { message });
  }

  try {
    await walk(work.steps ?? []);
  } catch (error) {
    const failure =
      error instanceof StepError
        ? { stepId: error.stepId, actionId: error.actionId, message: error.message }
        : error instanceof ExpressionError
          ? { message: `${error.message} in "${error.expression}"` }
          : { message: error instanceof Error ? error.message : String(error) };
    emit("failed", `Run failed — ${failure.message}`, failure.stepId);
    return finish("failed", failure);
  }

  const elapsedMs = now() - startedAt;
  emit("finished", `Run completed — ${executed} step${executed === 1 ? "" : "s"} in ${elapsedMs} ms`);
  return finish("completed");
}
