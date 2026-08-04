import {
  ACTIONS,
  actionById,
  actionsByPackage,
  allSteps,
  defaultConfig,
  effectiveRequirements,
  packagesForSteps,
  type StepAction,
} from "../data/actions";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_REQUIREMENTS,
  nextVersion,
  orderEvents,
  pickRunner,
  type RunEvent,
  type Runner,
  type WorkflowVersion,
} from "@conduit/domain";
import type { ActivityEvent, Workflow, WorkflowDraft, WorkflowStep, Run } from "../data/types";
import { workspaceControls } from "../data/workspaceControls";
import { relativeTime } from "./format";
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
export function paletteGroups(state: WorkspaceState, catalogue: readonly StepAction[] = ACTIONS): PaletteGroup[] {
  const keep = (action: StepAction) =>
    matchesQuery(state.query, [action.label, action.package, action.summary]) &&
    passesFilter(state, "package", action.package);

  const { id, dir } = resolveSort(state, workspaceControls("builder", "")?.sorts ?? []);

  if (id === "name") {
    const actions = ordered(catalogue.filter(keep), dir, (a, b) => a.label.localeCompare(b.label));
    return actions.length > 0 ? [{ package: null, actions }] : [];
  }

  const groups = actionsByPackage(catalogue)
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
    schemaVersion: CURRENT_SCHEMA_VERSION,
    versions: [],
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

/** Next free step id for a flow. Unique across the whole tree, not just the top
 *  level — a branch's contents are steps too, and a duplicate id inside an `else`
 *  would make selection ambiguous. */
export function nextStepId(steps: WorkflowStep[]): string {
  const taken = new Set(allSteps(steps).map((s) => s.id));
  let n = taken.size + 1;
  while (taken.has(`stp_${n}`)) n++;
  return `stp_${n}`;
}

/** A new action step, with the action's defaults filled in. */
export function newStep(actionId: string, steps: WorkflowStep[]): WorkflowStep {
  const action = actionById(actionId);
  return { kind: "action", id: nextStepId(steps), actionId, config: action ? defaultConfig(action) : {} };
}

/** A new, empty conditional. Both arms start empty so the author fills whichever
 *  they mean; an `if` with a pre-populated `else` invites a branch nobody wanted. */
export function newBranch(steps: WorkflowStep[]): WorkflowStep {
  return { kind: "branch", id: nextStepId(steps), condition: "{{ response.status }} == 200", then: [], else: [] };
}

/**
 * Move a step one place earlier or later, wherever it sits in the tree.
 *
 * A step only ever moves within the list that contains it: reordering across a branch
 * boundary would silently change whether a step is conditional, which is a different
 * edit from "move it up one" and shouldn't happen by accident.
 */
export function moveStep(steps: WorkflowStep[], id: string, direction: -1 | 1): WorkflowStep[] {
  const from = steps.findIndex((s) => s.id === id);
  if (from !== -1) {
    const to = from + direction;
    if (to < 0 || to >= steps.length) return steps;
    const next = [...steps];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  }
  // Not at this level — recurse into branches, rebuilding only the arm that changed.
  let changed = false;
  const next = steps.map((step) => {
    if (step.kind !== "branch") return step;
    const thenArm = moveStep(step.then, id, direction);
    const elseArm = moveStep(step.else, id, direction);
    if (thenArm === step.then && elseArm === step.else) return step;
    changed = true;
    return { ...step, then: thenArm, else: elseArm };
  });
  return changed ? next : steps;
}

/** Replace a step anywhere in the tree, leaving everything else identical. */
export function updateStep(steps: WorkflowStep[], id: string, patch: (step: WorkflowStep) => WorkflowStep): WorkflowStep[] {
  return steps.map((step) => {
    if (step.id === id) return patch(step);
    if (step.kind !== "branch") return step;
    return { ...step, then: updateStep(step.then, id, patch), else: updateStep(step.else, id, patch) };
  });
}

/** Remove a step anywhere in the tree. Removing a branch removes its arms with it. */
export function removeStep(steps: WorkflowStep[], id: string): WorkflowStep[] {
  return steps
    .filter((step) => step.id !== id)
    .map((step) => (step.kind === "branch" ? { ...step, then: removeStep(step.then, id), else: removeStep(step.else, id) } : step));
}

/** Add a step into a branch arm, or at the top level when no arm is named. */
export function addStepTo(
  steps: WorkflowStep[],
  target: { branchId: string; arm: "then" | "else" } | null,
  step: WorkflowStep,
): WorkflowStep[] {
  if (!target) return [...steps, step];
  return steps.map((s) => {
    if (s.kind !== "branch") return s;
    if (s.id === target.branchId) return { ...s, [target.arm]: [...s[target.arm], step] } as WorkflowStep;
    return { ...s, then: addStepTo(s.then, target, step), else: addStepTo(s.else, target, step) };
  });
}

/** Find a step anywhere in the tree. */
export function findStep(steps: readonly WorkflowStep[], id: string): WorkflowStep | undefined {
  return allSteps(steps).find((s) => s.id === id);
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
/** A one-line summary of what this version is, for the history list. */
function summarise(draft: WorkflowDraft): string {
  const count = allSteps(draft.steps).length;
  const steps = `${count} step${count === 1 ? "" : "s"}`;
  return draft.versions.length === 0 ? `First version — ${steps}` : `Edited — ${steps}`;
}

/**
 * Append a new version to the history.
 *
 * Every save cuts one. That looks noisy until the alternative is considered: if
 * saving mutates the approved version in place, an approval silently comes to cover
 * text nobody read, which is precisely what the review lifecycle exists to prevent.
 */
export function cutVersion(history: WorkflowVersion[], authoredBy: string, summary: string): WorkflowVersion[] {
  return [
    ...history,
    {
      version: nextVersion(history),
      authoredBy,
      authoredAt: "just now",
      summary,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  ];
}

export function commitDraft(
  workflows: Workflow[],
  draft: WorkflowDraft,
  author: string,
): { workflows: Workflow[]; id: string } {
  const { isNew, ...rest } = draft;
  const id = isNew ? workflowId(draft.name, workflows.map((a) => a.id)) : draft.id;
  const saved: Workflow = {
    ...rest,
    id,
    name: draft.name.trim() || "Untitled workflow",
    packages: packagesForSteps(draft.steps),
    requirements: effectiveRequirements(draft.requirements, draft.steps),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    versions: cutVersion(draft.versions, author, summarise(draft)),
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
 * A run of the workflow as it stands, the moment it is started.
 *
 * It carries the placement and nothing else, because nothing else has happened yet:
 * the log fills in as the engine reports it (`src/lib/execution.ts`), whether that
 * engine is in this tab or on a runner in the pool. What used to be here was a
 * plausible log written from the step list; a flow that really executes does not need
 * one, and a log that was written rather than observed is worse than no log.
 */
export function startedRun(workflow: Workflow, startedBy: string, runs: Run[], pool: readonly Runner[]): Run {
  const id = nextRunId(runs);
  // Placed, not assigned: the same distributor the scheduler uses picks the runner,
  // and its reasoning is written into the log so the choice is inspectable.
  const { runner, rationale } = pickRunner(workflow.requirements, pool);
  return {
    id,
    workflowId: workflow.id,
    // Queued until something reports: a run row that claims to be Running before any
    // engine has said so is the same fiction the fake log used to be.
    state: "Queued",
    trigger: "Manual",
    startedBy,
    startedAt: "just now",
    duration: "—",
    runnerId: runner?.id,
    activity: [controlPlaneNote(id, 1, `${runner ? `Placed on ${runner.name}` : "Waiting for a runner"} — ${rationale}`)],
  };
}

/**
 * A line the *control plane* wrote, in the run's log.
 *
 * Deliberately not a `RunEvent`: `sequence` belongs to the runner and starts at 1, so
 * numbering our own notes into the same series means the runner's first event and our
 * first note claim the same identity — and `orderEvents`, which de-duplicates on
 * exactly that, would quietly drop one of them. Its own id prefix keeps both.
 */
export function controlPlaneNote(runId: string, n: number, message: string): ActivityEvent {
  return { id: `${runId}-cp-${n}`, kind: "fact", time: "just now", title: message };
}

/** How each protocol event kind reads in the timeline the run viewer speaks. */
const EVENT_KIND: Record<RunEvent["kind"], ActivityEvent["kind"]> = {
  started: "status",
  "step-started": "status",
  "step-finished": "fact",
  log: "fact",
  failed: "problem",
  finished: "status",
};

/**
 * Protocol events rendered as the timeline the run viewer already speaks.
 *
 * The runner stamps `at` from its own clock in ISO, because that is the only sane
 * thing to send across machines; the timeline reads relative labels, because that is
 * what every other surface in the app shows. `relativeTime` passes an existing label
 * through untouched, so seeded runs still read as they did.
 */
export function runEventsToActivity(events: readonly RunEvent[]): ActivityEvent[] {
  return orderEvents(events).map((e) => ({
    id: `${e.runId}-${e.sequence}`,
    kind: EVENT_KIND[e.kind] ?? ("status" as const),
    time: relativeTime(e.at),
    title: e.message,
  }));
}
