import { useState, type ReactNode } from "react";
import { Plus, Workflow } from "lucide-react";
import { useStore } from "../store";
import { schedules, eventTriggers, credentials, packages, globalValues } from "../data/manage";
import type { Credential, EventTrigger, GlobalValue, Package, Schedule } from "../data/manage";
import { DataTable, type Column } from "./DataTable";
import { SegmentedControl } from "./SegmentedControl";
import { Avatar } from "./Avatar";
import { num } from "../lib/format";

const TABS = ["Scheduled", "Event triggers", "Credentials", "Packages", "Global values"] as const;
type Tab = (typeof TABS)[number];

/** Enabled / Paused state chip (reserved status palette, label-carried). */
function EnabledChip({ on }: { on: boolean }) {
  const accent = on ? "grass" : "gray";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.72rem] font-medium"
      style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      {on ? "Enabled" : "Paused"}
    </span>
  );
}

function Kind({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-component px-1.5 py-0.5 text-[0.72rem] text-secondary-foreground">
      {children}
    </span>
  );
}

const mono = (s: ReactNode) => <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{s}</span>;

/** A cell that names the automation an object drives and jumps to the library. */
function AutomationCell({ automationId }: { automationId: string }) {
  const { automationById, setView } = useStore();
  const automation = automationById(automationId);
  return (
    <button
      type="button"
      onClick={() => setView("automations")}
      className="focusable -mx-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-transparent-hover"
    >
      <Workflow size={13} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
      <span className="truncate text-body-sm text-primary-foreground">{automation?.name ?? automationId}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ view */

/** Manage — operational objects behind execution: schedules and event triggers
 *  that start automations, plus the credentials, packages and global values runs
 *  consume. Each tab is a token-styled table; rows link back to the automation. */
export function ManageView() {
  const { memberById, role } = useStore();
  const [tab, setTab] = useState<Tab>("Scheduled");
  const canCreate = role !== "user";

  const scheduleCols: Column<Schedule>[] = [
    { key: "automation", header: "Automation", render: (r) => <AutomationCell automationId={r.automationId} /> },
    { key: "cadence", header: "Cadence", render: (r) => r.cadence },
    { key: "next", header: "Next run", render: (r) => <span className="text-tertiary-foreground">{r.nextRun}</span> },
    { key: "last", header: "Last run", render: (r) => <span className="text-tertiary-foreground">{r.lastRun}</span> },
    { key: "target", header: "Target", render: (r) => mono(r.target) },
    { key: "status", header: "Status", width: 120, render: (r) => <EnabledChip on={r.enabled} /> },
  ];

  const triggerCols: Column<EventTrigger>[] = [
    { key: "automation", header: "Automation", render: (r) => <AutomationCell automationId={r.automationId} /> },
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
    { key: "used", header: "Used by", align: "right", width: 90, render: (r) => `${r.usedBy} automation${r.usedBy === 1 ? "" : "s"}` },
    { key: "updated", header: "Updated", render: (r) => <span className="text-tertiary-foreground">{r.updatedAgo}</span> },
  ];

  const globalCols: Column<GlobalValue>[] = [
    { key: "key", header: "Key", width: 220, render: (r) => mono(r.key) },
    { key: "value", header: "Value", render: (r) => (r.secret ? <span className="text-tertiary-foreground">••••••••</span> : mono(r.value)) },
    { key: "updated", header: "Updated", width: 160, render: (r) => <span className="text-tertiary-foreground">{r.updatedAgo}</span> },
  ];

  const counts: Record<Tab, number> = {
    Scheduled: schedules.length,
    "Event triggers": eventTriggers.length,
    Credentials: credentials.length,
    Packages: packages.length,
    "Global values": globalValues.length,
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Tabs + action */}
      <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
        <SegmentedControl
          variant="ghost"
          ariaLabel="Manage"
          segments={TABS.map((t) => ({ id: t, label: t, badge: counts[t] }))}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
        />
        {canCreate && (
          <button
            type="button"
            className="pressable focusable ml-auto inline-flex items-center gap-1 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover"
          >
            <Plus size={14} strokeWidth={2} />
            New
          </button>
        )}
      </div>

      {/* Table */}
      <div key={tab} className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-auto">
        <div className="min-w-[720px] px-3 py-2">
          {tab === "Scheduled" && <DataTable columns={scheduleCols} rows={schedules} empty="No schedules." />}
          {tab === "Event triggers" && <DataTable columns={triggerCols} rows={eventTriggers} empty="No event triggers." />}
          {tab === "Credentials" && <DataTable columns={credentialCols} rows={credentials} empty="No credentials." />}
          {tab === "Packages" && <DataTable columns={packageCols} rows={packages} empty="No packages." />}
          {tab === "Global values" && <DataTable columns={globalCols} rows={globalValues} empty="No global values." />}
        </div>
      </div>
    </div>
  );
}
