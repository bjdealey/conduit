/**
 * Adapter-boundary mapping: A360 repository/workflow records → the canonical `Workflow`. Uses
 * the domain mapping primitives so a bad payload fails loudly with a `MappingError`,
 * never a partial model. Status normalisation folds A360 status tokens onto our
 * `WorkflowRunState`, with anything unrecognised or absent mapping to "Unknown".
 */
import { asRecord, requireString, stampId } from "@conduit/domain";
import type { Workflow, WorkflowRunState, MapContext } from "@conduit/domain";

/**
 * A360 status token → domain `WorkflowRunState`.
 *
 * TODO(a360): confirm the exact field + source that carries a per-workflow status. A
 * repository file record may not include a run status; deriving it may require an
 * activity/deployment query. This table is the intended normalisation once the
 * source field is confirmed; unrecognised/absent values already fall back to "Unknown".
 */
const STATUS_MAP: Record<string, WorkflowRunState> = {
  RUNNING: "Running",
  DEPLOYED: "Running",
  PENDING_EXECUTION: "Running",
  QUEUED: "Running",
  COMPLETED: "Idle",
  RUN_FAILED: "Idle",
  RUN_ABORTED: "Idle",
  STOPPED: "Idle",
  DISABLED: "Disabled",
};

/** Normalise an A360 status token to a `WorkflowRunState`. Non-string / unknown → "Unknown". */
export function normalizeStatus(raw: unknown): WorkflowRunState {
  if (typeof raw !== "string") return "Unknown";
  return STATUS_MAP[raw.toUpperCase()] ?? "Unknown";
}

/** Map one A360 workflow record to a domain `Workflow`, or throw `MappingError` on bad input. */
export function mapA360Workflow(raw: unknown, ctx: MapContext): Workflow {
  const rec = asRecord(raw, ctx);

  // A360 ids may arrive as numbers; accept those, reject anything else loudly.
  const rawId = rec["id"];
  const sourceId =
    typeof rawId === "number" && Number.isFinite(rawId) ? String(rawId) : requireString(rec, "id", ctx);
  const withId: MapContext = { ...ctx, sourceId };

  // TODO(a360): confirm the workflow name field. Believed to be "name".
  const title = requireString(rec, "name", withId);
  // TODO(a360): confirm the owner field. Using "createdBy"; it may be a user id vs a
  // display name, in which case a users lookup would be needed to show a person's name.
  const owner = requireString(rec, "createdBy", withId);
  // TODO(a360): confirm the status source field (see STATUS_MAP note above).
  const state = normalizeStatus(rec["status"]);

  return {
    id: stampId(ctx.connectorId, sourceId),
    sourceId,
    platform: ctx.platform,
    connectorId: ctx.connectorId,
    title,
    state,
    owner,
  };
}

/**
 * Extract the array of workflow records from a list response.
 * TODO(a360): confirm the list envelope. Believed to be `{ list: [...] }`.
 */
export function extractBotRecords(payload: unknown, ctx: MapContext): unknown[] {
  const rec = asRecord(payload, ctx);
  const list = rec["list"];
  if (!Array.isArray(list)) {
    // Fail loudly rather than silently returning zero workflows on a shape mismatch.
    throw new Error(
      `A360 workflow list response had no "list" array (connector "${ctx.connectorId}"); ` +
        `TODO(a360): confirm the list envelope shape`,
    );
  }
  return list;
}
