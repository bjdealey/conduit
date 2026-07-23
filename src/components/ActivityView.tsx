import { useMemo, useState } from "react";
import { Workflow } from "lucide-react";
import { useStore } from "../store";
import { RUN_STATES, type Issue, type Run, type RunState } from "../data/types";
import { RUN_STATE_ACCENT, RunStateChip } from "./Badges";
import { RunRow } from "./RunRow";
import { SurfaceChart } from "./SurfaceChart";
import { num } from "../lib/format";

const TABS = ["In progress", "Historical", "Insights"] as const;
type Tab = (typeof TABS)[number];

const IN_PROGRESS: RunState[] = ["Running", "Queued"];
const HISTORICAL: RunState[] = ["Completed", "Failed"];

/* ------------------------------------------------------------------ runs list */

/** Runs grouped by state (in RUN_STATES order), mirroring the Inbox's
 *  group-by-status engine — here keyed on run state instead of incident status. */
function RunsList({ runs }: { runs: Run[] }) {
  const groups = useMemo(() => {
    const by = new Map<RunState, Run[]>();
    for (const r of runs) {
      const arr = by.get(r.state) ?? [];
      arr.push(r);
      by.set(r.state, arr);
    }
    return RUN_STATES.map((s) => ({ state: s, items: by.get(s) ?? [] })).filter((g) => g.items.length > 0);
  }, [runs]);

  if (runs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <span className="text-body-base font-medium text-secondary-foreground">No runs here</span>
        <span className="text-body-sm text-tertiary-foreground">Nothing to show in this prototype tab yet.</span>
      </div>
    );
  }

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto px-4 py-3">
      {groups.map((group) => (
        <section key={group.state} className="mb-4">
          <header className="flex items-center gap-2 px-2 py-2">
            <RunStateChip state={group.state} />
            <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{group.items.length}</span>
          </header>
          <div className="flex flex-col">
            {group.items.map((r) => (
              <RunRow key={r.id} run={r} showAutomation />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- incidents rail */

/** The merged incident feed alongside the automation runs. Incidents spun off an
 *  automation surface that automation; all are click-through to the Inbox. */
function IncidentsRail({ issues }: { issues: Issue[] }) {
  const { select, setView, automationById } = useStore();
  // Automation-linked incidents first (the run→incident story), then the rest.
  const ordered = useMemo(
    () => [...issues].sort((a, b) => Number(Boolean(b.automationId)) - Number(Boolean(a.automationId))),
    [issues],
  );

  const open = (id: number) => {
    select(id);
    setView("inbox");
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-border-default border-l-[0.5px]">
      <div className="flex items-center gap-2 border-border-default border-b-[0.5px] px-3 py-2.5">
        <span className="text-body-sm font-medium text-secondary-foreground">Incidents</span>
        <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{issues.length}</span>
      </div>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-0.5">
          {ordered.map((issue) => {
            const automation = issue.automationId ? automationById(issue.automationId) : undefined;
            const accent = issue.status === "Resolved" ? "grass" : "tomato";
            return (
              <button
                key={issue.id}
                type="button"
                onClick={() => open(issue.id)}
                className="focusable flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-transparent-hover"
              >
                <span className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
                  <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">#{issue.id}</span>
                  <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{issue.title}</span>
                </span>
                {automation && (
                  <span className="flex items-center gap-1.5 pl-4 text-[0.72rem] text-tertiary-foreground">
                    <Workflow size={12} strokeWidth={1.8} />
                    <span className="truncate">{automation.name}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------- insights */

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border-border-default border-[0.5px] bg-page p-4 shadow-default">
      <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">{label}</span>
      <span className="font-sans text-heading-3 font-medium text-primary-foreground">{value}</span>
      {sub && <span className="text-body-sm text-tertiary-foreground">{sub}</span>}
    </div>
  );
}

function Insights({ runs, automations, activeIncidents }: { runs: Run[]; automations: ReturnType<typeof useStore>["automations"]; activeIncidents: number }) {
  const counts = useMemo(() => {
    const c = { Queued: 0, Running: 0, Completed: 0, Failed: 0 } as Record<RunState, number>;
    for (const r of runs) c[r.state] += 1;
    return c;
  }, [runs]);

  const finished = counts.Completed + counts.Failed;
  const successRate = finished > 0 ? Math.round((counts.Completed / finished) * 100) : 0;
  const busiest = useMemo(() => [...automations].sort((a, b) => b.runCount - a.runCount).slice(0, 5), [automations]);
  const maxRuns = busiest[0]?.runCount ?? 1;

  // Run-outcome breakdown: a status-palette stacked bar (reserved colors, always
  // label-carried below), only states that occur, with a 2px surface gap between.
  const present = RUN_STATES.filter((s) => counts[s] > 0);
  const total = runs.length || 1;

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Recent runs" value={num(runs.length)} sub="last 24h" />
          <StatTile label="Success rate" value={`${successRate}%`} sub={`${counts.Completed}/${finished} finished`} />
          <StatTile label="Failed runs" value={num(counts.Failed)} sub="need attention" />
          <StatTile label="Active incidents" value={num(activeIncidents)} sub="from failures" />
        </div>

        {/* Run outcome breakdown */}
        <section className="flex flex-col gap-3">
          <h3 className="text-body-base font-medium text-primary-foreground">Run outcomes</h3>
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden">
            {present.map((s) => (
              <div
                key={s}
                className="h-full rounded-[3px] first:rounded-l-full last:rounded-r-full"
                style={{ flexGrow: counts[s], background: `var(--${RUN_STATE_ACCENT[s]}-9)`, minWidth: 6 }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {present.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-body-sm text-secondary-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${RUN_STATE_ACCENT[s]}-9)` }} />
                {s}
                <span className="text-tertiary-foreground">
                  {counts[s]} · {Math.round((counts[s] / total) * 100)}%
                </span>
              </span>
            ))}
          </div>
        </section>

        {/* Runs over time — reuses the surface events chart */}
        <section className="flex flex-col gap-3">
          <h3 className="text-body-base font-medium text-primary-foreground">Runs over time</h3>
          <SurfaceChart seed={runs.length + 7} />
        </section>

        {/* Busiest automations — magnitude, sequential single (brand) hue */}
        <section className="flex flex-col gap-3">
          <h3 className="text-body-base font-medium text-primary-foreground">Busiest automations</h3>
          <div className="flex flex-col gap-2.5">
            {busiest.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-body-sm text-primary-foreground">{a.name}</span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-component">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(4, (a.runCount / maxRuns) * 100)}%`, background: "var(--color-brand-solid)" }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-departure-mono text-[0.7rem] text-tertiary-foreground">
                    {num(a.runCount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ view */

/** Activity — automation runtime. Primary content is the run stream (In progress
 *  / Historical) with an Insights reporting tab; a merged incident feed rides
 *  alongside so failures and the incidents they spawn read together. */
export function ActivityView() {
  const { runs, issues, automations } = useStore();
  const [tab, setTab] = useState<Tab>("In progress");

  const inProgress = runs.filter((r) => IN_PROGRESS.includes(r.state));
  const historical = runs.filter((r) => HISTORICAL.includes(r.state));
  const activeIncidents = issues.filter((i) => i.status !== "Resolved").length;

  const tabCount: Record<Tab, number | null> = {
    "In progress": inProgress.length,
    Historical: historical.length,
    Insights: null,
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="focusable rounded-md px-2.5 py-1 text-body-sm transition-colors"
              style={{
                background: tab === t ? "var(--color-transparent-hover)" : "transparent",
                color: tab === t ? "var(--color-primary-foreground)" : "var(--color-tertiary-foreground)",
                fontWeight: tab === t ? 500 : 400,
              }}
            >
              {t}
              {tabCount[t] != null && (
                <span className="ml-1.5 font-departure-mono text-[0.65rem] text-tertiary-foreground">{tabCount[t]}</span>
              )}
            </button>
          ))}
        </div>

        <div key={tab} className="animate-in fade-in-0 duration-200 ease-out flex min-h-0 flex-1 flex-col">
          {tab === "In progress" && <RunsList runs={inProgress} />}
          {tab === "Historical" && <RunsList runs={historical} />}
          {tab === "Insights" && (
            <Insights runs={runs} automations={automations} activeIncidents={activeIncidents} />
          )}
        </div>
      </main>

      {tab !== "Insights" && <IncidentsRail issues={issues} />}
    </div>
  );
}
