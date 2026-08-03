/**
 * The runner pool — the execution plane, modelled from the control plane's side.
 *
 * Conduit does not execute anything. It decides *where* work runs and observes what
 * comes back, which is the whole of the vision's second and third bets: runners are
 * stateless and ephemeral (so nothing drifts), and the platform places work on them
 * (so no human decides which machine gets which workload).
 *
 * A `Runner` is therefore a registration, not a configured machine: it announces what
 * it can do, heartbeats while it lives, and disappears. Nothing here is hand-assigned.
 */

/**
 * How a workflow proves who it is to the systems it touches.
 *
 * The split that matters is interactive vs not: `windows-integrated` inherits the
 * identity of a logged-in Windows session and is the only model that cannot run on a
 * lightweight runner. Everything else obtains a token without a human session, which
 * is what makes a workflow eligible for cheap, ephemeral compute.
 */
export const AUTH_MODELS = [
  "none",
  "api-key",
  "oauth-client-credentials",
  "entra-service-principal",
  "managed-identity",
  "windows-integrated",
] as const;
export type AuthModel = (typeof AUTH_MODELS)[number];

/** Auth models obtainable without an interactive session — the API-eligible set. */
export const HEADLESS_AUTH_MODELS: readonly AuthModel[] = Object.freeze([
  "none",
  "api-key",
  "oauth-client-credentials",
  "entra-service-principal",
  "managed-identity",
]);

/** Whether a workflow drives a user interface, or only speaks to APIs. */
export const UI_DEPENDENCIES = ["none", "headed"] as const;
export type UiDependency = (typeof UI_DEPENDENCIES)[number];

/** The OS a workflow needs, when it needs a particular one. */
export const TARGET_PLATFORMS = ["any", "windows"] as const;
export type TargetPlatform = (typeof TARGET_PLATFORMS)[number];

/**
 * What a workflow needs from a runner. Derived from the workflow's steps where the
 * node types declare it, and overridable per workflow.
 *
 * This is the only thing the distributor routes on — deliberately, so that adding a
 * runner class or a node type never means teaching the distributor about either.
 */
export type WorkflowRequirements = {
  auth: AuthModel;
  ui: UiDependency;
  platform: TargetPlatform;
};

/** The requirements of a workflow that asks for nothing in particular. */
export const DEFAULT_REQUIREMENTS: WorkflowRequirements = Object.freeze({
  auth: "none",
  ui: "none",
  platform: "any",
});

/**
 * The three runner classes the vision's hybrid pool is built from, in the order they
 * are preferred: cheapest and most elastic first.
 *
 * - `lightweight` — ephemeral compute for API-first work using modern auth. Scales
 *   elastically, holds no state, costs the least.
 * - `windows-service-account` — headless Windows running as a domain service account
 *   with Kerberos identity. Carries the Windows-integrated-auth workload *without* an
 *   interactive session, which is what lets that ~20% move before its apps reach Entra.
 * - `windows-interactive` — a logged-in Windows session for genuinely UI-bound work.
 *   The heavy class, and the one whose share shrinks as the others absorb workloads.
 */
export const RUNNER_CLASSES = ["lightweight", "windows-service-account", "windows-interactive"] as const;
export type RunnerClass = (typeof RUNNER_CLASSES)[number];

/** Human labels for the runner classes, for chips and pool headings. */
export const RUNNER_CLASS_LABEL: Readonly<Record<RunnerClass, string>> = Object.freeze({
  lightweight: "Lightweight",
  "windows-service-account": "Windows service account",
  "windows-interactive": "Windows interactive",
});

/**
 * A runner's lifecycle. `Starting` and `Draining` exist because runners are ephemeral:
 * the pool is expected to be mid-change, and a view that can only show Idle/Busy would
 * hide the elasticity that is the point.
 */
export const RUNNER_STATES = ["Starting", "Idle", "Busy", "Draining", "Offline"] as const;
export type RunnerState = (typeof RUNNER_STATES)[number];

/** Runner states that can accept new work. */
export const AVAILABLE_RUNNER_STATES: readonly RunnerState[] = Object.freeze(["Idle", "Starting"]);

/** The operating system a runner provides. */
export const RUNNER_PLATFORMS = ["linux", "windows", "macos"] as const;
export type RunnerPlatform = (typeof RUNNER_PLATFORMS)[number];

/**
 * One registered runner.
 *
 * There is no `assignedWorkflows` field and there never should be: a runner does not
 * belong to a workload. It advertises what it can do, and the distributor matches
 * work to it per run. `image` is the only version a runner carries — an ephemeral
 * runner cannot drift, so there is nothing else to keep up to date.
 */
export type Runner = {
  id: string;
  /** Display name, e.g. "lightweight-3". */
  name: string;
  runnerClass: RunnerClass;
  state: RunnerState;
  platform: RunnerPlatform;
  /** Auth models this runner can present to a target system. */
  authModels: AuthModel[];
  /** Whether this runner is torn down after its run. False for a long-lived host. */
  ephemeral: boolean;
  /** Whether this runner can drive a user interface. */
  headed: boolean;
  /** Runner image version — the only thing about a runner that has a version. */
  image: string;
  /** How long this runner has been up, as a display label ("4 minutes"). */
  uptime: string;
  /** The run currently executing here, when the runner is Busy. */
  currentRunId?: string;
  /** Runs completed by this runner since it started. */
  runsCompleted: number;
};

/* -------------------------------------------------------------- classification */

/**
 * The runner class a set of requirements needs.
 *
 * The rules are the vision's §2 breakdown, stated once: anything headed needs an
 * interactive session; Windows-integrated auth needs a domain identity but not a
 * session; everything else is API-eligible and runs on the cheap class.
 */
export function requiredRunnerClass(requirements: WorkflowRequirements): RunnerClass {
  if (requirements.ui === "headed") return "windows-interactive";
  if (requirements.auth === "windows-integrated") return "windows-service-account";
  return requirements.platform === "windows" ? "windows-service-account" : "lightweight";
}

/**
 * Where a workflow sits in the modernisation story — the §2 arithmetic, per workflow.
 *
 * - `api-eligible` — runs on lightweight compute today.
 * - `entra-pending` — blocked only by Windows-integrated auth, so it becomes
 *   API-eligible when its target system moves to Entra. This is the shrinking share.
 * - `headed-bound` — genuinely UI-bound, and stays that way until the target system
 *   modernises. The honest floor.
 */
export const READINESS = ["api-eligible", "entra-pending", "headed-bound"] as const;
export type Readiness = (typeof READINESS)[number];

/** Human labels for the readiness bands. */
export const READINESS_LABEL: Readonly<Record<Readiness, string>> = Object.freeze({
  "api-eligible": "API-eligible now",
  "entra-pending": "Windows auth, Entra-pending",
  "headed-bound": "Headed-bound",
});

/** Which readiness band a workflow's requirements put it in. */
export function readinessOf(requirements: WorkflowRequirements): Readiness {
  if (requirements.ui === "headed") return "headed-bound";
  return requirements.auth === "windows-integrated" ? "entra-pending" : "api-eligible";
}
