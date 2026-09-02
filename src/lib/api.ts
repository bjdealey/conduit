/**
 * The internal API client. The frontend calls *our* API — PostgREST-backed Edge
 * Functions on our Supabase project — and gets back *our* domain models. It never talks
 * to a vendor. Responses are defensively coerced at this boundary: a malformed row is
 * dropped rather than trusted (the loud-failure guarantee lives server-side, at the
 * adapter; here we just don't render junk).
 */
import {
  CAPABILITIES,
  Capability,
  RUN_EVENT_KINDS,
  WORKFLOW_RUN_STATES,
  orderEvents,
  type RunEvent,
  type RunEventKind,
  type RunWork,
  type Workflow,
  type WorkflowRunState,
} from "@conduit/domain";
import { supabase } from "./supabase";
import type { NodeRequirement, StepAction } from "../data/actions";

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Coerce an untrusted API object into a domain `Workflow`, or null if it isn't one. */
export function coerceWorkflow(raw: unknown): Workflow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = nonEmptyString(r.id);
  const sourceId = nonEmptyString(r.sourceId);
  const platform = nonEmptyString(r.platform);
  const connectorId = nonEmptyString(r.connectorId);
  const title = nonEmptyString(r.title);
  const owner = nonEmptyString(r.owner);
  if (!id || !sourceId || !platform || !connectorId || !title || !owner) return null;
  const state: WorkflowRunState =
    typeof r.state === "string" && (WORKFLOW_RUN_STATES as readonly string[]).includes(r.state)
      ? (r.state as WorkflowRunState)
      : "Unknown";
  return { id, sourceId, platform, connectorId, title, state, owner };
}

export function coerceWorkflows(list: unknown): Workflow[] {
  return Array.isArray(list) ? list.map(coerceWorkflow).filter((b): b is Workflow => b !== null) : [];
}

/** Keep only recognised capability ids from an untrusted list. */
export function coerceCapabilities(list: unknown): Capability[] {
  const known = new Set<string>(CAPABILITIES);
  return Array.isArray(list) ? list.filter((c): c is Capability => typeof c === "string" && known.has(c)) : [];
}

/** The capabilities the enabled connectors declare — drives which UI features light up. */
export async function getCapabilities(): Promise<Capability[]> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("capabilities", { method: "GET" });
  if (error) throw error;
  return coerceCapabilities((data as { capabilities?: unknown } | null)?.capabilities);
}

/**
 * Normalised workflows from every enabled connector. Served by the `workflows` Edge Function
 * (service-role read over the cache table) so it works before Supabase Auth is wired;
 * once it is, this can move to a direct PostgREST read.
 */
export async function getWorkflows(): Promise<Workflow[]> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("workflows", { method: "GET" });
  if (error) throw error;
  return coerceWorkflows((data as { workflows?: unknown } | null)?.workflows);
}

/* ----------------------------------------------------------------- triggering */

/** What the control plane says about a run it has queued. `runnerId` is a *proposal*
 *  against the pool as it stands — the run is placed when a runner claims it. */
export type QueuedRunReceipt = { runId: string; state: string; proposedRunnerId: string | null; rationale: string };

/**
 * Queue a run of this flow.
 *
 * The flow travels with the request and is snapshotted onto the run, so a workflow
 * edited while its run waits cannot change what that run executes. Nothing here names
 * a runner: placement is the claim's decision, and an endpoint that could pick a
 * machine would be the assignment model coming back in through the API.
 */
export async function enqueueRun(work: RunWork): Promise<QueuedRunReceipt> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("runs", { method: "POST", body: work });
  if (error) throw error;
  const body = (data ?? {}) as { run?: { id?: string; state?: string }; placement?: Record<string, unknown> };
  return {
    runId: nonEmptyString(body.run?.id) ?? work.runId,
    state: nonEmptyString(body.run?.state) ?? "queued",
    proposedRunnerId: nonEmptyString(body.placement?.proposedRunnerId) ?? null,
    rationale: nonEmptyString(body.placement?.rationale) ?? "queued",
  };
}

/* ---------------------------------------------------------------- run events */

/** Coerce an untrusted row into a domain `RunEvent`, or null if it isn't one. */
export function coerceRunEvent(raw: unknown): RunEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const runId = nonEmptyString(r.run_id) ?? nonEmptyString(r.runId);
  const message = nonEmptyString(r.message);
  const at = nonEmptyString(r.at);
  const sequence = typeof r.sequence === "number" ? r.sequence : null;
  const kind = typeof r.kind === "string" && (RUN_EVENT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as RunEventKind) : null;
  if (!runId || !message || !at || sequence === null || !kind) return null;
  const stepId = nonEmptyString(r.step_id) ?? nonEmptyString(r.stepId) ?? undefined;
  return { runId, sequence, kind, message, at, stepId };
}

/** The stored log for one run, ordered and de-duplicated. */
export async function getRunEvents(runId: string): Promise<RunEvent[]> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("run_events").select("*").eq("run_id", runId).order("sequence");
  if (error) throw error;
  const rows = Array.isArray(data) ? data.map(coerceRunEvent).filter((e): e is RunEvent => e !== null) : [];
  return orderEvents(rows);
}

/**
 * Subscribe to a run's events as they are ingested.
 *
 * Realtime rather than polling: a run is quiet most of the time and then bursts, and
 * the point of the live viewer is that a node lights up when it happens. Returns an
 * unsubscribe function; callers must call it, or a navigated-away run keeps a channel
 * open for the life of the tab.
 */
export function subscribeRunEvents(runId: string, onEvent: (event: RunEvent) => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`run_events:${runId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "run_events", filter: `run_id=eq.${runId}` },
      (payload) => {
        const event = coerceRunEvent(payload.new);
        if (event) onEvent(event);
      },
    )
    .subscribe();
  return () => {
    void supabase?.removeChannel(channel);
  };
}

/* --------------------------------------------------------------- node types */

/**
 * Coerce an untrusted catalogue row into a palette action.
 *
 * `requires` arrives as JSON, so it can only ever be the static object form here — a
 * config-dependent requirement is a function and cannot cross a wire. Nodes whose need
 * varies with configuration stay compiled in until the catalogue grows an expression
 * for it; this is the honest boundary rather than a silent downgrade.
 */
export function coerceNodeType(raw: unknown): StepAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = nonEmptyString(r.id);
  const label = nonEmptyString(r.label);
  const pkg = nonEmptyString(r.package);
  const summary = nonEmptyString(r.summary);
  if (!id || !label || !pkg || !summary) return null;
  const fields = Array.isArray(r.fields) ? (r.fields as StepAction["fields"]) : [];
  const requires = typeof r.requires === "object" && r.requires !== null ? (r.requires as NodeRequirement) : undefined;
  const readiness = r.readiness === "roadmap" ? ("roadmap" as const) : ("live" as const);
  return { id, label, package: pkg, summary, fields, requires, readiness };
}

/** The builder palette from our API. Malformed rows are dropped, not rendered. */
export async function getNodeTypes(): Promise<StepAction[]> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("node-types", { method: "GET" });
  if (error) throw error;
  const list = (data as { nodeTypes?: unknown } | null)?.nodeTypes;
  return Array.isArray(list) ? list.map(coerceNodeType).filter((n): n is StepAction => n !== null) : [];
}
