import { useMemo } from "react";
import { Workflow as WorkflowIcon } from "lucide-react";
import { useStore } from "../store";
import { DataTable, type Column } from "./DataTable";
import { num } from "../lib/format";
import { isNarrowed, matchesQuery, passesFilter } from "../lib/workspace";
import { Chip } from "./Chip";

/**
 * One row of the triggers table, whichever kind of trigger it came from.
 *
 * Schedules and event triggers were two tabs holding two tables that differed in
 * one column. Both answer "what starts this workflow" — a clock or an event — so
 * the kind is a value in a row rather than a page you have to be on. `when`
 * carries the cadence or the event key, `detail` the condition (events only),
 * and `last`/`next` whatever that kind can honestly say about time.
 */
type Trigger = {
  id: string;
  kind: "Schedule" | "Event";
  workflowId: string;
  when: string;
  detail: string | null;
  last: string;
  next: string | null;
  count: number | null;
  enabled: boolean;
};

/** Enabled / Paused state chip (reserved status palette, label-carried). */
function EnabledChip({ on }: { on: boolean }) {
  return <Chip tone={on ? "grass" : "gray"}>{on ? "Enabled" : "Paused"}</Chip>;
}

const mono = (s: string) => <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{s}</span>;

/** A cell that names the workflow a trigger drives and jumps to the library. */
function WorkflowCell({ workflowId }: { workflowId: string }) {
  const { workflowById, openSubview } = useStore();
  const workflow = workflowById(workflowId);
  return (
    <button
      type="button"
      onClick={() => openSubview("workflows", "library")}
      className="focusable -mx-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-transparent-hover"
    >
      <WorkflowIcon size={13} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
      <span className="truncate text-body-sm text-primary-foreground">{workflow?.name ?? workflowId}</span>
    </button>
  );
}

/* ------------------------------------------------------------------------ view */

/**
 * Workflows → Triggers: everything that starts a workflow, on a clock or on an
 * event, in one table.
 *
 * Filed under Workflows rather than beside the runner pool on purpose. A trigger
 * is `{workflowId, …}` — its first column is the workflow it drives — and a
 * schedule says *when*, never *where*: the distributor picks a runner at the
 * moment it fires. Listing these next to the machines would re-associate the two,
 * which is the habit the no-assignment inversion exists to remove. The Placement
 * column says so in as many words rather than leaving a gap where a target used
 * to go in the tools this replaces.
 */
export function TriggersView() {
  const { workflowById, controls, schedules, eventTriggers } = useStore();
  const state = controls("workflows/triggers");

  const triggers = useMemo<Trigger[]>(
    () => [
      ...schedules.map(
        (s): Trigger => ({
          id: s.id,
          kind: "Schedule",
          workflowId: s.workflowId,
          when: s.cadence,
          detail: null,
          last: s.lastRun,
          next: s.nextRun,
          count: null,
          enabled: s.enabled,
        }),
      ),
      ...eventTriggers.map(
        (e): Trigger => ({
          id: e.id,
          kind: "Event",
          workflowId: e.workflowId,
          when: e.event,
          detail: e.condition,
          last: e.lastFired,
          // An event has no next: nobody knows when it will next arrive, and a
          // dash says that where "—" in a Cadence column would read as broken.
          next: null,
          count: e.fireCount,
          enabled: e.enabled,
        }),
      ),
    ],
    [schedules, eventTriggers],
  );

  const workflowName = (id: string) => workflowById(id)?.name ?? id;

  const visible = triggers.filter(
    (t) =>
      matchesQuery(state.query, [workflowName(t.workflowId), t.kind, t.when, t.detail, t.last]) &&
      passesFilter(state, "enabled", t.enabled ? "enabled" : "paused") &&
      passesFilter(state, "kind", t.kind),
  );

  const dash = <span className="text-tertiary-foreground">—</span>;

  const columns: Column<Trigger>[] = [
    { key: "workflow", header: "Workflow", render: (t) => <WorkflowCell workflowId={t.workflowId} /> },
    {
      key: "kind",
      header: "Kind",
      width: 110,
      render: (t) => <Chip tone={t.kind === "Schedule" ? "blue" : "violet"}>{t.kind}</Chip>,
    },
    // A cadence reads as prose ("Every 15 minutes"), an event key as an
    // identifier ("user.signup") — so the cell is set the way its value is meant
    // to be read rather than uniformly.
    { key: "when", header: "Starts on", render: (t) => (t.kind === "Event" ? mono(t.when) : t.when) },
    {
      key: "detail",
      header: "Condition",
      render: (t) => (t.detail ? <span className="text-secondary-foreground">{t.detail}</span> : dash),
    },
    { key: "last", header: "Last run", render: (t) => <span className="text-tertiary-foreground">{t.last}</span> },
    {
      key: "next",
      header: "Next run",
      render: (t) => (t.next ? <span className="text-tertiary-foreground">{t.next}</span> : dash),
    },
    { key: "count", header: "Fired", align: "right", width: 90, render: (t) => (t.count === null ? dash : mono(num(t.count))) },
    // Not a machine name: the distributor picks a runner when the trigger fires.
    { key: "placement", header: "Placement", render: () => <span className="text-tertiary-foreground">Chosen at run time</span> },
    { key: "status", header: "Status", width: 120, render: (t) => <EnabledChip on={t.enabled} /> },
  ];

  const empty = isNarrowed(state)
    ? "Nothing matches the current search or filters."
    : "No triggers. A trigger starts a workflow — on a cadence, or when a named event arrives. It says when, never where: the distributor places each run on a runner that fits it at the moment it fires.";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="scrollbar-none flex-1 overflow-auto">
        <div className="min-w-[860px] px-3 py-2">
          <DataTable columns={columns} rows={visible} empty={empty} />
        </div>
      </div>
    </div>
  );
}
