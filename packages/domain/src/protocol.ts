/**
 * The runner protocol — the contract between the control plane and the execution plane.
 *
 * Conduit does not execute anything. What it owes a runner is this: a way to announce
 * itself, a way to be given work, and a way to report what happened. Everything the
 * pool view, the distributor and the live run viewer render is downstream of these
 * five messages.
 *
 * It lives in `packages/domain` rather than in the app because both sides code
 * against it — the runtime team builds to this file, and it is the thing that has to
 * stay stable while both halves change independently.
 *
 * **Versioned deliberately.** A runner in the field is not redeployed in lockstep with
 * the control plane; that is the whole point of ephemeral runners pulling work. So the
 * wire shape carries a version and the server states what it accepts, rather than both
 * sides assuming they match.
 */
import type { AuthModel, RunnerClass, RunnerPlatform, WorkflowRequirements } from "./runner.ts";

/** The protocol version this build speaks. Bump on any breaking wire change. */
export const PROTOCOL_VERSION = 1;

/** Protocol versions this control plane still accepts from a runner. */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = Object.freeze([1]);

/** Whether a runner claiming this protocol version can be served. */
export function isSupportedProtocol(version: number): boolean {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(version);
}

/* ------------------------------------------------------------------- register */

/**
 * A runner announcing itself.
 *
 * It states what it *is*, never what it should be given — there is no field here for
 * a workload, a queue name, or a workflow id, and there must never be one. The moment
 * a runner can ask for specific work, placement stops being the platform's decision.
 */
export type RegisterRequest = {
  protocolVersion: number;
  /** Stable per boot; a new process is a new runner. */
  runnerId: string;
  name: string;
  runnerClass: RunnerClass;
  platform: RunnerPlatform;
  /** Auth models this runner can present to a target system. */
  authModels: AuthModel[];
  /** Whether it can drive a user interface. */
  headed: boolean;
  /** Whether it is torn down after its run. */
  ephemeral: boolean;
  /** Runner image version — the only version a runner carries. */
  image: string;
};

/** What the control plane returns on a successful registration. */
export type RegisterResponse = {
  accepted: true;
  /** How often the runner must heartbeat, in seconds. */
  heartbeatSeconds: number;
  /** Echoed so a runner can log what it is actually speaking. */
  protocolVersion: number;
};

/** Why a registration was refused. `protocol` means upgrade the runner. */
export type RegisterRejection = { accepted: false; reason: "protocol" | "unknown-class" | "rejected"; detail: string };

/* ------------------------------------------------------------------ heartbeat */

/**
 * Proof of life, plus what the runner is doing.
 *
 * A pool of ephemeral runners is defined by what is currently up, so absence is
 * information: a runner that stops heartbeating is gone, and the pool should show it
 * gone rather than waiting for a graceful goodbye that a killed process never sends.
 */
export type HeartbeatRequest = {
  protocolVersion: number;
  runnerId: string;
  /** What it is doing right now. */
  state: "idle" | "busy" | "draining";
  /** The run it is executing, when busy. */
  currentRunId?: string;
  /** Runs completed since it started. */
  runsCompleted: number;
};

/** The control plane's reply — the one place it can tell a runner to wind down. */
export type HeartbeatResponse = {
  /** Set when the pool is scaling in: finish the current run, then exit. */
  drain: boolean;
};

/**
 * How long after its last heartbeat a runner is considered gone.
 *
 * Three missed beats rather than one: a single missed beat is a network blip, and
 * evicting on it would make the pool view flicker and the distributor re-place work
 * that is actually still running.
 */
export const MISSED_HEARTBEATS_BEFORE_OFFLINE = 3;

/** Whether a runner has gone quiet for long enough to be treated as offline. */
export function isStale(secondsSinceHeartbeat: number, heartbeatSeconds: number): boolean {
  return secondsSinceHeartbeat > heartbeatSeconds * MISSED_HEARTBEATS_BEFORE_OFFLINE;
}

/* --------------------------------------------------------------------- claim */

/**
 * A runner asking for work.
 *
 * It sends only its identity: what it can carry was established at registration, and
 * the control plane matches against that. A runner never names the workflow it wants
 * — that is the distributor's decision, and the asymmetry is deliberate.
 */
export type ClaimRequest = { protocolVersion: number; runnerId: string };

/** Work handed to a runner, or nothing to do. */
export type ClaimResponse =
  | { work: null }
  | {
      work: {
        runId: string;
        workflowId: string;
        /** The exact version to execute — never "the latest", because the latest may
         *  carry no approval. */
        workflowVersion: number;
        /** What the flow needs, echoed so the runner can refuse a mismatch rather
         *  than failing obscurely halfway through. */
        requirements: WorkflowRequirements;
        /** The flow itself, in the schema version stated. */
        schemaVersion: number;
        steps: { id: string; actionId: string; config: Record<string, string> }[];
        /** Wall-clock budget. A runner that exceeds it should abort and report. */
        deadlineSeconds: number;
      };
    };

/* -------------------------------------------------------------------- ingest */

/** What kind of thing happened during a run. */
export const RUN_EVENT_KINDS = ["started", "step-started", "step-finished", "log", "failed", "finished"] as const;
export type RunEventKind = (typeof RUN_EVENT_KINDS)[number];

/**
 * One thing that happened during a run.
 *
 * `sequence` is the runner's own counter, not a timestamp: events arrive out of order
 * over a flaky link, and clocks on ephemeral compute are not to be trusted for
 * ordering. The viewer sorts on this.
 */
export type RunEvent = {
  runId: string;
  sequence: number;
  kind: RunEventKind;
  /** The step this concerns, for step-scoped kinds. */
  stepId?: string;
  /** One line, shown in the run log. */
  message: string;
  /** Runner's clock, for display only — never for ordering. */
  at: string;
};

/**
 * A batch of events.
 *
 * Batched because a chatty workflow would otherwise mean one request per log line,
 * and the runner has better things to do. Idempotent by `(runId, sequence)`, so a
 * retried batch after a timeout is safe rather than duplicated.
 */
export type IngestRequest = { protocolVersion: number; runnerId: string; events: RunEvent[] };

/** How many events the control plane accepts in one batch. */
export const MAX_EVENTS_PER_BATCH = 500;

/** What the control plane accepted, so a runner knows what to retry. */
export type IngestResponse = { accepted: number; /** Highest sequence durably stored. */ highWatermark: number };

/** Whether a run has reached a state no further events should follow. */
export function isTerminal(kind: RunEventKind): boolean {
  return kind === "finished" || kind === "failed";
}

/**
 * Order and de-duplicate a batch of events for display.
 *
 * Ordering is by `sequence` and de-duplication is on it too, because at-least-once
 * delivery means the same event legitimately arrives twice and a run log that
 * repeats itself is a run log nobody trusts.
 */
export function orderEvents(events: readonly RunEvent[]): RunEvent[] {
  const seen = new Map<string, RunEvent>();
  for (const e of events) seen.set(`${e.runId}:${e.sequence}`, e);
  return [...seen.values()].sort((a, b) => a.runId.localeCompare(b.runId) || a.sequence - b.sequence);
}
