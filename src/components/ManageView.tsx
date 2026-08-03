import { type ReactNode } from "react";
import { Workflow as WorkflowIcon } from "lucide-react";
import { useStore } from "../store";
import { schedules, eventTriggers, credentials, packages, globalValues } from "../data/manage";
import type { Credential, EventTrigger, GlobalValue, Package, Schedule } from "../data/manage";
import { DataTable, type Column } from "./DataTable";
import { Avatar } from "./Avatar";
import { num } from "../lib/format";
import { isNarrowed, matchesQuery, passesFilter } from "../lib/workspace";
import { TabStrip } from "./TabStrip";
import { Chip } from "./Chip";

const TABS = ["Scheduled", "Event triggers", "Credentials", "Packages", "Global values"] as const;
type Tab = (typeof TABS)[number];

/** Enabled / Paused state chip (reserved status palette, label-carried). */
function EnabledChip({ on }: { on: boolean }) {
  return <Chip tone={on ? "grass" : "gray"}>{on ? "Enabled" : "Paused"}</Chip>;
}

function Kind({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-component px-1.5 py-0.5 text-[0.72rem] text-secondary-foreground">
      {children}
    </span>
  );
}

const mono = (s: ReactNode) => <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{s}</span>;

/** A cell that names the workflow an object drives and jumps to the library. */
function WorkflowCell({ workflowId }: { workflowId: string }) {
  const { workflowById, setView } = useStore();
  const workflow = workflowById(workflowId);
  return (
    <button
      type="button"
      onClick={() => setView("workflows")}
      className="focusable -mx-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-transparent-hover"
    >
      <WorkflowIcon size={13} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
      <span className="truncate text-body-sm text-primary-foreground">{workflow?.name ?? workflowId}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ view */

/** Manage — operational objects behind execution: schedules and event triggers
 *  that start workflows, plus the credentials, packages and global values runs
 *  consume. Each tab is a token-styled table; rows link back to the workflow. */
export function ManageView() {
  const { memberById, workflowById, controls, sectionTab, setSectionTab } = useStore();
  // The active tab is shared with the workspace header, so its search placeholder
  // and filters follow the objects on screen.
  const tab = (sectionTab("manage") || "Scheduled") as Tab;
  const setTab = (next: Tab) => setSectionTab("manage", next);
  const state = controls("manage");

  /** Rows of the open tab, narrowed by the header. `enabled` only applies to the
   *  tabs whose objects can be paused — the header only offers it there. */
  const narrow = <T,>(rows: T[], fields: (row: T) => (string | number | null | undefined)[], enabled?: (row: T) => boolean) =>
    rows.filter(
      (row) =>
        matchesQuery(state.query, fields(row)) &&
        (enabled === undefined || passesFilter(state, "enabled", enabled(row) ? "enabled" : "paused")),
    );

  const workflowName = (id: string) => workflowById(id)?.name ?? id;

  const scheduleCols: Column<Schedule>[] = [
    { key: "workflow", header: "Workflow", render: (r) => <WorkflowCell workflowId={r.workflowId} /> },
    { key: "cadence", header: "Cadence", render: (r) => r.cadence },
    { key: "next", header: "Next run", render: (r) => <span className="text-tertiary-foreground">{r.nextRun}</span> },
    { key: "last", header: "Last run", render: (r) => <span className="text-tertiary-foreground">{r.lastRun}</span> },
    // Not a machine name: the distributor picks a runner when the schedule fires.
    { key: "placement", header: "Placement", render: () => <span className="text-tertiary-foreground">Chosen at run time</span> },
    { key: "status", header: "Status", width: 120, render: (r) => <EnabledChip on={r.enabled} /> },
  ];

  const triggerCols: Column<EventTrigger>[] = [
    { key: "workflow", header: "Workflow", render: (r) => <WorkflowCell workflowId={r.workflowId} /> },
    { key: "event", header: "Event", render: (r) => mono(r.event) },
    { key: "condition", header: "Condition", render: (r) => <span className="text-secondary-foreground">{r.condition}</span> },
    { key: "fired", header: "Fired", align: "right", width: 90, render: (r) => mono(num(r.fireCount)) },
    { key: "last", header: "Last fired", render: (r) => <span className="text-tertiary-foreground">{r.lastFired}</span> },
    { key: "status", header: "Status", width: 120, render: (r) => <EnabledChip on={r.enabled} /> },
  ];

  const credentialCols: Column<Credential>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "kind", header: "Kind", width: 110, render: (r) => <Kind>{r.kind}</Kind> },
    { key: "scope", header: "Scope", render: (r) => mono(r.scope) },
    {
      key: "owner",
      header: "Owner",
      render: (r) => {
        const owner = memberById(r.ownerId);
        return (
          <span className="inline-flex items-center gap-1.5">
            {owner && <Avatar member={owner} size={18} />}
            {owner?.name}
          </span>
        );
      },
    },
    { key: "used", header: "Last used", render: (r) => <span className="text-tertiary-foreground">{r.lastUsed}</span> },
  ];

  const packageCols: Column<Package>[] = [
    { key: "name", header: "Name", render: (r) => mono(r.name) },
    { key: "version", header: "Version", width: 100, render: (r) => mono(r.version) },
    { key: "publisher", header: "Publisher", render: (r) => <span className="text-secondary-foreground">{r.publisher}</span> },
    { key: "used", header: "Used by", align: "right", width: 90, render: (r) => `${r.usedBy} workflow${r.usedBy === 1 ? "" : "s"}` },
    { key: "updated", header: "Updated", render: (r) => <span className="text-tertiary-foreground">{r.updatedAgo}</span> },
  ];

  const globalCols: Column<GlobalValue>[] = [
    { key: "key", header: "Key", width: 220, render: (r) => mono(r.key) },
    { key: "value", header: "Value", render: (r) => (r.secret ? <span className="text-tertiary-foreground">••••••••</span> : mono(r.value)) },
    { key: "updated", header: "Updated", width: 160, render: (r) => <span className="text-tertiary-foreground">{r.updatedAgo}</span> },
  ];

  const rows = {
    Scheduled: narrow(
      schedules,
      (r) => [workflowName(r.workflowId), r.cadence, r.nextRun, r.lastRun],
      (r) => r.enabled,
    ),
    "Event triggers": narrow(
      eventTriggers,
      (r) => [workflowName(r.workflowId), r.event, r.condition, r.lastFired],
      (r) => r.enabled,
    ),
    Credentials: narrow(credentials, (r) => [r.name, r.kind, r.scope, memberById(r.ownerId)?.name]),
    Packages: narrow(packages, (r) => [r.name, r.version, r.publisher]),
    // Secret values are masked in the table, so they aren't searchable either.
    "Global values": narrow(globalValues, (r) => [r.key, r.secret ? "" : r.value]),
  };

  const counts: Record<Tab, number> = {
    Scheduled: rows.Scheduled.length,
    "Event triggers": rows["Event triggers"].length,
    Credentials: rows.Credentials.length,
    Packages: rows.Packages.length,
    "Global values": rows["Global values"].length,
  };

  const empty = isNarrowed(state) ? "Nothing matches the current search or filters." : "Nothing to show yet.";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Tabs (the page's search, filters, and New action live in the workspace header) */}
      <TabStrip
        ariaLabel="Manage"
        segments={TABS.map((t) => ({ id: t, label: t, badge: counts[t] }))}
        value={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {/* Table */}
      <div key={tab} className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-auto">
        <div className="min-w-[720px] px-3 py-2">
          {tab === "Scheduled" && <DataTable columns={scheduleCols} rows={rows.Scheduled} empty={empty} />}
          {tab === "Event triggers" && <DataTable columns={triggerCols} rows={rows["Event triggers"]} empty={empty} />}
          {tab === "Credentials" && <DataTable columns={credentialCols} rows={rows.Credentials} empty={empty} />}
          {tab === "Packages" && <DataTable columns={packageCols} rows={rows.Packages} empty={empty} />}
          {tab === "Global values" && <DataTable columns={globalCols} rows={rows["Global values"]} empty={empty} />}
        </div>
      </div>
    </div>
  );
}
