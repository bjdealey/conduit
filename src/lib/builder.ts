import { ACTIONS, actionById, actionsByPackage, defaultConfig, effectiveRequirements, packagesForSteps, type StepAction } from "../data/actions";
import { DEFAULT_REQUIREMENTS, pickRunner, type Runner } from "@conduit/domain";
import type { Workflow, WorkflowDraft, WorkflowStep, Run } from "../data/types";
import { workspaceControls } from "../data/workspaceControls";
import { matchesQuery, ordered, passesFilter, resolveSort, type WorkspaceState } from "./workspace";

/* =============================================================================
   Workflow builder logic
   -----------------------------------------------------------------------------
   The pure half of the authoring screen: starting a draft, adding and moving
   steps, committing a draft back to the library, and firing a test run. Kept out
   of the component so the rules — ids, derived packages, where a saved draft
   lands — can be read and tested on their own.
   ============================================================================= */

/** A section of the palette. `package` is null for the flat, alphabetical
 *  presentation (sorting by name drops the grouping). */
export type PaletteGroup = { package: string | null; actions: StepAction[] };

/**
 * The palette, narrowed by the workspace header: its search matches an action's
 * label, package, or summary, its Package filter keeps one package, and its sort
 * chooses between the grouped view and one alphabetical list.
 */
export function paletteGroups(state: WorkspaceState): PaletteGroup[] {
  const keep = (action: StepAction) =>
    matchesQuery(state.query, [action.label, action.package, action.summary]) &&
    passesFilter(state, "package", action.package);

  const { id, dir } = resolveSort(state, workspaceControls("builder", "")?.sorts ?? []);

  if (id === "name") {
    const actions = ordered(ACTIONS.filter(keep), dir, (a, b) => a.label.localeCompare(b.label));
    return actions.length > 0 ? [{ package: null, actions }] : [];
  }

  const groups = actionsByPackage()
    .map((group) => ({ package: group.package as string | null, actions: group.actions.filter(keep) }))
    .filter((group) => group.actions.length > 0);
  return dir === "desc" ? [...groups].reverse() : groups;
}

/** A blank workflow, ready to author. New work starts private and as a Draft;
 *  it isn't in the library until it's saved. */
export function blankDraft(ownerId: string, folderId: string): WorkflowDraft {
  return {
    id: "",
    name: "",
    description: "",
    folderId,
    visibility: "private",
    status: "Draft",
    ownerId,
    platform: "conduit",
    migration: "Migrated",
    requirements: { ...DEFAULT_REQUIREMENTS },
    trigger: { kind: "Manual", detail: "Owner and admins" },
    steps: [],
    runCount: 0,
    successRate: 0,
    lastRunAt: "never",
    updatedAgo: "just now",
    packages: [],
    references: [],
    isNew: true,
  };
}

/** Next free step id for a flow. Ids only need to be unique within the flow, so
 *  they stay readable rather than random. */
export function nextStepId(steps: WorkflowStep[]): string {
  const taken = new Set(steps.map((s) => s.id));
  let n = steps.length + 1;
  while (taken.has(`stp_${n}`)) n++;
  return `stp_${n}`;
}

/** A new step for an action, with the action's defaults filled in. */
export function newStep(actionId: string, steps: WorkflowStep[]): WorkflowStep {
  const action = actionById(actionId);
  return { id: nextStepId(steps), actionId, config: action ? defaultConfig(action) : {} };
}

/** Move a step one place earlier or later. Out-of-range moves are no-ops, so the
 *  first step's "up" and the last step's "down" simply do nothing. */
export function moveStep(steps: WorkflowStep[], id: string, direction: -1 | 1): WorkflowStep[] {
  const from = steps.findIndex((s) => s.id === id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= steps.length) return steps;
  const next = [...steps];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** A readable, collision-free id for a new workflow, from its name. */
export function workflowId(name: string, taken: string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = `wf_${slug || "workflow"}`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** What a draft still needs before it can be saved or run. Empty = good to go. */
export function draftProblems(draft: WorkflowDraft): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push("Give the workflow a name.");
  if (draft.steps.length === 0) problems.push("Add at least one step.");
  return problems;
}

/**
 * Commit a draft to the library: a new workflow is appended with a generated
 * id, an existing one is replaced in place. `packages` is recomputed from the
 * steps, so an workflow's dependencies always match what it actually does — and
 * `requirements` is raised to the floor its steps impose, so a flow can never be
 * placed on a runner that can't actually carry it.
 */
export function commitDraft(
  workflows: Workflow[],
  draft: WorkflowDraft,
): { workflows: Workflow[]; id: string } {
  const { isNew, ...rest } = draft;
  const id = isNew ? workflowId(draft.name, workflows.map((a) => a.id)) : draft.id;
  const saved: Workflow = {
    ...rest,
    id,
    name: draft.name.trim() || "Untitled workflow",
    packages: packagesForSteps(draft.steps),
    requirements: effectiveRequirements(draft.requirements, draft.steps),
    updatedAgo: "just now",
  };
  return {
    workflows: isNew ? [...workflows, saved] : workflows.map((a) => (a.id === id ? saved : a)),
    id,
  };
}

/** Next run id, continuing the library's numbering. */
export function nextRunId(runs: Run[]): string {
  const highest = runs.reduce((max, run) => {
    const n = Number(run.id.replace(/\D/g, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 1000);
  return `run_${highest + 1}`;
}

/**
 * A test run of the workflow as it stands: in-flight, manually triggered, with
 * a log that walks the flow — so the Activity stream shows what the builder just
 * launched instead of a placeholder.
 */
export function testRun(workflow: Workflow, startedBy: string, runs: Run[], pool: readonly Runner[]): Run {
  const id = nextRunId(runs);
  // Placed, not assigned: the same distributor the scheduler uses picks the runner,
  // and its reasoning is written into the log so the choice is inspectable.
  const { runner, rationale } = pickRunner(workflow.requirements, pool);
  return {
    id,
    workflowId: workflow.id,
    state: runner ? "Running" : "Queued",
    trigger: "Manual",
    startedBy,
    startedAt: "just now",
    duration: "2 s",
    runnerId: runner?.id,
    activity: [
      { id: `${id}-1`, kind: "status", time: "just now", title: "Test run started from the builder" },
      {
        id: `${id}-p`,
        kind: "fact",
        time: "just now",
        title: runner ? `Placed on ${runner.name}` : "Waiting for a runner",
        body: rationale,
      },
      ...workflow.steps.map((step, i) => ({
        id: `${id}-s${i + 1}`,
        kind: "fact" as const,
        time: "just now",
        title: `${i + 1}. ${actionById(step.actionId)?.label ?? step.actionId}`,
      })),
    ],
  };
}
