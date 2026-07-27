import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Layers, Workflow } from "lucide-react";
import { useStore } from "../store";
import { RUN_STATES, type Automation, type Issue, type Run, type RunState } from "../data/types";
import { RUN_STATE_ACCENT, RunStateChip } from "./Badges";
import { RunRow } from "./RunRow";
import { ActivityFeed } from "./ActivityFeed";
import { SurfaceChart } from "./SurfaceChart";
import { agoLabel, durationSeconds, minutesAgo, num } from "../lib/format";
import { SplitView, Pane, DetailPane, ContextPane, PANE_WIDTH } from "./layout/SplitView";
import { SegmentedControl } from "./SegmentedControl";
import { isNarrowed, matchesQuery, passesFilter, type WorkspaceState } from "../lib/workspace";

const TABS = ["In progress", "Historical", "Insights"] as const;
type Tab = (typeof TABS)[number];

const IN_PROGRESS: RunState[] = ["Running", "Queued"];
const HISTORICAL: RunState[] = ["Completed", "Failed"];

/* ------------------------------------------------------------ filter + grouping */

/** A run passes the workspace header's search and filters. The search spans the
 *  fields an operator scans a run stream by — the run's own id, the automation it
 *  belongs to, who or what started it, and the machine it ran on. */
function runPasses(run: Run, automationName: string, state: WorkspaceState): boolean {
  return (
    matchesQuery(state.query, [run.id, automationName, run.startedBy, run.state, run.trigger, run.target]) &&
    passesFilter(state, "state", run.state) &&
    passesFilter(state, "trigger", run.trigger)
  );
}

/** Runs in the header's chosen order. Position on the timeline comes from the
 *  clock, so this is what the grouped stream reads. */
function sortRuns(runs: Run[], sort: string, nameOf: (id: string) => string): Run[] {
  const sorted = [...runs];
  switch (sort) {
    case "duration":
      sorted.sort((a, b) => (durationSeconds(b.duration) ?? 0) - (durationSeconds(a.duration) ?? 0));
      break;
    case "automation":
      sorted.sort((a, b) => nameOf(a.automationId).localeCompare(nameOf(b.automationId)) || byRecency(a, b));
      break;
    // "recent" is the default.
    default:
      sorted.sort(byRecency);
  }
  return sorted;
}

/** Newest first. Queued runs have no start time and lead the order — they're what
 *  happens next, not what happened longest ago. */
const byRecency = (a: Run, b: Run) => (minutesAgo(a.startedAt) ?? -1) - (minutesAgo(b.startedAt) ?? -1);

const isLive = (run: Run) => run.state === "Running" || run.state === "Queued";

/** One automation's slice of the run stream. Both the sources pane and the
 *  timeline's lanes are built from these, so the two read the same way. */
type RunGroup = {
  automation: Automation;
  /** The group's runs, newest first. */
  runs: Run[];
  failed: number;
  live: number;
  /** Minutes since the most recent start; null when nothing has started yet. */
  latest: number | null;
};

/** Runs bucketed per automation, most recently active first. */
function groupRuns(runs: Run[], automationById: (id: string) => Automation | undefined): RunGroup[] {
  const by = new Map<string, Run[]>();
  for (const run of runs) {
    const arr = by.get(run.automationId) ?? [];
    arr.push(run);
    by.set(run.automationId, arr);
  }

  const groups: RunGroup[] = [];
  for (const [automationId, items] of by) {
    const automation = automationById(automationId);
    if (!automation) continue;
    const started = items.map((r) => minutesAgo(r.startedAt)).filter((m): m is number => m !== null);
    groups.push({
      automation,
      runs: [...items].sort(byRecency),
      failed: items.filter((r) => r.state === "Failed").length,
      live: items.filter(isLive).length,
      latest: started.length > 0 ? Math.min(...started) : null,
    });
  }
  return groups.sort((a, b) => (a.latest ?? Infinity) - (b.latest ?? Infinity));
}

/* ------------------------------------------------------------------ sources pane */

/** One automation in the sources list: its latest state, how much it has run, and
 *  a failure count when it has one. */
function SourceRow({ group, active, onSelect }: { group: RunGroup; active: boolean; onSelect: () => void }) {
  const latestState = group.runs[0]?.state ?? "Queued";
  const accent = RUN_STATE_ACCENT[latestState];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className="focusable flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
      style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-body-sm text-primary-foreground">{group.automation.name}</span>
        <span className="truncate font-departure-mono text-[0.65rem] text-tertiary-foreground">
          {group.runs.length} {group.runs.length === 1 ? "run" : "runs"} ·{" "}
          {group.latest === null ? "queued" : agoLabel(group.latest)}
        </span>
      </div>
      {group.failed > 0 && (
        <span
          className="shrink-0 rounded-full px-1.5 font-departure-mono text-[0.65rem]"
          style={{ background: "var(--tomato-a3)", color: "var(--tomato-a11)" }}
        >
          {group.failed}
        </span>
      )}
    </button>
  );
}

/**
 * Left column: where the activity is coming from. Picking an automation scopes
 * the screen to that automation's runs; picking it again — or "All activity" —
 * clears the scope. This is navigation, so it stays with the pane; the search and
 * filters that narrow the whole page live in the workspace header.
 */
function ActivitySources({
  groups,
  total,
  live,
  narrowed,
  scopeId,
  onScope,
}: {
  groups: RunGroup[];
  total: number;
  live: number;
  narrowed: boolean;
  scopeId: string | null;
  onScope: (id: string | null) => void;
}) {
  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        <button
          type="button"
          onClick={() => onScope(null)}
          aria-current={scopeId === null ? "true" : undefined}
          className="focusable flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
          style={{ background: scopeId === null ? "var(--color-transparent-hover)" : "transparent" }}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-component text-tertiary-foreground">
            <Layers size={13} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">All activity</span>
          {live > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 font-departure-mono text-[0.65rem] text-tertiary-foreground">
              <span className="size-1.5 rounded-full" style={{ background: "var(--blue-9)" }} />
              {live}
            </span>
          )}
          <span className="shrink-0 font-departure-mono text-[0.65rem] text-tertiary-foreground">{total}</span>
        </button>

        <header className="flex items-center gap-2 px-3 py-2 pt-3">
          <span className="font-sans font-medium text-body-sm text-secondary-foreground">Automations</span>
          <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{groups.length}</span>
        </header>

        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
            {narrowed ? "No activity matches the current search or filters." : "No activity yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {groups.map((group) => (
              <SourceRow
                key={group.automation.id}
                group={group}
                active={group.automation.id === scopeId}
                onSelect={() => onScope(group.automation.id === scopeId ? null : group.automation.id)}
              />
            ))}
          </div>
        )}
      </div>
    </Pane>
  );
}

/* ------------------------------------------------------------------ runs list */

/** Nothing in this tab. When the runs are simply in the other stream tab — a
 *  scoped automation with history but nothing in flight — offer the way over. */
function NoRuns({
  hint,
  other,
}: {
  hint: string;
  other?: { label: string; count: number; onSelect: () => void };
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="text-body-base font-medium text-secondary-foreground">No runs here</span>
      <span className="text-body-sm text-tertiary-foreground">{hint}</span>
      {other && other.count > 0 && (
        <button
          type="button"
          onClick={other.onSelect}
          className="pressable focusable mt-1 inline-flex items-center gap-1.5 rounded-lg border-border-default border-[0.5px] px-2.5 py-1 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
        >
          {other.count} in {other.label}
        </button>
      )}
    </div>
  );
}

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

/* -------------------------------------------------------------------- timeline */

/** Spans the timeline can cover, in minutes. The first one that clears the oldest
 *  run in view wins, so the axis stays on round numbers as the data moves. */
const WINDOW_STEPS = [30, 60, 120, 180, 240, 360, 480, 720, 1440];

/** Lane geometry (px). Lanes and the axis share the same label column width
 *  (`w-52`), so the ticks, gridlines, and bars line up without measuring. */
const LANE_HEIGHT = 30;
const BAR_HEIGHT = 12;
/** Floor on a bar's width (% of the window) so a 3-second run is still clickable. */
const MIN_BAR = 1;
/** Where the axis ticks sit, as a fraction of the window (0 = oldest, 1 = now). */
const TICKS = [0, 0.25, 0.5, 0.75, 1];

/** The span the timeline covers: the smallest step that holds the oldest run in
 *  view, so the axis stays on round numbers without leaving dead space. */
function timelineWindow(groups: RunGroup[]): number {
  const starts = groups.flatMap((g) => g.runs.map((r) => minutesAgo(r.startedAt) ?? 0));
  const oldest = starts.length > 0 ? Math.max(...starts) : 0;
  return WINDOW_STEPS.find((step) => step >= oldest) ?? Math.ceil(oldest / 60) * 60;
}

/** A run's bar as percentages of the window, measured from the window's start.
 *  Null for a run that hasn't started (queued) — those pin to "now" instead. */
function barGeometry(run: Run, windowMinutes: number): { left: number; width: number } | null {
  const start = minutesAgo(run.startedAt);
  if (start === null) return null;
  const ran = (durationSeconds(run.duration) ?? 0) / 60;
  const left = Math.max(0, ((windowMinutes - start) / windowMinutes) * 100);
  const width = Math.min(100 - left, Math.max((ran / windowMinutes) * 100, MIN_BAR));
  return { left, width };
}

/** The vertical rules behind a lane. Every lane draws its own, so contiguous lanes
 *  read as one continuous gridline without a measured overlay. */
function LaneGrid() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {TICKS.map((f) => (
        <span
          key={f}
          className="absolute"
          style={{
            left: `${f * 100}%`,
            top: 0,
            bottom: 0,
            width: 1,
            // The right edge is "now" — drawn stronger than the older ticks.
            background: f === 1 ? "var(--color-border-strong)" : "var(--color-border-default)",
          }}
        />
      ))}
    </span>
  );
}

/** One automation's lane: its runs placed on the shared time axis. */
function TimelineLane({
  group,
  windowMinutes,
  onOpen,
}: {
  group: RunGroup;
  windowMinutes: number;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-52 shrink-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{group.automation.name}</span>
        <span className="shrink-0 font-departure-mono text-[0.65rem] text-tertiary-foreground">
          {group.runs.length}
        </span>
      </div>

      <div className="relative min-w-0 flex-1" style={{ height: LANE_HEIGHT }}>
        <LaneGrid />
        {group.runs.map((run) => {
          const accent = RUN_STATE_ACCENT[run.state];
          const geometry = barGeometry(run, windowMinutes);
          const label = `${run.id} · ${run.state} · ${run.startedAt} · ${run.duration}`;
          // Queued runs haven't started: they sit at "now", outlined rather than filled.
          const style = geometry
            ? { left: `${geometry.left}%`, width: `${geometry.width}%`, background: `var(--${accent}-9)` }
            : { right: 0, width: 10, background: `var(--${accent}-a5)`, border: `1px dashed var(--${accent}-8)` };
          return (
            <button
              key={run.id}
              type="button"
              onClick={() => onOpen(run.id)}
              title={label}
              aria-label={label}
              className="run-bar focusable pressable absolute rounded-[4px]"
              style={{ top: (LANE_HEIGHT - BAR_HEIGHT) / 2, height: BAR_HEIGHT, ...style }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Timeline layout: one lane per automation, runs placed on a shared time axis by
 * when they started and how long they ran. It shows what the grouped list can't —
 * cadence, overlap, and the gaps between runs — and clicking a run opens it, the
 * way the board and grid layouts open an item elsewhere in the app.
 */
function RunTimeline({ groups, onOpen }: { groups: RunGroup[]; onOpen: (id: string) => void }) {
  const windowMinutes = useMemo(() => timelineWindow(groups), [groups]);
  const states = useMemo(() => {
    const present = new Set(groups.flatMap((g) => g.runs.map((r) => r.state)));
    return RUN_STATES.filter((s) => present.has(s));
  }, [groups]);
  const total = groups.reduce((n, g) => n + g.runs.length, 0);

  if (groups.length === 0) return null;

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto px-5 py-4">
      {/* Window + legend. Run states use the reserved status palette, always
          label-carried, so the bars never rely on colour alone. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-body-sm text-secondary-foreground">Last {agoLabel(windowMinutes)}</span>
        <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">
          {total} {total === 1 ? "run" : "runs"} · {groups.length} automations
        </span>
        <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1">
          {states.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[0.72rem] text-tertiary-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${RUN_STATE_ACCENT[s]}-9)` }} />
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border-border-default border-[0.5px] bg-page px-4 py-3 shadow-default">
        {/* Time axis — oldest on the left, now on the right. */}
        <div className="flex items-center gap-3">
          <span className="w-52 shrink-0" />
          <div className="relative min-w-0 flex-1" style={{ height: 18 }}>
            {TICKS.map((f) => (
              <span
                key={f}
                className="absolute font-departure-mono text-[0.65rem] text-tertiary-foreground"
                style={{
                  left: `${f * 100}%`,
                  transform: f === 0 ? "none" : f === 1 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {agoLabel(windowMinutes * (1 - f))}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          {groups.map((group) => (
            <TimelineLane key={group.automation.id} group={group} windowMinutes={windowMinutes} onOpen={onOpen} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- run detail */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[0.72rem] text-tertiary-foreground">{label}</span>
      <span className="truncate text-body-sm text-primary-foreground">{children}</span>
    </div>
  );
}

/** A run opened from the timeline: its facts, then the run log. (The list layout
 *  expands runs in place instead — see <RunRow>.) */
function RunDetail({ run }: { run: Run }) {
  const { automationById, selectAutomation, select, setView } = useStore();
  const automation = automationById(run.automationId);

  return (
    <DetailPane>
      <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="font-departure-mono text-[0.72rem] text-tertiary-foreground">{run.id}</span>
              <RunStateChip state={run.state} />
            </div>
            <button
              type="button"
              onClick={() => {
                selectAutomation(run.automationId);
                setView("automations");
              }}
              className="focusable inline-flex w-fit items-center gap-2 rounded-lg px-1 text-left transition-colors hover:bg-transparent-hover"
            >
              <Workflow size={16} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
              <span className="font-sans font-medium text-heading-4 text-primary-foreground">
                {automation?.name ?? run.automationId}
              </span>
              <ArrowUpRight size={15} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label="Trigger">{run.trigger}</Fact>
            <Fact label="Started by">{run.startedBy}</Fact>
            <Fact label="Started">{run.startedAt}</Fact>
            <Fact label="Duration">{run.duration}</Fact>
            {run.target && <Fact label="Target">{run.target}</Fact>}
          </div>

          <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

          <section className="flex flex-col gap-3">
            <h3 className="text-body-base font-medium text-primary-foreground">Run log</h3>
            <ActivityFeed events={run.activity} />
          </section>

          {run.issueId != null && (
            <button
              type="button"
              onClick={() => {
                select(run.issueId!);
                setView("inbox");
              }}
              className="focusable inline-flex w-fit items-center gap-1 rounded-md bg-component px-2 py-1 text-body-sm text-secondary-foreground transition-colors hover:text-primary-foreground"
            >
              Open incident #{run.issueId}
              <ArrowUpRight size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </DetailPane>
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
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-border-default border-b-[0.5px] px-3 py-2.5">
        <span className="text-body-sm font-medium text-secondary-foreground">Incidents</span>
        <span className="font-departure-mono text-[0.65rem] text-tertiary-foreground">{issues.length}</span>
      </div>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {ordered.length === 0 ? (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
            No incidents for this automation.
          </p>
        ) : (
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
        )}
      </div>
    </div>
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

function Insights({ runs, automations, activeIncidents }: { runs: Run[]; automations: Automation[]; activeIncidents: number }) {
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

/**
 * Activity — automation runtime. The run stream (In progress / Historical) with an
 * Insights reporting tab, sourced from a searchable left pane and shadowed by the
 * merged incident feed, so failures and the incidents they spawn read together.
 *
 * Two layouts, driven by the global switcher (`VIEW_MODES.activity`):
 *  - **List** — the sources pane scopes a stream grouped by run state.
 *  - **Timeline** — a lane per automation on a shared time axis; opening a run
 *    replaces it with the run's detail, like the board/grid layouts elsewhere.
 */
export function ActivityView() {
  const {
    runs,
    issues,
    automationById,
    viewMode,
    selectedRunId,
    selectRun,
    runById,
    controls,
    sectionTab,
    setSectionTab,
  } = useStore();
  // The stream tabs are this page's section tabs, so the header's State filter can
  // offer just the states the open tab shows.
  const tab = (sectionTab("activity") || "In progress") as Tab;
  const setTab = (next: Tab) => setSectionTab("activity", next);
  const [scopeId, setScopeId] = useState<string | null>(null);

  const state = controls("activity");
  const timeline = viewMode("activity") === "timeline";
  // The scope belongs to the sources pane, which only the list layout shows. The
  // timeline's lanes already separate the automations, so it plots all of them —
  // and the scope is still there when you switch back.
  const scope = timeline ? null : scopeId;
  const nameOf = (id: string) => automationById(id)?.name ?? "";

  // The header narrows the whole screen; the scope then narrows it to one automation.
  const matched = useMemo(
    () => sortRuns(runs.filter((r) => runPasses(r, nameOf(r.automationId), state)), state.sort, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs, state, automationById],
  );
  const sources = useMemo(() => groupRuns(matched, automationById), [matched, automationById]);
  const visible = useMemo(
    () => (scope ? matched.filter((r) => r.automationId === scope) : matched),
    [matched, scope],
  );

  const tabRuns = visible.filter((r) => (tab === "Historical" ? HISTORICAL : IN_PROGRESS).includes(r.state));
  const tabCount: Record<Tab, number | null> = {
    "In progress": visible.filter((r) => IN_PROGRESS.includes(r.state)).length,
    Historical: visible.filter((r) => HISTORICAL.includes(r.state)).length,
    Insights: null,
  };
  /** The other stream tab — offered when this one is empty but that one isn't. */
  const otherTab: Tab = tab === "Historical" ? "In progress" : "Historical";

  const scopedIssues = scope ? issues.filter((i) => i.automationId === scope) : issues;
  const activeIncidents = scopedIssues.filter((i) => i.status !== "Resolved").length;
  const openRun = timeline && selectedRunId ? runById(selectedRunId) ?? null : null;

  const incidents = (
    <ContextPane width={PANE_WIDTH.list} scroll={false}>
      <IncidentsRail issues={scopedIssues} />
    </ContextPane>
  );

  // Timeline layout with a run opened: the run's detail takes the panel, and the
  // breadcrumb ("Activity / run_1045") goes back to the lanes.
  if (openRun) {
    return (
      <SplitView>
        <RunDetail run={openRun} />
        {incidents}
      </SplitView>
    );
  }

  return (
    <SplitView>
      {!timeline && (
        <ActivitySources
          groups={sources}
          total={matched.length}
          live={matched.filter(isLive).length}
          narrowed={isNarrowed(state)}
          scopeId={scope}
          onScope={setScopeId}
        />
      )}

      <DetailPane>
        <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
          <SegmentedControl
            variant="ghost"
            ariaLabel="Activity"
            segments={TABS.map((t) => ({ id: t, label: t, badge: tabCount[t] ?? undefined }))}
            value={tab}
            onChange={(id) => setTab(id as Tab)}
          />
        </div>

        <div key={tab} className="animate-in fade-in-0 duration-200 ease-out flex min-h-0 flex-1 flex-col">
          {tab === "Insights" ? (
            <Insights
              runs={visible}
              automations={sources.map((s) => s.automation)}
              activeIncidents={activeIncidents}
            />
          ) : tabRuns.length === 0 ? (
            <NoRuns
              hint={
                isNarrowed(state) || scope !== null
                  ? "No runs match the current search, filters, or scope."
                  : "Nothing to show in this prototype tab yet."
              }
              other={{ label: otherTab, count: tabCount[otherTab] ?? 0, onSelect: () => setTab(otherTab) }}
            />
          ) : timeline ? (
            <RunTimeline groups={groupRuns(tabRuns, automationById)} onOpen={selectRun} />
          ) : (
            <RunsList runs={tabRuns} />
          )}
        </div>
      </DetailPane>

      {tab !== "Insights" && incidents}
    </SplitView>
  );
}
