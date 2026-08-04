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
export type { Permission, ReviewAction, Role, Transition, WorkflowStatus } from "./review.ts";
export {
  AWAITING_REVIEW,
  PERMISSIONS,
  REVIEW_ACTIONS,
  ROLES,
  ROLE_BLURB,
  ROLE_LABEL,
  WORKFLOW_STATUSES,
  availableTransitions,
  can,
  canTransition,
  isRunnable,
  permissionsOf,
  transitionsFrom,
} from "./review.ts";
export type { StoredWorkflow, WorkflowVersion } from "./version.ts";
export {
  CURRENT_SCHEMA_VERSION,
  hasUnpublishedChanges,
  latestVersion,
  migrateWorkflow,
  needsMigration,
  nextVersion,
  publishedVersion,
} from "./version.ts";
export type {
  ClaimRequest,
  ClaimResponse,
  ExecutableAction,
  ExecutableBranch,
  ExecutableStep,
  HeartbeatRequest,
  HeartbeatResponse,
  IngestRequest,
  IngestResponse,
  RegisterRejection,
  RegisterRequest,
  RegisterResponse,
  RunConclusion,
  RunEvent,
  RunEventKind,
  RunWork,
} from "./protocol.ts";
export {
  MAX_EVENTS_PER_BATCH,
  MISSED_HEARTBEATS_BEFORE_OFFLINE,
  PROTOCOL_VERSION,
  RUN_CONCLUSIONS,
  RUN_EVENT_KINDS,
  SUPPORTED_PROTOCOL_VERSIONS,
  conclusionOf,
  isBranch,
  isStale,
  isSupportedProtocol,
  isTerminal,
  orderEvents,
} from "./protocol.ts";
export type { AuditCategory, AuditEntry } from "./audit.ts";
export {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABEL,
  REVIEW_ACTION_VERB,
  auditByCategory,
  categoryOfReviewAction,
  orderAudit,
} from "./audit.ts";
export type { QueuedRun } from "./dispatch.ts";
export { MAX_ATTEMPTS, claimableBy, exhausted, nextClaim, unservable } from "./dispatch.ts";
export type { ScalePlan } from "./autoscale.ts";
export { MAX_PER_CLASS, WARM_FLOOR, isNoop, scalePlan, shouldDrain } from "./autoscale.ts";
