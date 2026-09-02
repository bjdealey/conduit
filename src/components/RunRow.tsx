import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronRight, Cpu, Workflow as WorkflowIcon } from "lucide-react";
import { explainRequirements, pickRunner } from "@conduit/domain";
import { useStore } from "../store";
import type { Run } from "../data/types";
import { RunStateChip } from "./Badges";
import { ActivityFeed } from "./ActivityFeed";
import { Reveal } from "./Reveal";

/**
 * Where a run was placed, and why.
 *
 * A placed run names its runner; a queued one is re-decided against the pool as it
 * stands, so the row shows the distributor's live reasoning instead of a blank. This
 * one line is the whole difference from a device list — the choice is visible and
 * challengeable rather than someone's undocumented habit.
 */
function placementOf(
  run: Run,
  requirements: Parameters<typeof pickRunner>[0] | undefined,
  pool: Parameters<typeof pickRunner>[1],
) {
  const placed = run.runnerId ? pool.find((r) => r.id === run.runnerId) : undefined;
  const why = requirements ? explainRequirements(requirements) : "";
  if (placed) return { label: placed.name, rationale: `Running on ${placed.name} — ${why}` };
  if (!requirements) return null;
  // Not placed yet, so this is a proposal against the pool as it stands. The arrow
  // keeps that distinction visible: a queued run has not landed anywhere.
  const { runner, runnerClass, rationale } = pickRunner(requirements, pool);
  return { label: runner ? `→ ${runner.name}` : `waiting · ${runnerClass}`, rationale };
}

/** A single run in a table/timeline. Expands to show its log (the shared
 *  <ActivityFeed>) and links out to the workflow it belongs to and any
 *  incident its failure spawned. Set `showWorkflow` in cross-workflow
 *  contexts (Activity) to surface the workflow name; omit it inside a single
 *  workflow's history. */
export function RunRow({ run, showWorkflow = false }: { run: Run; showWorkflow?: boolean }) {
  const { select, openSubview, workflowById, isMobile, runners } = useStore();
  const [open, setOpen] = useState(false);
  // Never-opened rows don't render their body at all. <Reveal> has to keep its
  // children mounted to be able to animate them closed, and a run's body carries
  // the whole log — so without this an Activity list of 200 runs would put 200
  // logs in the DOM whether or not anyone opened one. Same gate the library tree
  // uses on its branches, for the same reason.
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);
  const workflow = showWorkflow ? workflowById(run.workflowId) : undefined;
  const placement = placementOf(run, workflowById(run.workflowId)?.requirements, runners);
  const timing = `${run.startedAt} · ${run.duration}`;

  return (
    <div className="flex flex-col border-border-default border-b-[0.5px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="focusable flex items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-transparent-hover"
      >
        <ChevronRight
          size={13}
          strokeWidth={2}
          className="shrink-0 text-tertiary-foreground transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        />
        {/* Six columns across 390px is six unreadable columns, so on a phone the
            id, the placement and the timing drop to a second line under the name.
            Nothing is dropped: the placement is the one line that distinguishes
            this from a device list, and the id is how a run is talked about. */}
        {!isMobile && (
          <span className="w-20 shrink-0 font-departure-mono text-[0.7rem] text-tertiary-foreground">{run.id}</span>
        )}
        <RunStateChip state={run.state} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {showWorkflow ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <WorkflowIcon size={13} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
              <span className="truncate text-body-sm text-primary-foreground">{workflow?.name ?? run.workflowId}</span>
            </span>
          ) : (
            <span className="min-w-0 truncate text-body-sm text-secondary-foreground">{run.startedBy}</span>
          )}
          {isMobile && (
            <span className="flex flex-wrap items-center gap-x-2 font-departure-mono text-[0.65rem] text-tertiary-foreground">
              <span>{run.id}</span>
              {placement && (
                <span className="inline-flex items-center gap-1" title={placement.rationale}>
                  <Cpu size={11} strokeWidth={1.8} />
                  {placement.label}
                </span>
              )}
              <span>{timing}</span>
            </span>
          )}
        </span>
        {!isMobile && placement && (
          <span
            title={placement.rationale}
            className="inline-flex shrink-0 items-center gap-1 font-departure-mono text-[0.65rem] text-tertiary-foreground"
          >
            <Cpu size={11} strokeWidth={1.8} />
            {placement.label}
          </span>
        )}
        {!isMobile && (
          <span className="shrink-0 font-departure-mono text-[0.65rem] text-tertiary-foreground">{timing}</span>
        )}
      </button>
      {/* The chevron beside this row already animates its quarter-turn, so the
          disclosure it announces should move too — it used to snap, which read as
          the affordance and the content disagreeing about whether anything
          happened. <Reveal> is the app's answer to exactly this and is already
          carrying the library tree. */}
      <Reveal open={open}>
        <div className="px-4 pb-4 pt-1">
          {everOpened && (
            <>
              {placement && (
                <p className="mb-3 flex items-center gap-1.5 text-body-sm text-tertiary-foreground">
                  <Cpu size={13} strokeWidth={1.8} className="shrink-0" />
                  {placement.rationale}
                </p>
              )}
              {showWorkflow && (
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openSubview("workflows", "library")}
                    className="focusable inline-flex items-center gap-1 rounded-md bg-component px-2 py-1 text-body-sm text-secondary-foreground transition-colors hover:text-primary-foreground"
                  >
                    <WorkflowIcon size={13} strokeWidth={1.8} />
                    {workflow?.name ?? "Open workflow"}
                  </button>
                  <span className="text-body-sm text-tertiary-foreground">·</span>
                  <span className="text-body-sm text-tertiary-foreground">Triggered by {run.startedBy}</span>
                </div>
              )}
              <ActivityFeed events={run.activity} runState={run.state} />
              {run.issueId != null && (
                <button
                  type="button"
                  onClick={() => {
                    select(run.issueId!);
                    openSubview("activity", "issues");
                  }}
                  className="focusable inline-flex items-center gap-1 rounded-md bg-component px-2 py-1 text-body-sm text-secondary-foreground transition-colors hover:text-primary-foreground"
                >
                  Open incident #{run.issueId}
                  <ArrowUpRight size={14} strokeWidth={1.8} />
                </button>
              )}
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}
