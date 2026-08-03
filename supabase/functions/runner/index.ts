/**
 * The runner protocol, server side.
 *
 * One function with four actions rather than four functions, because they share the
 * same auth check and the same client, and a runner talking to four URLs is four
 * things to configure wrong.
 *
 * Every action is service-role: runners are not `authenticated` users and must never
 * be given a user JWT. They present a shared runner token, checked here.
 */
import {
  MAX_EVENTS_PER_BATCH,
  PROTOCOL_VERSION,
  isSupportedProtocol,
  type ClaimResponse,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type IngestRequest,
  type RegisterRequest,
} from "@conduit/domain";
import { scalePlan, shouldDrain, type QueuedRun, type Runner } from "@conduit/domain";
import { serviceClient } from "../_shared/supabase.ts";
import { json, methodNotAllowed } from "../_shared/http.ts";

/** How often a registered runner must check in. */
const HEARTBEAT_SECONDS = 15;

/** Wall-clock budget handed to a runner with its work. */
const RUN_DEADLINE_SECONDS = 900;

/** snake_case row → the domain shape the pure functions take. */
function toRunner(r: Record<string, unknown>): Runner {
  return {
    id: r.id as string,
    name: r.name as string,
    runnerClass: r.runner_class as Runner["runnerClass"],
    state: ((r.state as string) ?? "idle").replace(/^./, (c) => c.toUpperCase()) as Runner["state"],
    platform: r.platform as Runner["platform"],
    authModels: (r.auth_models ?? []) as Runner["authModels"],
    ephemeral: Boolean(r.ephemeral),
    headed: Boolean(r.headed),
    image: r.image as string,
    uptime: "",
    currentRunId: (r.current_run_id as string) ?? undefined,
    runsCompleted: Number(r.runs_completed ?? 0),
  };
}

function toQueuedRun(r: Record<string, unknown>): QueuedRun {
  return {
    runId: r.id as string,
    workflowId: r.workflow_id as string,
    workflowVersion: Number(r.workflow_version ?? 1),
    requirements: r.requirements as QueuedRun["requirements"],
    queuedAt: String(r.queued_at ?? ""),
    attempts: Number(r.attempts ?? 0),
  };
}

/** The shared secret a runner presents. Not a user token — runners are not users. */
function authorised(req: Request): boolean {
  const expected = Deno.env.get("RUNNER_TOKEN");
  if (!expected) return false;
  return req.headers.get("x-runner-token") === expected;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);
  if (!authorised(req)) return json({ error: "unauthorised" }, 401);

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "invalid body" }, 400);

  const version = (body as { protocolVersion?: number }).protocolVersion ?? 0;
  if (!isSupportedProtocol(version)) {
    // Refused explicitly rather than half-served: a runner speaking a shape we don't
    // understand should upgrade, not guess.
    return json({ accepted: false, reason: "protocol", detail: `server speaks v${PROTOCOL_VERSION}` }, 426);
  }

  const db = serviceClient();

  if (action === "register") {
    const r = body as RegisterRequest;
    const { error } = await db.from("runners").upsert({
      id: r.runnerId,
      name: r.name,
      runner_class: r.runnerClass,
      platform: r.platform,
      auth_models: r.authModels,
      headed: r.headed,
      ephemeral: r.ephemeral,
      image: r.image,
      state: "idle",
      last_seen_at: new Date().toISOString(),
    });
    if (error) return json({ accepted: false, reason: "rejected", detail: error.message }, 400);
    return json({ accepted: true, heartbeatSeconds: HEARTBEAT_SECONDS, protocolVersion: PROTOCOL_VERSION });
  }

  if (action === "heartbeat") {
    const h = body as HeartbeatRequest;
    const { error } = await db
      .from("runners")
      .update({
        state: h.state,
        current_run_id: h.currentRunId ?? null,
        runs_completed: h.runsCompleted,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", h.runnerId);
    if (error) return json({ error: error.message }, 400);

    // Whether to wind down is a pool-wide decision, so it is recomputed from the
    // current pool and queue rather than stored per runner — a stored flag goes stale
    // the moment demand changes, and a runner told to drain during a spike is exactly
    // the wrong answer.
    const [{ data: pool }, { data: queue }] = await Promise.all([
      db.from("runners").select("*"),
      db.from("runs").select("*").eq("state", "queued"),
    ]);
    const plan = scalePlan((pool ?? []).map(toRunner), (queue ?? []).map(toQueuedRun));
    return json({ drain: shouldDrain(plan, h.runnerId) } satisfies HeartbeatResponse);
  }

  if (action === "claim") {
    // One statement, holding a row lock: two runners polling a second apart both see
    // the same queued run, and if both take it the workflow executes twice.
    const { data, error } = await db.rpc("app_claim_run", { p_runner_id: (body as { runnerId: string }).runnerId });
    if (error) return json({ error: error.message }, 400);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return json({ work: null } satisfies ClaimResponse);

    const response: ClaimResponse = {
      work: {
        runId: row.id,
        workflowId: row.workflow_id,
        workflowVersion: row.workflow_version,
        requirements: row.requirements,
        schemaVersion: row.schema_version,
        steps: row.steps ?? [],
        deadlineSeconds: RUN_DEADLINE_SECONDS,
      },
    };
    return json(response);
  }

  if (action === "ingest") {
    const i = body as IngestRequest;
    if (!Array.isArray(i.events)) return json({ error: "events must be an array" }, 400);
    if (i.events.length > MAX_EVENTS_PER_BATCH) {
      return json({ error: `at most ${MAX_EVENTS_PER_BATCH} events per batch` }, 413);
    }
    const rows = i.events.map((e) => ({
      run_id: e.runId,
      sequence: e.sequence,
      kind: e.kind,
      step_id: e.stepId ?? null,
      message: e.message,
      at: e.at,
    }));
    // Idempotent by (run_id, sequence): a retried batch after a timeout is safe.
    const { error } = await db.from("run_events").upsert(rows, { onConflict: "run_id,sequence", ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 400);
    const highWatermark = rows.reduce((max, r) => Math.max(max, r.sequence), 0);
    return json({ accepted: rows.length, highWatermark });
  }

  return json({ error: `unknown action "${action ?? ""}"` }, 404);
});
