import { type ReactNode } from "react";
import { ArrowUpRight, Cpu, MonitorSmartphone, ShieldCheck, Zap } from "lucide-react";
import {
  READINESS_LABEL,
  RUNNER_CLASS_LABEL,
  explainRequirements,
  pickRunner,
  poolByClass,
  readinessMix,
  type Readiness,
  type Runner,
  type RunnerClass,
} from "@conduit/domain";
import { useStore } from "../store";
import { runners } from "../data/runners";
import { PLATFORM_LABEL, type Workflow, type MigrationState, type Run } from "../data/types";
import { DetailPane } from "./layout/SplitView";
import { RunStateChip } from "./Badges";
import { RUNNER_STATE_ACCENT } from "./RunnersView";
import { num } from "../lib/format";

/* =============================================================================
   Home — what the platform is doing, and why it is worth having
   -----------------------------------------------------------------------------
   The first screen. It answers, in order: what capacity exists, what still runs
   on the incumbent platform, and what share of the estate can move — because
   those are the three questions the money asks.

   Every number here is computed from the same rows the rest of the app renders.
   Nothing on this page is asserted: if the estate mix changes, this changes with
   it, which is the only way a screen like this stays honest under demo pressure.
   ============================================================================= */

const CLASS_ICON: Record<RunnerClass, ReactNode> = {
  lightweight: <Zap size={14} strokeWidth={1.8} />,
  "windows-service-account": <ShieldCheck size={14} strokeWidth={1.8} />,
  "windows-interactive": <MonitorSmartphone size={14} strokeWidth={1.8} />,
};

/** Readiness bands keep the reserved status palette: this is a state of the
 *  estate, not a category, and it is always shown with its label. */
const READINESS_ACCENT: Record<Readiness, string> = {
  "api-eligible": "grass",
  "entra-pending": "amber",
  "headed-bound": "gray",
};

const MIGRATION_ACCENT: Record<MigrationState, string> = {
  Migrated: "grass",
  Piloting: "blue",
  "Not started": "gray",
  "Won't move": "amber",
};

/* --------------------------------------------------------------------- parts */

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    // `min-w-0`, because a grid item's automatic minimum size is its content, not
    // zero: without it the widest row in a panel sizes the whole column, and the
    // page renders ~600px wide inside a 390px screen with the right-hand side
    // simply cut off. The same applies to any window narrower than the `lg`
    // breakpoint, where this column is implicit rather than declared.
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-body-base font-medium text-primary-foreground">{title}</h3>
        {hint && <p className="text-body-sm text-tertiary-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border-border-default border-[0.5px] bg-page p-4 shadow-default">
      <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">{label}</span>
      <span className="font-sans text-heading-3 font-medium text-primary-foreground">{value}</span>
      {sub && <span className="text-body-sm text-tertiary-foreground">{sub}</span>}
    </div>
  );
}

/** A proportional bar. Segments carry their own label, so the bar is a summary of
 *  the list beneath it rather than the only place the numbers appear. */
function Bar({ segments }: { segments: { id: string; share: number; accent: string }[] }) {
  const shown = segments.filter((s) => s.share > 0);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-component)" }}>
      {shown.map((s) => (
        <div key={s.id} style={{ width: `${s.share * 100}%`, background: `var(--${s.accent}-9)` }} />
      ))}
    </div>
  );
}

function Legend({ accent, label, count, share }: { accent: string; label: string; count: number; share: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      <span className="min-w-0 flex-1 truncate text-body-sm text-secondary-foreground">{label}</span>
      <span className="shrink-0 text-body-sm text-primary-foreground">{count}</span>
      <span className="w-12 shrink-0 text-right font-departure-mono text-[0.7rem] text-tertiary-foreground">
        {Math.round(share * 100)}%
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- pool panel */

/** The pool, by class. Counts are live states, not a capacity plan — a class that
 *  has scaled to zero says so rather than disappearing. */
function PoolPanel({ pool }: { pool: readonly Runner[] }) {
  const groups = poolByClass(pool);
  const busy = pool.filter((r) => r.state === "Busy").length;
  const moving = pool.filter((r) => r.state === "Starting" || r.state === "Draining").length;

  return (
    <Section
      title="Runner pool"
      hint="Capacity right now. Nothing is assigned to a runner — work is placed per run."
    >
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Runners up" value={String(pool.filter((r) => r.state !== "Offline").length)} sub={`${busy} busy`} />
        <Tile label="Changing" value={String(moving)} sub="starting or draining" />
        <Tile label="Classes" value={String(groups.filter((g) => g.runners.length > 0).length)} sub={`of ${groups.length} available`} />
      </div>

      <div className="flex flex-col rounded-xl border-border-default border-[0.5px] bg-page px-4 py-1 shadow-default">
        {groups.map((group, i) => (
          <div
            key={group.runnerClass}
            className={"flex items-center gap-2.5 border-border-default py-2.5 " + (i < groups.length - 1 ? "border-b-[0.5px]" : "")}
          >
            <span className="shrink-0 text-tertiary-foreground">{CLASS_ICON[group.runnerClass]}</span>
            <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">
              {RUNNER_CLASS_LABEL[group.runnerClass]}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {group.runners.length === 0 ? (
                <span className="text-[0.72rem] text-tertiary-foreground">scaled to zero</span>
              ) : (
                group.runners.map((r) => (
                  <span
                    key={r.id}
                    title={`${r.name} — ${r.state}`}
                    className="size-2.5 rounded-full"
                    style={{ background: `var(--${RUNNER_STATE_ACCENT[r.state]}-9)` }}
                  />
                ))
              )}
            </div>
            <span className="w-8 shrink-0 text-right font-departure-mono text-[0.7rem] text-tertiary-foreground">
              {group.runners.length}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- estate panel */

/** Where the estate runs today, and how far each part has moved. The point of
 *  showing "Won't move" alongside the rest is that it is a real answer — a number
 *  here beats discovering it in year three. */
function EstatePanel({ workflows, onOpen }: { workflows: Workflow[]; onOpen: () => void }) {
  const platforms = ["automation-anywhere", "conduit"] as const;
  const counts = platforms.map((platform) => ({
    platform,
    count: workflows.filter((a) => a.platform === platform).length,
  }));
  const total = workflows.length || 1;

  const migrations: MigrationState[] = ["Migrated", "Piloting", "Not started", "Won't move"];
  const byMigration = migrations.map((migration) => ({
    migration,
    count: workflows.filter((a) => a.migration === migration).length,
  }));

  return (
    <Section title="Estate" hint="One library, both platforms. Migration is per workflow and reversible.">
      <div className="grid grid-cols-2 gap-3">
        {counts.map(({ platform, count }) => (
          <Tile
            key={platform}
            label={PLATFORM_LABEL[platform]}
            value={String(count)}
            sub={`${Math.round((count / total) * 100)}% of the estate`}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border-border-default border-[0.5px] bg-page px-4 py-3 shadow-default">
        <Bar
          segments={byMigration.map((m) => ({
            id: m.migration,
            share: m.count / total,
            accent: MIGRATION_ACCENT[m.migration],
          }))}
        />
        <div className="flex flex-col">
          {byMigration.map((m) => (
            <Legend
              key={m.migration}
              accent={MIGRATION_ACCENT[m.migration]}
              label={m.migration}
              count={m.count}
              share={m.count / total}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="focusable -mx-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-body-sm text-secondary-foreground transition-colors hover:text-primary-foreground"
        >
          Open the library
          <ArrowUpRight size={14} strokeWidth={1.8} />
        </button>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------- readiness panel */

/** The workload mix, derived from each workflow's declared requirements rather
 *  than from a slide. `entra-pending` is the band that shrinks on its own as
 *  target systems move to Entra — which is the compounding the business case rests
 *  on, and the number to watch if it stalls. */
function ReadinessPanel({ workflows }: { workflows: Workflow[] }) {
  const mix = readinessMix(workflows);
  const entra = mix.find((m) => m.readiness === "entra-pending");

  return (
    <Section
      title="Readiness"
      hint="What could run on lightweight compute — now, next, and not for a while."
    >
      <div className="flex flex-col gap-2 rounded-xl border-border-default border-[0.5px] bg-page px-4 py-3 shadow-default">
        <Bar
          segments={mix.map((m) => ({ id: m.readiness, share: m.share, accent: READINESS_ACCENT[m.readiness] }))}
        />
        <div className="flex flex-col">
          {mix.map((m) => (
            <Legend
              key={m.readiness}
              accent={READINESS_ACCENT[m.readiness]}
              label={READINESS_LABEL[m.readiness]}
              count={m.count}
              share={m.share}
            />
          ))}
        </div>
        {entra && entra.count > 0 && (
          <p className="border-border-default border-t-[0.5px] pt-3 text-body-sm text-tertiary-foreground">
            {entra.count} {entra.count === 1 ? "workflow runs" : "workflows run"} on a Windows service-account
            runner only because of Windows-integrated auth. Each becomes API-eligible when its target system
            finishes moving to Entra — a pace set by the app owners, not by this platform.
          </p>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ in-flight panel */

/** Runs in flight, each showing where it was placed and why.
 *
 *  A queued run is re-decided live against the current pool, so the rationale on
 *  screen is the distributor's actual reasoning rather than a stored string — and
 *  when nothing fits, it says that too. */
function InFlightPanel({ runs, workflows, onOpen }: { runs: Run[]; workflows: Workflow[]; onOpen: () => void }) {
  const live = runs.filter((r) => r.state === "Running" || r.state === "Queued");
  const workflowOf = (id: string) => workflows.find((a) => a.id === id);

  return (
    <Section title="In flight" hint="Every placement, with the reason it was made.">
      <div className="flex flex-col rounded-xl border-border-default border-[0.5px] bg-page px-4 py-1 shadow-default">
        {live.length === 0 && <p className="py-6 text-center text-body-sm text-tertiary-foreground">Nothing running.</p>}
        {live.map((run, i) => {
          const workflow = workflowOf(run.workflowId);
          const placed = run.runnerId ? runners.find((r) => r.id === run.runnerId) : null;
          // Queued work has no placement yet — ask the distributor now, so the row
          // shows where it would go rather than an empty cell.
          const proposed = workflow && !placed ? pickRunner(workflow.requirements, runners) : null;
          // Every row carries its reason, placed or not. A row that just says
          // "placed" is the opaque hand-off this platform exists to replace.
          const why = workflow ? explainRequirements(workflow.requirements) : "";
          const target = placed?.name ?? proposed?.runner?.name;

          return (
            <div
              key={run.id}
              className={"flex items-center gap-3 border-border-default py-2.5 " + (i < live.length - 1 ? "border-b-[0.5px]" : "")}
            >
              <RunStateChip state={run.state} />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-body-sm text-primary-foreground">
                  {workflow?.name ?? run.workflowId}
                </span>
                <span className="truncate text-[0.72rem] text-tertiary-foreground" title={why}>
                  {why}
                </span>
              </div>
              <span
                title={placed ? `Running on ${placed.name}` : `Next free ${proposed?.runnerClass ?? "runner"}`}
                className="inline-flex shrink-0 items-center gap-1.5 font-departure-mono text-[0.7rem] text-secondary-foreground"
              >
                <Cpu size={12} strokeWidth={1.8} className="text-tertiary-foreground" />
                {placed ? target : target ? `→ ${target}` : `waiting · ${proposed?.runnerClass ?? "unplaced"}`}
              </span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="focusable -mx-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-body-sm text-secondary-foreground transition-colors hover:text-primary-foreground"
      >
        Open Activity
        <ArrowUpRight size={14} strokeWidth={1.8} />
      </button>
    </Section>
  );
}

/* --------------------------------------------------------------------- view */

/** Home — the landing view. Pool, estate, readiness, and what's running. */
export function HomeView() {
  const { workflows, runs, setView } = useStore();

  return (
    <DetailPane>
      <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-8">
          <header className="flex flex-col gap-1">
            <h2 className="font-sans text-heading-3 font-medium text-primary-foreground">Overview</h2>
            <p className="text-body-sm text-tertiary-foreground">
              {num(workflows.length)} workflows across {new Set(workflows.map((a) => a.platform)).size} platforms,
              running on a pool of {runners.filter((r) => r.state !== "Offline").length} runners.
            </p>
          </header>

          <div className="grid gap-8 lg:grid-cols-2">
            <PoolPanel pool={runners} />
            <EstatePanel workflows={workflows} onOpen={() => setView("workflows")} />
            <ReadinessPanel workflows={workflows} />
            <InFlightPanel runs={runs} workflows={workflows} onOpen={() => setView("activity")} />
          </div>
        </div>
      </div>
    </DetailPane>
  );
}
