import type { AutomationStatus, Priority, RunState, Status } from "../data/types";

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
  const accent = STATUS_ACCENT[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-body-sm font-medium"
      style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ automation */

/** Automation run states use the reserved status palette (never categorical):
 *  neutral / info / good / critical, always shown with a label. */
const RUN_STATE_ACCENT: Record<RunState, string> = {
  Queued: "gray",
  Running: "blue",
  Completed: "grass",
  Failed: "tomato",
};

/** Run-state chip (mono, dot + label) for run tables and timelines. */
export function RunStateChip({ state }: { state: RunState }) {
  const accent = RUN_STATE_ACCENT[state];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-departure-mono text-[0.65rem] font-medium"
      style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      {state}
    </span>
  );
}

const AUTOMATION_STATUS_ACCENT: Record<AutomationStatus, string> = {
  Active: "grass",
  Paused: "amber",
  Draft: "gray",
};

/** Automation lifecycle chip (Active / Paused / Draft). */
export function AutomationStatusChip({ status }: { status: AutomationStatus }) {
  const accent = AUTOMATION_STATUS_ACCENT[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.72rem] font-medium"
      style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      {status}
    </span>
  );
}

export { PRIORITY_ACCENT, STATUS_ACCENT, RUN_STATE_ACCENT, AUTOMATION_STATUS_ACCENT };
