/**
 * Local mode — one flow, executed from a file, with no control plane at all.
 *
 * This is the shortest honest answer to "does workflow execution work": a flow, a
 * runner, a real API, and a log. It runs the same engine the polling mode runs and
 * emits the same protocol events; the only thing missing is somebody to send them to.
 *
 * It is also how a flow gets debugged. Reproducing a failed run means running the
 * exact steps again, and a mode that needs a deployed backend before it can execute
 * anything is a mode nobody reaches for.
 */
import { readFile } from "node:fs/promises";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_REQUIREMENTS,
  migrateWorkflow,
  type ExecutableStep,
  type RunEvent,
  type RunEventKind,
  type RunWork,
  type WorkflowRequirements,
} from "@conduit/domain";
import { DEFAULT_DEADLINE_SECONDS, type RunResult } from "@conduit/runtime";
import type { RunnerIdentity } from "./config.ts";
import { runWork } from "./execute.ts";

/** What local mode needs: a flow, what it may read, and what it may reach. */
export type LocalOptions = {
  /** Parsed flow: a workflow, a `RunWork`, or a bare array of steps. */
  flow: unknown;
  identity: RunnerIdentity;
  env: Record<string, string>;
  allowPrivateHosts: boolean;
  runId?: string;
  deadlineSeconds?: number;
  onEvent?: (event: RunEvent) => void;
};

/**
 * Read a flow file into work a runner can execute.
 *
 * Three shapes are accepted because three shapes exist in practice: a workflow
 * exported from the library, the `RunWork` the control plane hands out (paste it
 * straight from a failed run), and a bare list of steps for a scratch flow. They
 * normalise to one thing here rather than in three places downstream.
 *
 * The flow is migrated on the way in, so a file written against schema v1 — steps with
 * no `kind` — executes without anyone having to know that changed.
 */
export function toWork(flow: unknown, runId: string, deadlineSeconds = DEFAULT_DEADLINE_SECONDS): RunWork {
  const raw = (Array.isArray(flow) ? { steps: flow } : (flow as Record<string, unknown> | null)) ?? {};
  if (!Array.isArray(raw.steps)) throw new Error("the flow has no steps: expected { steps: [...] } or a step array");

  const migrated = migrateWorkflow(raw as Record<string, unknown> & { schemaVersion?: number });
  const versions = Array.isArray(raw.versions) ? raw.versions.length : 0;

  return {
    runId,
    workflowId: String(raw.workflowId ?? raw.id ?? "wf_local"),
    workflowVersion: Number(raw.workflowVersion ?? raw.version ?? versions) || 1,
    requirements: (raw.requirements as WorkflowRequirements | undefined) ?? DEFAULT_REQUIREMENTS,
    schemaVersion: Number(migrated.schemaVersion ?? CURRENT_SCHEMA_VERSION),
    steps: migrated.steps as ExecutableStep[],
    deadlineSeconds,
  };
}

/** Read and parse a flow file. */
export async function readFlow(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }
}

/** A local run id. Local runs are not control-plane runs and should never be mistaken
 *  for one, so they are prefixed rather than sharing the `run_1234` sequence. */
export const localRunId = (now = Date.now()): string => `run_local_${now.toString(36)}`;

export async function runLocal(options: LocalOptions): Promise<RunResult> {
  const work = toWork(options.flow, options.runId ?? localRunId(), options.deadlineSeconds);
  return runWork(work, options.identity, {
    env: options.env,
    allowPrivateHosts: options.allowPrivateHosts,
    onEvent: options.onEvent,
  });
}

/* ------------------------------------------------------------------ presenting */

/** One glyph per event kind, so a log skims. */
const GLYPH: Record<RunEventKind, string> = {
  started: "▸",
  "step-started": "·",
  "step-finished": "✓",
  log: "↳",
  failed: "✗",
  finished: "✓",
};

/** One event as a terminal line. */
export function formatEvent(event: RunEvent): string {
  const time = event.at.slice(11, 19);
  return ` ${GLYPH[event.kind] ?? "·"} ${time}  ${event.message}`;
}

/** The closing line: what happened, and how long it took. */
export function formatSummary(result: RunResult): string {
  const head = `${result.state === "completed" ? "✓" : "✗"} ${result.runId} ${result.state}`;
  return `${head} — ${result.stepsExecuted} step(s) in ${result.elapsedMs} ms`;
}
