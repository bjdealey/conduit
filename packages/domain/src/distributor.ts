/**
 * The distributor — the control plane deciding where work runs.
 *
 * This is the inversion the platform exists for. In the incumbent model a human picks
 * which machine hosts which workload, and that choice sticks. Here a workflow states
 * what it needs, the pool states what it offers, and a pure function matches them per
 * run. Nobody names a machine.
 *
 * It is deliberately a pure function over plain data: no scheduling loop, no queue, no
 * infrastructure. When a real scheduler lands it replaces the *implementation* of the
 * placement decision and keeps this contract, so the routing rules stay testable and
 * stay in one place.
 */
import {
  AVAILABLE_RUNNER_STATES,
  READINESS,
  RUNNER_CLASSES,
  readinessOf,
  requiredRunnerClass,
  type Readiness,
  type Runner,
  type RunnerClass,
  type WorkflowRequirements,
} from "./runner.ts";

/** How capable a class is. A runner may take work below its class, never above it. */
const RANK: Readonly<Record<RunnerClass, number>> = Object.freeze({
  lightweight: 0,
  "windows-service-account": 1,
  "windows-interactive": 2,
});

/**
 * The outcome of a placement decision.
 *
 * `runner` is null when nothing in the pool can take the work — which is a normal,
 * reportable state (the run queues) rather than an error. `rationale` explains the
 * decision in one line either way, because a distributor nobody can second-guess is
 * just a different opaque bottleneck.
 */
export type RunnerAssignment = {
  runner: Runner | null;
  /** The cheapest class that satisfies the requirements. */
  runnerClass: RunnerClass;
  /** One line, fit for a run row: why this class, and why this runner or none. */
  rationale: string;
};

/** Auth models as they read mid-sentence. */
const AUTH_LABEL: Readonly<Record<WorkflowRequirements["auth"], string>> = Object.freeze({
  none: "no credentials",
  "api-key": "API key",
  "oauth-client-credentials": "OAuth client credentials",
  "entra-service-principal": "Entra service principal",
  "managed-identity": "managed identity",
  "windows-integrated": "Windows-integrated auth",
});

/** Why a set of requirements needs the class it needs, in the reader's language. */
export function explainRequirements(requirements: WorkflowRequirements): string {
  if (requirements.ui === "headed") return "Drives a UI — needs an interactive Windows session";
  if (requirements.auth === "windows-integrated") {
    return "Windows-integrated auth — needs a domain identity, not a session";
  }
  if (requirements.platform === "windows") return "Windows-only, no UI — headless Windows is enough";
  return requirements.auth === "none"
    ? "API-only, no credentials — the cheapest class fits"
    : `API-only, ${AUTH_LABEL[requirements.auth]} — the cheapest class fits`;
}

/** Whether one runner can carry these requirements at all. */
export function runnerFits(runner: Runner, requirements: WorkflowRequirements): boolean {
  if (RANK[runner.runnerClass] < RANK[requiredRunnerClass(requirements)]) return false;
  if (requirements.ui === "headed" && !runner.headed) return false;
  if (requirements.platform === "windows" && runner.platform !== "windows") return false;
  return runner.authModels.includes(requirements.auth);
}

/**
 * Place a workflow on a runner.
 *
 * Preference order, cheapest-first: the lowest-ranked class that fits, then a runner
 * already up over one still starting, then the least-used runner so work spreads
 * rather than piling onto whichever machine happens to sort first. Ties break on id,
 * so the same pool and the same workflow always produce the same answer — a placement
 * you cannot reproduce is a placement you cannot debug.
 */
export function pickRunner(requirements: WorkflowRequirements, pool: readonly Runner[]): RunnerAssignment {
  const runnerClass = requiredRunnerClass(requirements);
  const why = explainRequirements(requirements);

  const candidates = pool
    .filter((r) => AVAILABLE_RUNNER_STATES.includes(r.state) && runnerFits(r, requirements))
    .sort(
      (a, b) =>
        RANK[a.runnerClass] - RANK[b.runnerClass] ||
        Number(a.state === "Starting") - Number(b.state === "Starting") ||
        a.runsCompleted - b.runsCompleted ||
        a.id.localeCompare(b.id),
    );

  const runner = candidates[0] ?? null;
  if (!runner) return { runner: null, runnerClass, rationale: `${why} — no runner free, queued` };
  return { runner, runnerClass, rationale: why };
}

/* -------------------------------------------------------------------- rollups */

/** Runner counts per class, in pool order. Empty classes are kept, because a class
 *  with nothing in it is information (the pool scaled to zero), not an absence. */
export function poolByClass(pool: readonly Runner[]): { runnerClass: RunnerClass; runners: Runner[] }[] {
  return RUNNER_CLASSES.map((runnerClass) => ({
    runnerClass,
    runners: pool.filter((r) => r.runnerClass === runnerClass),
  }));
}

/**
 * The workload mix by readiness band — the §2 arithmetic, computed rather than
 * asserted. Counts are returned for every band so a zero reads as a zero.
 */
export function readinessMix(
  workloads: readonly { requirements: WorkflowRequirements }[],
): { readiness: Readiness; count: number; share: number }[] {
  return READINESS.map((readiness) => {
    const count = workloads.filter((w) => readinessOf(w.requirements) === readiness).length;
    return { readiness, count, share: workloads.length === 0 ? 0 : count / workloads.length };
  });
}
