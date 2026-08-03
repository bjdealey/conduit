import { type ReactNode } from "react";
import { Cpu, MonitorSmartphone, ShieldCheck, Zap } from "lucide-react";
import {
  RUNNER_CLASS_LABEL,
  poolByClass,
  type Runner,
  type RunnerClass,
  type RunnerState,
} from "@conduit/domain";
import { useStore } from "../store";
import { runners } from "../data/runners";
import { SplitView, Pane, DetailPane, ContextPane, EmptyDetail, PANE_WIDTH } from "./layout/SplitView";
import { isNarrowed, matchesQuery, ordered, passesFilter, resolveSort, type WorkspaceState } from "../lib/workspace";
import { workspaceControls } from "../data/workspaceControls";
import { Chip } from "./Chip";
import { StatTile } from "./StatTile";

/* =============================================================================
   Runners — the execution pool
   -----------------------------------------------------------------------------
   The screen that replaces a device list. A device list answers "which machine
   does this workflow live on"; this answers "what capacity exists right now",
   which is the only question worth asking once nobody assigns work by hand.

   So there is no assign control here, and no per-workflow column. A runner
   advertises a class and the auth models it can present; the distributor does the
   rest, per run. What the page shows instead is the pool changing — starting,
   draining, going offline — because that movement is the elasticity the model is
   sold on.
   ============================================================================= */

/** Run-state palette, reserved (never categorical) and always label-carried. */
export const RUNNER_STATE_ACCENT: Record<RunnerState, string> = {
  Starting: "amber",
  Idle: "gray",
  Busy: "blue",
  Draining: "amber",
  Offline: "tomato",
};

const CLASS_ICON: Record<RunnerClass, ReactNode> = {
  lightweight: <Zap size={15} strokeWidth={1.8} />,
  "windows-service-account": <ShieldCheck size={15} strokeWidth={1.8} />,
  "windows-interactive": <MonitorSmartphone size={15} strokeWidth={1.8} />,
};

/** One line on why a class exists, so the pool explains its own shape. */
const CLASS_BLURB: Record<RunnerClass, string> = {
  lightweight: "API-first work on cheap, stateless compute. Scales with demand.",
  "windows-service-account": "Headless Windows with a domain identity — Windows-integrated auth, no session.",
  "windows-interactive": "A logged-in Windows session, for work that genuinely drives a UI.",
};

function StateChip({ state }: { state: RunnerState }) {
  // Mono, like run states: a runner state sits beside a monospace runner name and
  // reads as a technical token rather than prose.
  return (
    <Chip tone={RUNNER_STATE_ACCENT[state]} mono className="shrink-0">
      {state}
    </Chip>
  );
}

/* ----------------------------------------------------------------- selection */

/** Runners narrowed and ordered by the workspace header, shared by both layouts. */
function visibleRunners(state: WorkspaceState): Runner[] {
  const rows = runners.filter(
    (r) =>
      matchesQuery(state.query, [r.name, r.runnerClass, r.state, r.platform, r.image]) &&
      passesFilter(state, "state", r.state) &&
      passesFilter(state, "class", r.runnerClass),
  );

  const { id, dir } = resolveSort(state, workspaceControls("runners", "")?.sorts ?? []);
  const compare: Record<string, (a: Runner, b: Runner) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    runs: (a, b) => a.runsCompleted - b.runsCompleted,
    state: (a, b) => a.state.localeCompare(b.state),
  };
  return ordered(rows, dir, compare[id] ?? compare.name);
}

/* ------------------------------------------------------------------ list mode */

function RunnerList({
  list,
  narrowed,
  selectedId,
  onSelect,
}: {
  list: Runner[];
  narrowed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {list.length === 0 && (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
            {narrowed ? "No runners match the current search or filters." : "The pool has scaled to zero."}
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          {list.map((r) => {
            const active = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.id)}
                aria-current={active ? "true" : undefined}
                className="focusable flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: `var(--${RUNNER_STATE_ACCENT[r.state]}-9)` }}
                />
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate font-departure-mono text-[0.72rem] text-primary-foreground">{r.name}</span>
                  <span className="truncate text-[0.72rem] text-tertiary-foreground">
                    {RUNNER_CLASS_LABEL[r.runnerClass]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Pane>
  );
}

/* ------------------------------------------------------------------ grid mode */

function RunnerCard({ runner, onOpen }: { runner: Runner; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pressable focusable flex flex-col gap-3 rounded-xl border-border-default border-[0.5px] bg-page p-4 text-left shadow-default transition-colors hover:border-border-strong"
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-departure-mono text-body-sm font-medium text-primary-foreground">{runner.name}</span>
        <StateChip state={runner.state} />
      </div>

      <span className="inline-flex items-center gap-1.5 truncate text-[0.72rem] text-tertiary-foreground">
        {CLASS_ICON[runner.runnerClass]}
        {RUNNER_CLASS_LABEL[runner.runnerClass]}
      </span>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <div className="flex items-center gap-4 text-body-sm text-tertiary-foreground">
        <span>
          <span className="text-secondary-foreground">{runner.runsCompleted}</span> runs
        </span>
        <span>up {runner.uptime}</span>
        {runner.ephemeral && <span className="ml-auto text-[0.72rem]">ephemeral</span>}
      </div>
    </button>
  );
}

/** Grid presentation: the pool grouped by class, so its shape is the first thing
 *  read. A class with nothing in it still shows — scaled to zero is a state. */
function RunnerGrid({ list, narrowed, onOpen }: { list: Runner[]; narrowed: boolean; onOpen: (id: string) => void }) {
  const groups = poolByClass(list);
  return (
    <DetailPane>
      <div className="scrollbar-none flex-1 overflow-y-auto p-5">
        {list.length === 0 ? (
          <p className="py-16 text-center text-body-sm text-tertiary-foreground">
            {narrowed ? "No runners match the current search or filters." : "The pool has scaled to zero."}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.runnerClass} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="flex items-center gap-2 text-body-base font-medium text-primary-foreground">
                    <span className="text-tertiary-foreground">{CLASS_ICON[group.runnerClass]}</span>
                    {RUNNER_CLASS_LABEL[group.runnerClass]}
                    <span className="text-tertiary-foreground">{group.runners.length}</span>
                  </h3>
                  <p className="text-body-sm text-tertiary-foreground">{CLASS_BLURB[group.runnerClass]}</p>
                </div>
                {group.runners.length === 0 ? (
                  <p className="rounded-xl border-border-default border-[0.5px] px-4 py-6 text-center text-body-sm text-tertiary-foreground">
                    Scaled to zero — nothing needs this class right now.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {group.runners.map((runner) => (
                      <RunnerCard key={runner.id} runner={runner} onOpen={() => onOpen(runner.id)} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </DetailPane>
  );
}

/* -------------------------------------------------------------------- detail */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-body-sm text-tertiary-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-body-sm text-primary-foreground">{children}</div>
    </div>
  );
}

/** The runner's facts. Note what isn't here: no assigned workflows, no install
 *  history, no patch level. An ephemeral runner has an image and nothing else to
 *  drift, which is exactly why this pane is short. */
function RunnerContext({ runner }: { runner: Runner }) {
  const accent = RUNNER_STATE_ACCENT[runner.state];
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-4">
        <div
          className="flex size-12 items-center justify-center rounded-xl"
          style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
        >
          <Cpu size={22} strokeWidth={1.7} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-departure-mono font-medium text-heading-4 text-primary-foreground">{runner.name}</h2>
          <StateChip state={runner.state} />
        </div>
      </div>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <div className="flex flex-col gap-1">
        <Row label="Class">{RUNNER_CLASS_LABEL[runner.runnerClass]}</Row>
        <Row label="OS">{runner.platform}</Row>
        <Row label="Lifetime">{runner.ephemeral ? "Ephemeral" : "Long-lived"}</Row>
        <Row label="Interactive">{runner.headed ? "Yes" : "No"}</Row>
      </div>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <div className="flex flex-col gap-1">
        <Row label="Image">
          <span className="truncate font-departure-mono text-[0.72rem] text-secondary-foreground">{runner.image}</span>
        </Row>
        <Row label="Uptime">{runner.uptime}</Row>
        <Row label="Runs">{runner.runsCompleted}</Row>
        {runner.currentRunId && (
          <Row label="Current run">
            <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{runner.currentRunId}</span>
          </Row>
        )}
      </div>
    </div>
  );
}

function RunnerMain({ runner }: { runner: Runner }) {
  return (
    <DetailPane>
      <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="State" value={runner.state} sub={runner.currentRunId ?? "no run in flight"} />
            <StatTile label="Runs" value={String(runner.runsCompleted)} sub="since it started" />
            <StatTile label="Uptime" value={runner.uptime} sub={runner.ephemeral ? "torn down after use" : "long-lived host"} />
          </div>

          <section className="flex flex-col gap-3">
            <h3 className="text-body-base font-medium text-primary-foreground">What it can carry</h3>
            <p className="text-body-sm text-tertiary-foreground">{CLASS_BLURB[runner.runnerClass]}</p>
            <div className="flex flex-wrap gap-1.5">
              {runner.authModels.map((model) => (
                <span
                  key={model}
                  className="rounded-md bg-component px-2 py-0.5 font-departure-mono text-[0.7rem] text-secondary-foreground"
                >
                  {model}
                </span>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-body-base font-medium text-primary-foreground">Assignment</h3>
            <p className="text-body-sm text-tertiary-foreground">
              Nothing is assigned to this runner. Work is placed here per run, by matching an
              workflow's declared requirements against the pool — so there is no configuration to
              drift and no machine to reserve.
            </p>
          </section>
        </div>
      </div>
    </DetailPane>
  );
}

function RunnerDetail({ runner }: { runner: Runner }) {
  return (
    <>
      <RunnerMain runner={runner} />
      <ContextPane>
        <RunnerContext runner={runner} />
      </ContextPane>
    </>
  );
}

/* --------------------------------------------------------------------- view */

/** Runners — the execution pool. List mode is the shared shell; grid mode groups
 *  the pool by class so its shape reads first. */
export function RunnersView() {
  const { viewMode, selectedRunnerId, selectRunner, controls } = useStore();
  const state = controls("runners");
  const list = visibleRunners(state);
  const narrowed = isNarrowed(state);
  const runner = selectedRunnerId ? runners.find((r) => r.id === selectedRunnerId) ?? null : null;

  if (viewMode("runners") === "grid") {
    return (
      <SplitView>
        {runner ? <RunnerDetail runner={runner} /> : <RunnerGrid list={list} narrowed={narrowed} onOpen={selectRunner} />}
      </SplitView>
    );
  }

  return (
    <SplitView>
      <RunnerList list={list} narrowed={narrowed} selectedId={selectedRunnerId} onSelect={selectRunner} />
      {runner ? <RunnerDetail runner={runner} /> : <EmptyDetail>Select a runner.</EmptyDetail>}
    </SplitView>
  );
}
