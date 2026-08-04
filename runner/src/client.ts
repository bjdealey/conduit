/**
 * The control-plane client — the runner's half of the protocol.
 *
 * Four calls, one URL, one shared token. It knows nothing about workflows: it asks for
 * work, and reports what happened. Everything it sends is defined in
 * `packages/domain/src/protocol.ts`, which is the file both sides code against.
 */
import {
  MAX_EVENTS_PER_BATCH,
  PROTOCOL_VERSION,
  type ClaimResponse,
  type HeartbeatResponse,
  type IngestResponse,
  type RegisterResponse,
  type RunEvent,
  type RunWork,
} from "@conduit/domain";
import type { RunnerConfig } from "./config.ts";

/** The control plane refused, or could not be reached. */
export class ProtocolError extends Error {
  /** The HTTP status the control plane answered with, when it answered. */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProtocolError";
    this.status = status;
  }
}

/** What a runner heartbeats about itself. */
export type RunnerState = "idle" | "busy" | "draining";

/** The four calls, as the loop uses them. */
export type ControlPlane = {
  register(): Promise<RegisterResponse>;
  heartbeat(input: { state: RunnerState; currentRunId?: string; runsCompleted: number }): Promise<HeartbeatResponse>;
  /** The work to execute, or null when there is nothing to do. */
  claim(): Promise<RunWork | null>;
  ingest(events: readonly RunEvent[]): Promise<IngestResponse>;
};

/** Split a batch to the size the control plane accepts. */
function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function controlPlane(config: RunnerConfig, fetchImpl: typeof fetch = globalThis.fetch): ControlPlane {
  async function post<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.controlPlaneUrl}/${action}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // A shared runner token, never a user JWT: runners are not users, and giving
          // one a user session would put a person's identity behind every run.
          "x-runner-token": config.token,
        },
        body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, runnerId: config.runnerId, ...payload }),
      });
    } catch (error) {
      throw new ProtocolError(`${action} could not reach the control plane: ${(error as Error).message}`);
    }

    const text = await response.text();
    const body = text === "" ? null : (JSON.parse(text) as unknown);
    if (!response.ok) {
      const detail = (body as { detail?: string; error?: string } | null)?.detail ??
        (body as { error?: string } | null)?.error ??
        text;
      throw new ProtocolError(`${action} refused: ${detail}`, response.status);
    }
    return body as T;
  }

  return {
    async register() {
      const response = await post<RegisterResponse & { accepted: boolean; detail?: string }>("register", {
        name: config.name,
        runnerClass: config.runnerClass,
        platform: config.platform,
        authModels: config.authModels,
        headed: config.headed,
        ephemeral: config.ephemeral,
        image: config.image,
      });
      if (!response.accepted) throw new ProtocolError(`registration refused: ${response.detail ?? "no reason given"}`);
      return response;
    },

    heartbeat: (input) =>
      post<HeartbeatResponse>("heartbeat", {
        state: input.state,
        currentRunId: input.currentRunId,
        runsCompleted: input.runsCompleted,
      }),

    async claim() {
      const response = await post<ClaimResponse>("claim", {});
      return response.work ?? null;
    },

    async ingest(events) {
      // Chunked, and each chunk posted in order: `(runId, sequence)` makes the write
      // idempotent, so a retry after a timeout duplicates nothing.
      let accepted = 0;
      let highWatermark = 0;
      for (const batch of batches(events, MAX_EVENTS_PER_BATCH)) {
        const response = await post<IngestResponse>("ingest", { events: batch });
        accepted += response.accepted;
        highWatermark = Math.max(highWatermark, response.highWatermark);
      }
      return { accepted, highWatermark };
    },
  };
}
