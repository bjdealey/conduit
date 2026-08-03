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
  type IngestRequest,
  type RegisterRequest,
} from "@conduit/domain";
import { serviceClient } from "../_shared/supabase.ts";
import { json, methodNotAllowed } from "../_shared/http.ts";

/** How often a registered runner must check in. */
const HEARTBEAT_SECONDS = 15;

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
    // TODO(runner): drain is always false until pool autoscaling exists. When it does,
    // this is where the control plane tells a runner to wind down.
    return json({ drain: false });
  }

  if (action === "claim") {
    // TODO(runner): dispatch is not implemented. Placement is decided by pickRunner in
    // the control plane; this endpoint will hand over the run it was placed on, and
    // must do so atomically (claim-once) so two runners can't take the same run.
    // Returning "no work" is the honest answer until that lands, rather than handing
    // out work nothing will reconcile.
    const response: ClaimResponse = { work: null };
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
