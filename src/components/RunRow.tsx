import { useState } from "react";
import { ArrowUpRight, ChevronRight, Cpu, Workflow } from "lucide-react";
import { explainRequirements, pickRunner } from "@conduit/domain";
import { useStore } from "../store";
import { runners } from "../data/runners";
import type { Run } from "../data/types";
import { RunStateChip } from "./Badges";
import { ActivityFeed } from "./ActivityFeed";

/**
 * Where a run was placed, and why.
 *
 * A placed run names its runner; a queued one is re-decided against the pool as it
 * stands, so the row shows the distributor's live reasoning instead of a blank. This
 * one line is the whole difference from a device list — the choice is visible and
 * challengeable rather than someone's undocumented habit.
 */
function placementOf(run: Run, requirements: Parameters<typeof pickRunner>[0] | undefined) {
  const placed = run.runnerId ? runners.find((r) => r.id === run.runnerId) : undefined;
  const why = requirements ? explainRequirements(requirements) : "";
  if (placed) return { label: placed.name, rationale: `Running on ${placed.name} — ${why}` };
  if (!requirements) return null;
  // Not placed yet, so this is a proposal against the pool as it stands. The arrow
  // keeps that distinction visible: a queued run has not landed anywhere.
  const { runner, runnerClass, rationale } = pickRunner(requirements, runners);
  return { label: runner ? `→ ${runner.name}` : `waiting · ${runnerClass}`, rationale };
}

/** A single run in a table/timeline. Expands to show its log (the shared
 *  <ActivityFeed>) and links out to the automation it belongs to and any
 *  incident its failure spawned. Set `showAutomation` in cross-automation
 *  contexts (Activity) to surface the automation name; omit it inside a single
 *  automation's history. */
export function RunRow({ run, showAutomation = false }: { run: Run; showAutomation?: boolean }) {
  const { select, setView, automationById } = useStore();
  const [open, setOpen] = useState(false);
  const automation = showAutomation ? automationById(run.automationId) : undefined;
  const placement = placementOf(run, automationById(run.automationId)?.requirements);

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
        <span className="w-20 shrink-0 font-departure-mono text-[0.7rem] text-tertiary-foreground">{run.id}</span>
        <RunStateChip state={run.state} />
        {showAutomation ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <Workflow size={13} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
            <span className="truncate text-body-sm text-primary-foreground">{automation?.name ?? run.automationId}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-body-sm text-secondary-foreground">{run.startedBy}</span>
        )}
        {placement && (
          <span
            title={placement.rationale}
            className="inline-flex shrink-0 items-center gap-1 font-departure-mono text-[0.65rem] text-tertiary-foreground"
          >
            <Cpu size={11} strokeWidth={1.8} />
            {placement.label}
          </span>
        )}
        <span className="shrink-0 font-departure-mono text-[0.65rem] text-tertiary-foreground">
          {run.startedAt} · {run.duration}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          {placement && (
            <p className="mb-3 flex items-center gap-1.5 text-body-sm text-tertiary-foreground">
              <Cpu size={13} strokeWidth={1.8} className="shrink-0" />
              {placement.rationale}
            </p>
          )}
          {showAutomation && (
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("automations")}
                className="focusable inline-flex items-center gap-1 rounded-md bg-component px-2 py-1 text-body-sm text-secondary-foreground transition-colors hover:text-primary-foreground"
              >
                <Workflow size={13} strokeWidth={1.8} />
                {automation?.name ?? "Open automation"}
              </button>
              <span className="text-body-sm text-tertiary-foreground">·</span>
              <span className="text-body-sm text-tertiary-foreground">Triggered by {run.startedBy}</span>
            </div>
          )}
          <ActivityFeed events={run.activity} />
          {run.issueId != null && (
            <button
              type="button"
              onClick={() => {
                select(run.issueId!);
                setView("inbox");
              }}
              className="focusable inline-flex items-center gap-1 rounded-md bg-component px-2 py-1 text-body-sm text-secondary-foreground transition-colors hover:text-primary-foreground"
            >
              Open incident #{run.issueId}
              <ArrowUpRight size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
