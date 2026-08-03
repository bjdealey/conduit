/** Canonical domain models, the capability enum, and adapter-boundary mapping. */
export { Capability, CAPABILITIES } from "./capability.ts";
export type { SourceStamped, Workflow, WorkflowRunState } from "./models.ts";
export { WORKFLOW_RUN_STATES } from "./models.ts";
export { MappingError } from "./errors.ts";
export type { MapContext } from "./errors.ts";
export { asRecord, requireString, requireEnum, stampId } from "./mapping.ts";
export type {
  AuthModel,
  Readiness,
  Runner,
  RunnerClass,
  RunnerPlatform,
  RunnerState,
  TargetPlatform,
  UiDependency,
  WorkflowRequirements,
} from "./runner.ts";
export {
  AUTH_MODELS,
  AVAILABLE_RUNNER_STATES,
  DEFAULT_REQUIREMENTS,
  HEADLESS_AUTH_MODELS,
  READINESS,
  READINESS_LABEL,
  RUNNER_CLASSES,
  RUNNER_CLASS_LABEL,
  RUNNER_PLATFORMS,
  RUNNER_STATES,
  TARGET_PLATFORMS,
  UI_DEPENDENCIES,
  readinessOf,
  requiredRunnerClass,
} from "./runner.ts";
export type { RunnerAssignment } from "./distributor.ts";
export { explainRequirements, pickRunner, poolByClass, readinessMix, runnerFits } from "./distributor.ts";
