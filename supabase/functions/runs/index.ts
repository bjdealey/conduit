// runs — trigger a workflow, and read what happened to a run.
//
// The queue is the whole of the control plane's part in execution: it decides *that* a
// run should happen and *what* it should execute, then a runner claims it. There is no
// endpoint here that names a runner, and there must never be one — placement is
// `app_claim_run`'s to decide against the requirements, and a trigger that could pick a
// machine would re-import the assignment model Conduit exists to remove.
//
// POST /runs   { workflowId, workflowVersion, schemaVersion, requirements, steps }
//              → queues a run with the flow snapshotted onto it
// GET  /runs?id=run_1234
//              → that run's row (state, runner, timings)
import { DEFAULT_REQUIREMENTS, isBranch, pickRunner, type ExecutableStep, type Runner } from "@conduit/domain";
import { serviceClient } from "../_shared/supabase.ts";
import { json, preflight } from "../_shared/http.ts";
import { requireAdminOrService } from "../_shared/auth.ts";

/** How many steps one flow may carry. A guard against a payload that would fill the
 *  row rather than a limit anybody should meet: 500 steps is not a workflow. */
const MAX_STEPS = 500;

/** snake_case row → the domain shape `pickRunner` takes. */
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

/** Every step counted, branches included, so the ceiling can't be walked around by
 *  nesting. */
function countSteps(steps: readonly ExecutableStep[]): number {
  return steps.reduce(
    (total, step) => total + 1 + (isBranch(step) ? countSteps(step.then ?? []) + countSteps(step.else ?? []) : 0),
    0,
  );
}

/** A run id that reads as one. */
const newRunId = () => `run_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const supabase = serviceClient();

  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return json(400, { error: "id is required" });
    const { data, error } = await supabase
      .from("runs")
      .select("id,workflow_id,workflow_version,state,runner_id,attempts,queued_at,claimed_at,finished_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    if (!data) return json(404, { error: `no run ${id}` });
    return json(200, {
      run: {
        id: data.id,
        workflowId: data.workflow_id,
        workflowVersion: data.workflow_version,
        state: data.state,
        runnerId: data.runner_id,
        attempts: data.attempts,
        queuedAt: data.queued_at,
        claimedAt: data.claimed_at,
        finishedAt: data.finished_at,
      },
    });
  }

  if (req.method !== "POST") return json(405, { error: "use GET or POST" });

  // Triggering runs work on your infrastructure, so it is gated. TODO(supabase): once
  // Supabase Auth is wired in the frontend, this becomes the `trigger` permission from
  // packages/domain/src/review.ts — consumers may trigger, which is the whole point of
  // the tier — rather than admin-or-service.
  const refused = await requireAdminOrService(req, supabase);
  if (refused) return refused;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json(400, { error: "invalid body" });

  const workflowId = typeof body.workflowId === "string" ? body.workflowId : "";
  if (!workflowId) return json(400, { error: "workflowId is required" });
  if (!Array.isArray(body.steps)) return json(400, { error: "steps must be an array" });

  const steps = body.steps as ExecutableStep[];
  if (steps.length === 0) return json(400, { error: "a run needs at least one step" });
  if (countSteps(steps) > MAX_STEPS) return json(413, { error: `at most ${MAX_STEPS} steps` });

  const requirements = (body.requirements as typeof DEFAULT_REQUIREMENTS) ?? DEFAULT_REQUIREMENTS;
  const runId = typeof body.runId === "string" && body.runId ? body.runId : newRunId();

  const { data, error } = await supabase.rpc("app_enqueue_run", {
    p_run_id: runId,
    p_workflow_id: workflowId,
    p_workflow_version: Number(body.workflowVersion ?? 1) || 1,
    p_requirements: requirements,
    p_schema_version: Number(body.schemaVersion ?? 1) || 1,
    p_steps: steps,
  });
  if (error) return json(500, { error: error.message });

  // Where it *would* go, against the pool as it stands — a proposal, not a placement.
  // The run is placed when a runner claims it, and the pool may look different by then;
  // saying so is what stops this reading as an assignment.
  const { data: pool } = await supabase.from("runners").select("*").in("state", ["idle", "starting"]);
  const proposal = pickRunner(requirements, (pool ?? []).map(toRunner));

  const row = Array.isArray(data) ? data[0] : data;
  return json(202, {
    run: { id: runId, workflowId, state: row?.state ?? "queued", queuedAt: row?.queued_at ?? null },
    placement: {
      proposedRunnerId: proposal.runner?.id ?? null,
      proposedRunnerName: proposal.runner?.name ?? null,
      rationale: proposal.rationale,
    },
  });
});
