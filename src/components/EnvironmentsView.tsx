import { useMemo, useState, type ReactNode } from "react";
import { Boxes, GitBranch, Globe, Rocket } from "lucide-react";
import { useStore } from "../store";
import { environments, type Environment } from "../data/environments";
import { SurfaceChart } from "./SurfaceChart";
import { num } from "../lib/format";
import { SplitView, Pane, DetailPane, ContextPane, EmptyDetail, PANE_WIDTH } from "./layout/SplitView";
import { SegmentedControl } from "./SegmentedControl";
import { isNarrowed, matchesQuery, passesFilter, type WorkspaceState } from "../lib/workspace";

const TONE_SOLID: Record<Environment["statusTone"], string> = {
  ok: "var(--grass-9)",
  warn: "var(--amber-9)",
  error: "var(--tomato-9)",
};
const TONE_PREFIX: Record<Environment["statusTone"], string> = {
  ok: "grass",
  warn: "amber",
  error: "tomato",
};

function StatusChip({ env }: { env: Environment }) {
  const accent = TONE_PREFIX[env.statusTone];
  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.72rem] font-medium"
      style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${accent}-9)` }} />
      {env.status}
    </span>
  );
}

/* ----------------------------------------------------------------- selection */

/** Environments narrowed and ordered by the workspace header — shared by the list
 *  pane and the card wall. */
function visibleEnvironments(state: WorkspaceState): Environment[] {
  const rows = environments.filter(
    (e) =>
      matchesQuery(state.query, [e.name, e.url, e.branch, e.region, e.release]) &&
      passesFilter(state, "status", e.status),
  );

  const sorted = [...rows];
  switch (state.sort) {
    case "events":
      sorted.sort((a, b) => b.eventsPerMin - a.eventsPerMin);
      break;
    case "surfaces":
      sorted.sort((a, b) => b.surfaces - a.surfaces);
      break;
    // "name" is the default.
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

/* ------------------------------------------------------------------ list mode */

/** Left column: the environment list (mirrors the users list). Search and filters
 *  live in the shared workspace header. */
function EnvironmentList({
  list,
  narrowed,
  selectedId,
  onSelect,
}: {
  list: Environment[];
  narrowed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {list.length === 0 && (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
            {narrowed ? "No environments match the current search or filters." : "No environments."}
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          {list.map((e) => {
            const active = e.id === selectedId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onSelect(e.id)}
                aria-current={active ? "true" : undefined}
                className="focusable flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{ background: active ? "var(--color-transparent-hover)" : "transparent" }}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: TONE_SOLID[e.statusTone] }} />
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-body-sm text-primary-foreground">{e.name}</span>
                  <span className="truncate text-[0.72rem] text-tertiary-foreground">{e.url}</span>
                </div>
                <span aria-hidden className="shrink-0">
                  {e.regionFlag}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Pane>
  );
}

/* ------------------------------------------------------------------ grid mode */

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[0.72rem] text-tertiary-foreground">{label}</span>
      <span className="truncate text-body-sm text-primary-foreground">{children}</span>
    </div>
  );
}

/** A status card for one environment; clicking opens its detail. */
function EnvironmentCard({ env, onOpen }: { env: Environment; onOpen: () => void }) {
  const accent = TONE_PREFIX[env.statusTone];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pressable focusable flex flex-col gap-3 rounded-xl border-border-default border-[0.5px] bg-page p-4 text-left shadow-default transition-colors hover:border-border-strong"
    >
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: TONE_SOLID[env.statusTone] }} />
        <span className="text-body-base font-medium text-primary-foreground">{env.name}</span>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[0.72rem] font-medium"
          style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
        >
          {env.status}
        </span>
      </div>

      <span className="inline-flex items-center gap-1.5 truncate font-departure-mono text-[0.72rem] text-tertiary-foreground">
        <Globe size={13} strokeWidth={1.8} className="shrink-0" />
        {env.url}
      </span>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Meta label="Region">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>{env.regionFlag}</span>
            {env.region}
          </span>
        </Meta>
        <Meta label="Branch">
          <span className="inline-flex items-center gap-1.5 font-departure-mono text-[0.72rem]">
            <GitBranch size={13} strokeWidth={1.8} className="text-tertiary-foreground" />
            {env.branch}
          </span>
        </Meta>
        <Meta label="Latest release">
          <span className="font-departure-mono text-[0.72rem]">{env.release}</span>
        </Meta>
        <Meta label="Deployed">{env.deployedAgo}</Meta>
      </div>

      <div className="flex items-center gap-4 border-border-default border-t-[0.5px] pt-3 text-body-sm text-tertiary-foreground">
        <span>
          <span className="text-secondary-foreground">{env.surfaces}</span> surfaces
        </span>
        <span>
          <span className="text-secondary-foreground">{env.eventsPerMin}</span>/min
        </span>
      </div>
    </button>
  );
}

/** Grid presentation: a browseable wall of environment cards. Opening a card hides
 *  the wall and shows the environment detail (like the users grid). */
function EnvironmentGrid({ list, narrowed, onOpen }: { list: Environment[]; narrowed: boolean; onOpen: (id: string) => void }) {
  return (
    <DetailPane>
      <div className="scrollbar-none flex-1 overflow-y-auto p-5">
        {list.length === 0 ? (
          <p className="py-16 text-center text-body-sm text-tertiary-foreground">
            {narrowed ? "No environments match the current search or filters." : "No environments."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {list.map((env) => (
              <EnvironmentCard key={env.id} env={env} onOpen={() => onOpen(env.id)} />
            ))}
          </div>
        )}
      </div>
    </DetailPane>
  );
}

/* ------------------------------------------------------------------ detail */

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border-border-default border-[0.5px] bg-page p-4 shadow-default">
      <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">{label}</span>
      <span className="font-sans text-heading-3 font-medium text-primary-foreground">{value}</span>
      {sub && <span className="text-body-sm text-tertiary-foreground">{sub}</span>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-body-sm text-tertiary-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-body-sm text-primary-foreground">{children}</div>
    </div>
  );
}

/** The environment's facts, shown in the collapsible context pane (mirrors the
 *  users profile). */
function EnvironmentContext({ env }: { env: Environment }) {
  const accent = TONE_PREFIX[env.statusTone];
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-4">
        <div
          className="flex size-12 items-center justify-center rounded-xl"
          style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
        >
          <Boxes size={22} strokeWidth={1.7} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-sans font-medium text-heading-4 text-primary-foreground">{env.name}</h2>
          <StatusChip env={env} />
        </div>
      </div>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <div className="flex flex-col gap-1">
        <Row label="URL">
          <span className="inline-flex min-w-0 items-center gap-2">
            <Globe size={14} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
            <span className="truncate font-departure-mono text-[0.72rem]">{env.url}</span>
          </span>
        </Row>
        <Row label="Region">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden>{env.regionFlag}</span>
            {env.region}
          </span>
        </Row>
        <Row label="Branch">
          <span className="inline-flex items-center gap-2 font-departure-mono text-[0.72rem]">
            <GitBranch size={14} strokeWidth={1.8} className="text-tertiary-foreground" />
            {env.branch}
          </span>
        </Row>
      </div>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <div className="flex flex-col gap-1">
        <Row label="Latest release">
          <span className="truncate font-departure-mono text-[0.72rem] text-secondary-foreground">{env.release}</span>
        </Row>
        <Row label="Deployed">
          <span>{env.deployedAgo}</span>
        </Row>
        <Row label="Surfaces">
          <span>{env.surfaces}</span>
        </Row>
        <Row label="Events / min">
          <span>{num(env.eventsPerMin)}</span>
        </Row>
      </div>
    </div>
  );
}

const DETAIL_TABS = ["Overview", "Deployments"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

/** A short, deterministic deployment history for an environment (prototype data,
 *  derived from the environment so it stays stable across renders). */
function recentDeployments(env: Environment) {
  const times = [env.deployedAgo, "yesterday", "2 days ago", "5 days ago"];
  return times.map((when, i) => ({
    id: i === 0 ? env.release : `${env.release.slice(0, 12)}${((i * 37 + env.id.length) % 256).toString(16).padStart(2, "0")}`,
    branch: env.branch,
    when,
    state: i === 0 && env.status === "Building" ? "Building" : "Deployed",
  }));
}

function EnvironmentMain({ env }: { env: Environment }) {
  const [tab, setTab] = useState<DetailTab>("Overview");
  const deploys = useMemo(() => recentDeployments(env), [env]);

  return (
    <DetailPane>
      <div className="flex shrink-0 items-center gap-1 border-border-default border-b-[0.5px] px-3 py-2">
        <SegmentedControl
          variant="ghost"
          ariaLabel="Environment detail"
          segments={DETAIL_TABS.map((t) => ({ id: t, label: t, badge: t === "Deployments" ? deploys.length : undefined }))}
          value={tab}
          onChange={(id) => setTab(id as DetailTab)}
        />
      </div>

      {tab === "Overview" ? (
        <div key="overview" className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-8">
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Status" value={env.status} />
              <StatTile label="Surfaces" value={num(env.surfaces)} sub="deployed here" />
              <StatTile label="Events / min" value={num(env.eventsPerMin)} sub="last 10m" />
            </div>

            <section className="flex flex-col gap-3">
              <h3 className="text-body-base font-medium text-primary-foreground">Events / min</h3>
              <SurfaceChart seed={env.id.length + env.eventsPerMin} />
            </section>
          </div>
        </div>
      ) : (
        <div key="deploys" className="animate-in fade-in-0 duration-200 ease-out scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-3xl flex-col">
            {deploys.map((d, i) => {
              const accent = d.state === "Building" ? "amber" : "grass";
              return (
                <div key={i} className="flex items-center gap-3 border-border-default border-b-[0.5px] py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-component text-tertiary-foreground">
                    <Rocket size={15} strokeWidth={1.8} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate font-departure-mono text-[0.72rem] text-primary-foreground">{d.id}</span>
                    <span className="inline-flex items-center gap-1.5 font-departure-mono text-[0.72rem] text-tertiary-foreground">
                      <GitBranch size={12} strokeWidth={1.8} />
                      {d.branch}
                    </span>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[0.72rem] font-medium"
                    style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
                  >
                    {d.state}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[0.72rem] text-tertiary-foreground">{d.when}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DetailPane>
  );
}

/** The opened environment: overview / deployments (primary) + facts in the
 *  collapsible context pane. Shared by list and grid modes. */
function EnvironmentDetail({ env }: { env: Environment }) {
  return (
    <>
      <EnvironmentMain env={env} />
      <ContextPane>
        <EnvironmentContext env={env} />
      </ContextPane>
    </>
  );
}

/* --------------------------------------------------------------------- view */

/** Environments — deployment targets. List mode is the shared shell (list →
 *  overview/deployments → collapsible facts). Grid mode is a browseable wall of
 *  status cards; opening one shows its detail (like the users tab). */
export function EnvironmentsView() {
  const { viewMode, selectedEnvironmentId, selectEnvironment, controls } = useStore();
  const state = controls("environments");
  const list = visibleEnvironments(state);
  const narrowed = isNarrowed(state);
  const env = selectedEnvironmentId
    ? environments.find((e) => e.id === selectedEnvironmentId) ?? null
    : null;

  if (viewMode("environments") === "grid") {
    return (
      <SplitView>
        {env ? <EnvironmentDetail env={env} /> : <EnvironmentGrid list={list} narrowed={narrowed} onOpen={selectEnvironment} />}
      </SplitView>
    );
  }

  return (
    <SplitView>
      <EnvironmentList list={list} narrowed={narrowed} selectedId={selectedEnvironmentId} onSelect={selectEnvironment} />
      {env ? <EnvironmentDetail env={env} /> : <EmptyDetail>Select an environment.</EmptyDetail>}
    </SplitView>
  );
}
