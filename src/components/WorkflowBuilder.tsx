import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Package, Play, Plus, Split, Trash2, Workflow as WorkflowIcon, Zap } from "lucide-react";
import { useStore } from "../store";
import { actionById, packagesForSteps, stepSummary, type ActionField } from "../data/actions";
import {
  RUN_TRIGGERS,
  type BranchStep,
  type Folder,
  type RunTrigger,
  type Visibility,
  type WorkflowDraft,
  type WorkflowStep,
} from "../data/types";
import {
  addStepTo,
  draftProblems,
  findStep,
  moveStep,
  newBranch,
  newStep,
  paletteGroups,
  removeStep,
  updateStep,
  type PaletteGroup,
} from "../lib/builder";
import { unexecutableSteps } from "../lib/execution";
import { isExecutable } from "@conduit/runtime";
import { isNarrowed } from "../lib/workspace";
import { SplitView, Pane, DetailPane, ContextPane, PANE_WIDTH } from "./layout/SplitView";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { Chip } from "./Chip";
import { Button } from "./Button";

/* =============================================================================
   The workflow builder
   -----------------------------------------------------------------------------
   Where workflows are actually made: a palette of actions on the left, the
   flow in the middle, and the configuration of whatever is selected on the right.
   It takes over the workspace (like Settings) rather than living in a pane,
   because authoring wants the room.

   The flow is the document: its title, its trigger, and its ordered steps are all
   selectable, and whatever is selected is configured in the right-hand pane.
   Nothing is written to the library until Save — see `lib/builder.ts` for what
   committing a draft does.

   It's a view like any other, so it inherits the shared chrome: the workspace
   header's search and Package filter narrow the palette, the titlebar's switcher
   picks between the Steps list and the Diagram, and the info-pane toggle hides
   the configuration column.
   ============================================================================= */

/** What the right-hand pane is configuring. */
type Selection = { kind: "workflow" } | { kind: "trigger" } | { kind: "step"; id: string };

const TRIGGER_HINT: Record<RunTrigger, string> = {
  Manual: "Who may start it by hand",
  Schedule: "Cadence, e.g. Every 15 minutes",
  Event: "Event key, e.g. user.signup",
};

/* -------------------------------------------------------------------- fields */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.72rem] text-tertiary-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg bg-component px-2.5 py-1.5 text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground";

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />;
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { id: string; label: string })[];
}) {
  const items = options.map((o) => (typeof o === "string" ? { id: o, label: o } : o));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass + " cursor-pointer"}>
      {items.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** "Shared / Monitoring / Synthetics" — a folder's ancestry, for the folder picker. */
function folderPath(folderId: string, folders: readonly Folder[]): string {
  const names: string[] = [];
  let cur = folders.find((f) => f.id === folderId);
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined;
  }
  return names.join(" / ");
}

/** One action field, rendered by kind. */
function ActionInput({ field, value, onChange }: { field: ActionField; value: string; onChange: (v: string) => void }) {
  if (field.kind === "choice") return <SelectInput value={value} onChange={onChange} options={field.options ?? []} />;
  if (field.kind === "long")
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className={inputClass + " resize-none font-departure-mono text-[0.72rem]"}
      />
    );
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      inputMode={field.kind === "number" ? "numeric" : undefined}
      className={inputClass}
    />
  );
}

/* ------------------------------------------------------------------- palette */

type PaletteProps = {
  groups: PaletteGroup[];
  narrowed: boolean;
  onAdd: (actionId: string) => void;
  onAddBranch: () => void;
};

/** The catalogue of actions a flow can be built from. The workspace header's
 *  search, Package filter, and sort decide what's in `groups` — sorting by name
 *  flattens the package grouping into one alphabetical list.
 *
 *  Unwrapped, because it has two homes: a fixed-width left column on desktop, and
 *  a sheet on a phone. The column is a desktop idea; adding a step isn't. */
function PaletteBody({ groups, narrowed, onAdd, onAddBranch }: PaletteProps) {
  return (
    <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
      {/* Control flow isn't a package, so it sits above the catalogue rather than
          inside it — a conditional is something the builder does, not something a
          node type provides. */}
      <button
        type="button"
        onClick={onAddBranch}
        className="focusable mb-2 flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-transparent-hover"
      >
        <span className="flex items-center gap-2">
          <Split size={14} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
          <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">Add a condition</span>
          <Plus size={13} strokeWidth={2} className="shrink-0 text-tertiary-foreground" />
        </span>
        <span className="text-[0.72rem] leading-tight text-tertiary-foreground">
          Branch the flow on a value from an earlier step.
        </span>
      </button>
      {groups.length === 0 && (
        <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">
          {narrowed ? "No actions match the current search or filter." : "No actions available."}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.package ?? "all"} className="mb-2">
          {group.package && (
            <header className="flex items-center gap-2 px-3 py-2">
              <Package size={13} strokeWidth={1.8} className="text-tertiary-foreground" />
              <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{group.package}</span>
            </header>
          )}
          <div className="flex flex-col gap-0.5">
            {group.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onAdd(action.id)}
                className="focusable group flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-transparent-hover"
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">{action.label}</span>
                  {/* Surfaced but unbuilt — the node interface holds it, the step
                      doesn't execute yet. */}
                  {action.readiness === "roadmap" && (
                    <Chip tone="gray" mono dot={false} className="shrink-0">
                      roadmap
                    </Chip>
                  )}
                  {/* Built, authorable, and nothing in the pool executes it yet.
                      Distinct from `roadmap`, which is a node type nobody has built —
                      and worth saying here, because a flow only finds out at the step. */}
                  {action.readiness !== "roadmap" && !isExecutable(action.id) && (
                    <Chip tone="gray" mono dot={false} className="shrink-0">
                      no runner
                    </Chip>
                  )}
                  {!group.package && (
                    <span className="shrink-0 font-departure-mono text-[0.65rem] text-tertiary-foreground">
                      {action.package}
                    </span>
                  )}
                  <Plus size={13} strokeWidth={2} className="shrink-0 text-tertiary-foreground" />
                </span>
                <span className="text-[0.72rem] leading-tight text-tertiary-foreground">{action.summary}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The catalogue as the builder's left column. */
function Palette(props: PaletteProps) {
  return (
    <Pane width={PANE_WIDTH.list}>
      <PaletteBody {...props} />
    </Pane>
  );
}

/* ---------------------------------------------------------------------- flow */

/** One step in the flow: its position, what it does, and the controls to move or
 *  remove it (revealed on hover/selection so the list stays calm). */
function StepRow({
  step,
  index,
  count,
  active,
  onSelect,
  onMove,
  onRemove,
}: {
  step: WorkflowStep;
  index: number;
  count: number;
  active: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const action = step.kind === "action" ? actionById(step.actionId) : undefined;
  const summary =
    step.kind === "action" ? stepSummary(step.actionId, step.config) : step.condition;

  return (
    <div
      className="group flex items-center gap-2 rounded-xl border-border-default border-[0.5px] px-3 py-2.5 transition-colors"
      style={{
        background: active ? "var(--color-transparent-hover)" : "var(--color-page)",
        borderColor: active ? "var(--color-border-strong)" : undefined,
      }}
    >
      <span className="w-5 shrink-0 font-departure-mono text-[0.72rem] text-tertiary-foreground">{index + 1}</span>
      <button type="button" onClick={onSelect} className="focusable flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-body-sm text-primary-foreground">
          {step.kind === "branch" ? "If" : action?.label ?? step.actionId}
        </span>
        {summary && <span className="truncate text-[0.72rem] text-tertiary-foreground">{summary}</span>}
      </button>
      <span className="shrink-0 rounded-md bg-component px-1.5 py-0.5 font-departure-mono text-[0.65rem] text-tertiary-foreground">
        {step.kind === "branch" ? "flow" : action?.package}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={13} strokeWidth={2} />
        </IconButton>
        <IconButton label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown size={13} strokeWidth={2} />
        </IconButton>
        <IconButton label="Remove step" onClick={onRemove}>
          <Trash2 size={13} strokeWidth={2} />
        </IconButton>
      </span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="focusable flex size-6 items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
      style={{ opacity: disabled ? 0.35 : 1, pointerEvents: disabled ? "none" : "auto" }}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- flow modes */

/** What both flow presentations need: the draft, what's selected, and the ways to
 *  change the order or drop a step. */
type FlowProps = {
  draft: WorkflowDraft;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
};

/** The trigger, as the head of the flow in either presentation. */
function TriggerCard({ draft, active, onSelect, wide }: { draft: WorkflowDraft; active: boolean; onSelect: () => void; wide: boolean }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={"focusable flex items-center gap-3 rounded-xl border-border-default border-[0.5px] px-3 py-2.5 text-left transition-colors " + (wide ? "w-full" : "w-72")}
      style={{
        background: active ? "var(--color-transparent-hover)" : "var(--color-page)",
        borderColor: active ? "var(--color-border-strong)" : undefined,
      }}
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "var(--amber-a3)", color: "var(--amber-a11)" }}
      >
        <Zap size={15} strokeWidth={1.8} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-sm text-primary-foreground">{draft.trigger.kind}</span>
        <span className="truncate text-[0.72rem] text-tertiary-foreground">
          {draft.trigger.detail || TRIGGER_HINT[draft.trigger.kind]}
        </span>
      </span>
      <span className="shrink-0 font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
        Trigger
      </span>
    </button>
  );
}

function NoSteps() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border-border-default border-[0.5px] px-6 py-10 text-center">
      <WorkflowIcon size={20} strokeWidth={1.6} className="text-tertiary-foreground" />
      <span className="text-body-base font-medium text-secondary-foreground">No steps yet</span>
      <span className="max-w-xs text-body-sm text-tertiary-foreground">
        Pick an action from the palette to start the flow. Its package is added to the workflow's dependencies
        automatically.
      </span>
    </div>
  );
}

/**
 * One list of steps, which may contain branches containing further lists.
 *
 * Recursive because the flow is a tree now. Each arm is indented and labelled rather
 * than flattened with a marker, because "which branch is this step in" is the one
 * question a reader of a conditional actually has.
 */
function StepList({
  steps,
  selection,
  onSelect,
  onMove,
  onRemove,
  depth = 0,
}: {
  steps: WorkflowStep[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  depth?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex flex-col gap-2">
          <StepRow
            step={step}
            index={i}
            count={steps.length}
            active={selection.kind === "step" && selection.id === step.id}
            onSelect={() => onSelect({ kind: "step", id: step.id })}
            onMove={(direction) => onMove(step.id, direction)}
            onRemove={() => onRemove(step.id)}
          />
          {step.kind === "branch" && (
            <div className="flex flex-col gap-2 pl-4">
              {(["then", "else"] as const).map((arm) => (
                <div key={arm} className="flex flex-col gap-1.5">
                  <span className="font-departure-mono text-[0.65rem] uppercase tracking-wide text-tertiary-foreground">
                    {arm === "then" ? "then" : "otherwise"}
                  </span>
                  {step[arm].length === 0 ? (
                    <p className="rounded-lg border-border-default border-[0.5px] px-3 py-2 text-[0.72rem] text-tertiary-foreground">
                      Nothing here yet — select this branch and add a step into it.
                    </p>
                  ) : (
                    <StepList
                      steps={step[arm]}
                      selection={selection}
                      onSelect={onSelect}
                      onMove={onMove}
                      onRemove={onRemove}
                      depth={depth + 1}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {steps.length === 0 && depth === 0 && <NoSteps />}
    </div>
  );
}

/** Configuring a conditional: the expression, and what it does. */
function BranchConfig({
  step,
  onChange,
  onRemove,
}: {
  step: BranchStep;
  onChange: (condition: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-body-base font-medium text-primary-foreground">If</h3>
        <span className="text-body-sm text-tertiary-foreground">
          Runs the steps under <strong>then</strong> when this holds, and the ones under{" "}
          <strong>otherwise</strong> when it doesn't.
        </span>
      </div>
      <Field label="Condition">
        <TextInput value={step.condition} onChange={onChange} placeholder="{{ response.status }} == 200" />
      </Field>
      <span className="text-[0.72rem] text-tertiary-foreground">
        Both arms count towards what the flow needs: a headed step inside <strong>otherwise</strong>
        makes the whole workflow headed, because placement happens before anyone knows which way it
        goes.
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="focusable inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-body-sm transition-colors hover:bg-transparent-hover"
        style={{ color: "var(--tomato-a11)" }}
      >
        <Trash2 size={14} strokeWidth={1.8} />
        Remove this branch and its steps
      </button>
    </div>
  );
}

/** Steps mode: the flow as an ordered list — dense, and quickest to reorder. */
function FlowSteps({ draft, selection, onSelect, onMove, onRemove }: FlowProps) {
  return (
    <>
      <TriggerCard
        draft={draft}
        wide
        active={selection.kind === "trigger"}
        onSelect={() => onSelect({ kind: "trigger" })}
      />
      <StepList
        steps={draft.steps}
        selection={selection}
        onSelect={onSelect}
        onMove={onMove}
        onRemove={onRemove}
      />
    </>
  );
}

/** The line joining one node to the next. */
function Connector() {
  return (
    <span aria-hidden className="flex flex-col items-center" style={{ height: 22 }}>
      <span className="w-px flex-1" style={{ background: "var(--color-border-strong)" }} />
    </span>
  );
}

/** Diagram mode: the same flow as connected nodes, read top to bottom — what the
 *  workflow does at a glance, rather than a list to edit. */
function FlowDiagram({ draft, selection, onSelect, onMove, onRemove }: FlowProps) {
  return (
    <div className="flex flex-col items-center">
      <TriggerCard
        draft={draft}
        wide={false}
        active={selection.kind === "trigger"}
        onSelect={() => onSelect({ kind: "trigger" })}
      />
      {draft.steps.length === 0 ? (
        <>
          <Connector />
          <NoSteps />
        </>
      ) : (
        draft.steps.map((step, i) => {
          const action = step.kind === "action" ? actionById(step.actionId) : undefined;
          const summary = step.kind === "action" ? stepSummary(step.actionId, step.config) : step.condition;
          const active = selection.kind === "step" && selection.id === step.id;
          return (
            <div key={step.id} className="flex flex-col items-center">
              <Connector />
              <div className="group relative flex items-center">
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "step", id: step.id })}
                  className="focusable flex w-72 flex-col gap-1 rounded-xl border-border-default border-[0.5px] px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: active ? "var(--color-transparent-hover)" : "var(--color-page)",
                    borderColor: active ? "var(--color-border-strong)" : undefined,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-departure-mono text-[0.72rem] text-tertiary-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-body-sm text-primary-foreground">
                      {step.kind === "branch" ? "If" : action?.label ?? step.actionId}
                    </span>
                    <span className="shrink-0 rounded-md bg-component px-1.5 py-0.5 font-departure-mono text-[0.65rem] text-tertiary-foreground">
                      {step.kind === "branch" ? "flow" : action?.package}
                    </span>
                  </span>
                  {summary && <span className="truncate text-[0.72rem] text-tertiary-foreground">{summary}</span>}
                </button>
                <span
                  className="absolute flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                  style={{ left: "100%", marginLeft: 8 }}
                >
                  <IconButton label="Move up" disabled={i === 0} onClick={() => onMove(step.id, -1)}>
                    <ArrowUp size={13} strokeWidth={2} />
                  </IconButton>
                  <IconButton label="Move down" disabled={i === draft.steps.length - 1} onClick={() => onMove(step.id, 1)}>
                    <ArrowDown size={13} strokeWidth={2} />
                  </IconButton>
                  <IconButton label="Remove step" onClick={() => onRemove(step.id)}>
                    <Trash2 size={13} strokeWidth={2} />
                  </IconButton>
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- builder */

export function WorkflowBuilder() {
  const {
    draft,
    updateDraft,
    saveDraft,
    testRunDraft,
    closeBuilder,
    memberById,
    controls,
    viewMode,
    nodeTypes,
    isMobile,
    setInfoPaneOpen,
    folders,
    members,
  } = useStore();
  const [selection, setSelection] = useState<Selection>({ kind: "workflow" });
  // The phone's palette: a sheet, opened from the footer. See `PaletteBody`.
  const [paletteOpen, setPaletteOpen] = useState(false);

  if (!draft) return null;

  // The workspace header narrows the palette; the titlebar switcher picks the
  // flow's presentation; the info-pane toggle hides the configuration column.
  const state = controls("builder");
  const groups = paletteGroups(state, nodeTypes);
  const diagram = viewMode("builder") === "diagram";

  const problems = draftProblems(draft);
  const owner = memberById(draft.ownerId);
  const selectedStep = selection.kind === "step" ? findStep(draft.steps, selection.id) ?? null : null;
  const packages = packagesForSteps(draft.steps);
  // Node types in this flow that no runner executes yet. Not a `problem`: it doesn't
  // stop the flow being saved, and the node may well be executable by the time it runs.
  const unrunnable = unexecutableSteps(draft.steps);

  /**
   * Where a new step lands.
   *
   * If a branch is selected, into its `then` arm — because selecting a conditional and
   * then picking an action almost always means "do this when the condition holds", and
   * dropping it after the branch instead is a silent wrong answer. Otherwise, the end
   * of the top-level flow.
   */
  const addTarget = selectedStep?.kind === "branch" ? { branchId: selectedStep.id, arm: "then" as const } : null;

  /** Select something in the flow.
   *
   *  On a phone the configuration column is a bottom sheet rather than a column,
   *  so selecting has to open it: otherwise tapping a step does nothing you can
   *  see, and the one thing the builder is for — configuring a step — has no way
   *  in. Selecting the workflow itself doesn't, since its fields are the header. */
  const select = (next: Selection) => {
    setSelection(next);
    setPaletteOpen(false);
    if (isMobile && next.kind !== "workflow") setInfoPaneOpen(true);
  };

  const addStep = (actionId: string) => {
    const step = newStep(actionId, draft.steps);
    updateDraft({ steps: addStepTo(draft.steps, addTarget, step) });
    select({ kind: "step", id: step.id });
  };
  const addBranch = () => {
    const step = newBranch(draft.steps);
    updateDraft({ steps: addStepTo(draft.steps, addTarget, step) });
    select({ kind: "step", id: step.id });
  };
  const patchStep = (id: string, config: Record<string, string>) =>
    updateDraft({ steps: updateStep(draft.steps, id, (s) => (s.kind === "action" ? { ...s, config } : s)) });
  const patchCondition = (id: string, condition: string) =>
    updateDraft({ steps: updateStep(draft.steps, id, (s) => (s.kind === "branch" ? { ...s, condition } : s)) });
  const deleteStep = (id: string) => {
    updateDraft({ steps: removeStep(draft.steps, id) });
    if (selection.kind === "step" && selection.id === id) setSelection({ kind: "workflow" });
  };

  const flow: FlowProps = {
    draft,
    selection,
    onSelect: select,
    onMove: (id, direction) => updateDraft({ steps: moveStep(draft.steps, id, direction) }),
    onRemove: deleteStep,
  };
  const palette = { groups, narrowed: isNarrowed(state), onAdd: addStep, onAddBranch: addBranch };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The flow is the screen on a phone; the catalogue arrives as a sheet from
          the footer's "Add step", and the configuration column as the sheet behind
          the titlebar's info toggle. */}
      <SplitView mobile="detail">
        {isMobile ? (
          <Sheet open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Add a step">
            <PaletteBody {...palette} />
          </Sheet>
        ) : (
          <Palette {...palette} />
        )}

        <DetailPane>
          <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {/* Title — the document's own header. */}
              <input
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                onFocus={() => setSelection({ kind: "workflow" })}
                placeholder="Name this workflow"
                aria-label="Workflow name"
                className="w-full bg-transparent font-sans text-heading-4 font-medium text-primary-foreground outline-none placeholder:text-tertiary-foreground"
              />

              <div key={diagram ? "diagram" : "steps"} className="animate-in fade-in-0 duration-200 ease-out flex flex-col gap-4">
                {diagram ? <FlowDiagram {...flow} /> : <FlowSteps {...flow} />}
              </div>
            </div>
          </div>
        </DetailPane>

        <ContextPane>
          <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
            {selectedStep ? (
              <StepConfig
                key={selectedStep.id}
                step={selectedStep}
                onChange={(config) => patchStep(selectedStep.id, config)}
                onCondition={(condition) => patchCondition(selectedStep.id, condition)}
                onRemove={() => deleteStep(selectedStep.id)}
              />
            ) : selection.kind === "trigger" ? (
              <div className="flex flex-col gap-4">
                <h3 className="text-body-base font-medium text-primary-foreground">Trigger</h3>
                <Field label="Starts on">
                  <SelectInput
                    value={draft.trigger.kind}
                    onChange={(kind) => updateDraft({ trigger: { ...draft.trigger, kind: kind as RunTrigger } })}
                    options={[...RUN_TRIGGERS]}
                  />
                </Field>
                <Field label={TRIGGER_HINT[draft.trigger.kind]}>
                  <TextInput
                    value={draft.trigger.detail}
                    onChange={(detail) => updateDraft({ trigger: { ...draft.trigger, detail } })}
                    placeholder={TRIGGER_HINT[draft.trigger.kind]}
                  />
                </Field>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <h3 className="text-body-base font-medium text-primary-foreground">Workflow</h3>
                <Field label="Description">
                  <textarea
                    value={draft.description}
                    onChange={(e) => updateDraft({ description: e.target.value })}
                    rows={3}
                    placeholder="What does this workflow do?"
                    className={inputClass + " resize-none"}
                  />
                </Field>
                <Field label="Folder">
                  <SelectInput
                    value={draft.folderId}
                    onChange={(folderId) => {
                      const folder = folders.find((f) => f.id === folderId);
                      updateDraft({ folderId, visibility: (folder?.visibility ?? draft.visibility) as Visibility });
                    }}
                    options={folders.map((f) => ({ id: f.id, label: folderPath(f.id, folders) }))}
                  />
                </Field>
                <Field label="Owner">
                  <SelectInput
                    value={draft.ownerId}
                    onChange={(ownerId) => updateDraft({ ownerId })}
                    options={members.map((m) => ({ id: m.id, label: m.name }))}
                  />
                </Field>
                <div className="flex items-center gap-2 text-body-sm text-secondary-foreground">
                  {owner && <Avatar member={owner} size={18} />}
                  {owner?.name} · {draft.visibility === "public" ? "Public" : "Private"}
                </div>

                <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

                <div className="flex flex-col gap-2">
                  <span className="text-[0.72rem] text-tertiary-foreground">
                    Dependencies (from the steps you've added)
                  </span>
                  {packages.length === 0 ? (
                    <span className="text-body-sm text-tertiary-foreground">None yet.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {packages.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-component px-2.5 py-1 font-departure-mono text-[0.72rem] text-secondary-foreground"
                        >
                          <Package size={13} strokeWidth={1.8} className="text-tertiary-foreground" />
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ContextPane>
      </SplitView>

      {/* --------------------------------------------------------------- footer */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-border-default border-t-[0.5px] px-4 py-2.5">
        <span className="text-body-sm text-tertiary-foreground">
          {problems.length > 0
            ? problems[0]
            : `${draft.steps.length} step${draft.steps.length === 1 ? "" : "s"} · ${packages.length} package${packages.length === 1 ? "" : "s"}`}
        </span>
        {/* Said before the run, not after: a test run reaching one of these stops
            there, and finding that out from a failed run is a worse way to learn it. */}
        {problems.length === 0 && unrunnable.length > 0 && (
          <span className="text-body-sm" style={{ color: "var(--amber-a11)" }}>
            {unrunnable.join(", ")} {unrunnable.length === 1 ? "has" : "have"} no runner — a test run stops there
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* The phone's way into the catalogue. Cancel goes with it: the titlebar
              breadcrumb already leads back to the library, and three buttons plus a
              fourth do not fit across 390px. */}
          {isMobile ? (
            <Button variant="outlined" onClick={() => setPaletteOpen(true)}>
              <Plus size={14} strokeWidth={2} />
              Add step
            </Button>
          ) : (
            <Button variant="ghost" onClick={closeBuilder}>
              Cancel
            </Button>
          )}
          <Button
            variant="outlined"
            onClick={testRunDraft}
            disabled={problems.length > 0}
            style={{ opacity: problems.length > 0 ? 0.5 : 1, pointerEvents: problems.length > 0 ? "none" : "auto" }}
          >
            <Play size={14} strokeWidth={2} />
            Test run
          </Button>
          <Button
            variant="solid"
            onClick={saveDraft}
            disabled={problems.length > 0}
            style={{
              background: "var(--color-brand-solid)",
              color: "#fff",
              opacity: problems.length > 0 ? 0.5 : 1,
              pointerEvents: problems.length > 0 ? "none" : "auto",
            }}
          >
            {draft.isNew ? "Create workflow" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Right pane: the selected step's fields. */
function StepConfig({
  step,
  onChange,
  onCondition,
  onRemove,
}: {
  step: WorkflowStep;
  onChange: (config: Record<string, string>) => void;
  onCondition: (condition: string) => void;
  onRemove: () => void;
}) {
  if (step.kind === "branch") return <BranchConfig step={step} onChange={onCondition} onRemove={onRemove} />;

  const action = actionById(step.actionId);
  if (!action) return <p className="text-body-sm text-tertiary-foreground">Unknown action “{step.actionId}”.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-body-base font-medium text-primary-foreground">{action.label}</h3>
        <span className="text-body-sm text-tertiary-foreground">{action.summary}</span>
        {action.readiness === "roadmap" && (
          <span className="text-body-sm" style={{ color: "var(--amber-a11)" }}>
            This node type is declared but not yet executable. It's here to show the interface holds
            an AI step without reshaping the runtime or the canvas.
          </span>
        )}
        {action.readiness !== "roadmap" && !isExecutable(action.id) && (
          <span className="text-body-sm" style={{ color: "var(--amber-a11)" }}>
            No runner executes this node type yet. Stage 1 runs the headless, API-first set — HTTP
            calls, assertions, values, conditionals — so a run reaching this step stops there and
            says so, rather than skipping it.
          </span>
        )}
        <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-component px-1.5 py-0.5 font-departure-mono text-[0.65rem] text-tertiary-foreground">
          <Package size={12} strokeWidth={1.8} />
          {action.package}
        </span>
      </div>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      {action.fields.map((field) => (
        <Field key={field.id} label={field.label}>
          <ActionInput
            field={field}
            value={step.config[field.id] ?? ""}
            onChange={(value) => onChange({ ...step.config, [field.id]: value })}
          />
        </Field>
      ))}

      <button
        type="button"
        onClick={onRemove}
        className="focusable inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-body-sm transition-colors hover:bg-transparent-hover"
        style={{ color: "var(--tomato-11)" }}
      >
        <Trash2 size={14} strokeWidth={1.8} />
        Remove step
      </button>
    </div>
  );
}
