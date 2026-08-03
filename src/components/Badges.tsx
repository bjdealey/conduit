import { Chip } from "./Chip";
import type { WorkflowStatus, Priority, RunState, Status } from "../data/types";

const PRIORITY_ACCENT: Record<Priority, string> = {
  High: "tomato",
  Medium: "amber",
  Low: "gray",
};

/** Priority pill (coloured dot + label). */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const accent = PRIORITY_ACCENT[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-body-sm text-secondary-foreground">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: `var(--${accent}-9)` }}
      />
      {priority}
    </span>
  );
}

const STATUS_ACCENT: Record<Status, string> = {
  "Under Investigation": "amber",
  Active: "tomato",
  "In Recovery": "cyan",
  Resolved: "grass",
};

/** Status chip used in the inbox group headers and detail. */
export function StatusBadge({ status }: { status: Status }) {
  return <Chip tone={STATUS_ACCENT[status]}>{status}</Chip>;
}

/* ------------------------------------------------------------------ workflow */

/** Workflow run states use the reserved status palette (never categorical):
 *  neutral / info / good / critical, always shown with a label. */
const RUN_STATE_ACCENT: Record<RunState, string> = {
  Queued: "gray",
  Running: "blue",
  Completed: "grass",
  Failed: "tomato",
};

/** Run-state chip (mono, dot + label) for run tables and timelines. */
export function RunStateChip({ state }: { state: RunState }) {
  return <Chip tone={RUN_STATE_ACCENT[state]} mono className="shrink-0">{state}</Chip>;
}

const WORKFLOW_STATUS_ACCENT: Record<WorkflowStatus, string> = {
  Draft: "gray",
  "In review": "blue",
  "Changes requested": "amber",
  Approved: "cyan",
  Published: "grass",
  Paused: "amber",
};

/** Workflow lifecycle chip (Draft → In review → Approved → Published). */
export function WorkflowStatusChip({ status }: { status: WorkflowStatus }) {
  return <Chip tone={WORKFLOW_STATUS_ACCENT[status]}>{status}</Chip>;
}

export { PRIORITY_ACCENT, STATUS_ACCENT, RUN_STATE_ACCENT, WORKFLOW_STATUS_ACCENT };
