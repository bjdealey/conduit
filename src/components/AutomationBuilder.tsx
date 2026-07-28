import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Package, Play, Plus, Trash2, Workflow, Zap } from "lucide-react";
import { useStore } from "../store";
import { folders as allFolders } from "../data/automations";
import { members } from "../data/issues";
import { actionById, actionsByPackage, packagesForSteps, stepSummary, type ActionField } from "../data/actions";
import { RUN_TRIGGERS, type AutomationStep, type RunTrigger, type Visibility } from "../data/types";
import { draftProblems, moveStep, newStep } from "../lib/builder";
import { Pane, PANE_WIDTH } from "./layout/SplitView";
import { Avatar } from "./Avatar";

/* =============================================================================
   The automation builder
   -----------------------------------------------------------------------------
   Where automations are actually made: a palette of actions on the left, the
   flow in the middle, and the configuration of whatever is selected on the right.
   It takes over the workspace (like Settings) rather than living in a pane,
   because authoring wants the room.

   The flow is the document: its title, its trigger, and its ordered steps are all
   selectable, and whatever is selected is configured in the right-hand pane.
   Nothing is written to the library until Save — see `lib/builder.ts` for what
   committing a draft does.
   ============================================================================= */

/** What the right-hand pane is configuring. */
type Selection = { kind: "automation" } | { kind: "trigger" } | { kind: "step"; id: string };

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
function folderPath(folderId: string): string {
  const names: string[] = [];
  let cur = allFolders.find((f) => f.id === folderId);
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? allFolders.find((f) => f.id === cur!.parentId) : undefined;
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

/** Left column: the actions a flow can be built from, grouped by the package
 *  that provides them. Clicking one appends it to the flow and selects it. */
function Palette({ onAdd }: { onAdd: (actionId: string) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = actionsByPackage()
    .map((g) => ({
      ...g,
      actions: g.actions.filter(
        (a) => !q || a.label.toLowerCase().includes(q) || a.package.includes(q) || a.summary.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.actions.length > 0);

  return (
    <Pane width={PANE_WIDTH.list}>
      <div className="flex items-center gap-2 border-border-default border-b-[0.5px] px-3 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions…"
          className="min-w-0 flex-1 rounded-lg bg-component px-2.5 py-1.5 text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground"
        />
      </div>

      <div className="scrollbar-none flex-1 overflow-y-auto px-2 py-2">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-body-sm text-tertiary-foreground">No actions match “{query}”.</p>
        )}
        {groups.map((group) => (
          <section key={group.package} className="mb-2">
            <header className="flex items-center gap-2 px-3 py-2">
              <Package size={13} strokeWidth={1.8} className="text-tertiary-foreground" />
              <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{group.package}</span>
            </header>
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
                    <Plus size={13} strokeWidth={2} className="shrink-0 text-tertiary-foreground" />
                  </span>
                  <span className="text-[0.72rem] leading-tight text-tertiary-foreground">{action.summary}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
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
  step: AutomationStep;
  index: number;
  count: number;
  active: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const action = actionById(step.actionId);
  const summary = stepSummary(step.actionId, step.config);

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
        <span className="truncate text-body-sm text-primary-foreground">{action?.label ?? step.actionId}</span>
        {summary && <span className="truncate text-[0.72rem] text-tertiary-foreground">{summary}</span>}
      </button>
      <span className="shrink-0 rounded-md bg-component px-1.5 py-0.5 font-departure-mono text-[0.65rem] text-tertiary-foreground">
        {action?.package}
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

/* ------------------------------------------------------------------- builder */

export function AutomationBuilder() {
  const { draft, updateDraft, saveDraft, testRunDraft, closeBuilder, memberById } = useStore();
  const [selection, setSelection] = useState<Selection>({ kind: "automation" });

  if (!draft) return null;

  const problems = draftProblems(draft);
  const owner = memberById(draft.ownerId);
  const selectedStep = selection.kind === "step" ? draft.steps.find((s) => s.id === selection.id) ?? null : null;
  const packages = packagesForSteps(draft.steps);

  const addStep = (actionId: string) => {
    const step = newStep(actionId, draft.steps);
    updateDraft({ steps: [...draft.steps, step] });
    setSelection({ kind: "step", id: step.id });
  };
  const patchStep = (id: string, config: Record<string, string>) =>
    updateDraft({ steps: draft.steps.map((s) => (s.id === id ? { ...s, config } : s)) });
  const removeStep = (id: string) => {
    updateDraft({ steps: draft.steps.filter((s) => s.id !== id) });
    if (selection.kind === "step" && selection.id === id) setSelection({ kind: "automation" });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1">
        <Palette onAdd={addStep} />

        {/* ------------------------------------------------------------ flow */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {/* Title — the document's own header. */}
              <input
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                onFocus={() => setSelection({ kind: "automation" })}
                placeholder="Name this automation"
                aria-label="Automation name"
                className="w-full bg-transparent font-sans text-heading-4 font-medium text-primary-foreground outline-none placeholder:text-tertiary-foreground"
              />

              {/* Trigger — what starts the flow. */}
              <button
                type="button"
                onClick={() => setSelection({ kind: "trigger" })}
                className="focusable flex items-center gap-3 rounded-xl border-border-default border-[0.5px] px-3 py-2.5 text-left transition-colors"
                style={{
                  background: selection.kind === "trigger" ? "var(--color-transparent-hover)" : "var(--color-page)",
                  borderColor: selection.kind === "trigger" ? "var(--color-border-strong)" : undefined,
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

              {/* Steps */}
              <div className="flex flex-col gap-2">
                {draft.steps.map((step, i) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    index={i}
                    count={draft.steps.length}
                    active={selection.kind === "step" && selection.id === step.id}
                    onSelect={() => setSelection({ kind: "step", id: step.id })}
                    onMove={(direction) => updateDraft({ steps: moveStep(draft.steps, step.id, direction) })}
                    onRemove={() => removeStep(step.id)}
                  />
                ))}

                {draft.steps.length === 0 && (
                  <div className="flex flex-col items-center gap-2 rounded-xl border-border-default border-[0.5px] px-6 py-10 text-center">
                    <Workflow size={20} strokeWidth={1.6} className="text-tertiary-foreground" />
                    <span className="text-body-base font-medium text-secondary-foreground">No steps yet</span>
                    <span className="max-w-xs text-body-sm text-tertiary-foreground">
                      Pick an action from the palette to start the flow. Its package is added to the automation's
                      dependencies automatically.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------- config */}
        <div
          className="flex shrink-0 flex-col"
          style={{ width: PANE_WIDTH.context, borderLeft: "0.5px solid var(--color-border-default)" }}
        >
          <div className="scrollbar-none flex-1 overflow-y-auto px-5 py-5">
            {selectedStep ? (
              <StepConfig
                key={selectedStep.id}
                step={selectedStep}
                onChange={(config) => patchStep(selectedStep.id, config)}
                onRemove={() => removeStep(selectedStep.id)}
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
                <h3 className="text-body-base font-medium text-primary-foreground">Automation</h3>
                <Field label="Description">
                  <textarea
                    value={draft.description}
                    onChange={(e) => updateDraft({ description: e.target.value })}
                    rows={3}
                    placeholder="What does this automation do?"
                    className={inputClass + " resize-none"}
                  />
                </Field>
                <Field label="Folder">
                  <SelectInput
                    value={draft.folderId}
                    onChange={(folderId) => {
                      const folder = allFolders.find((f) => f.id === folderId);
                      updateDraft({ folderId, visibility: (folder?.visibility ?? draft.visibility) as Visibility });
                    }}
                    options={allFolders.map((f) => ({ id: f.id, label: folderPath(f.id) }))}
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
        </div>
      </div>

      {/* --------------------------------------------------------------- footer */}
      <div className="flex shrink-0 items-center gap-3 border-border-default border-t-[0.5px] px-4 py-2.5">
        <span className="text-body-sm text-tertiary-foreground">
          {problems.length > 0 ? problems[0] : `${draft.steps.length} step${draft.steps.length === 1 ? "" : "s"} · ${packages.length} package${packages.length === 1 ? "" : "s"}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={closeBuilder}
            className="focusable rounded-lg px-2.5 py-1.5 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={testRunDraft}
            disabled={problems.length > 0}
            className="pressable focusable inline-flex items-center gap-1.5 rounded-lg border-border-default border-[0.5px] px-2.5 py-1.5 text-body-sm text-secondary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
            style={{ opacity: problems.length > 0 ? 0.5 : 1, pointerEvents: problems.length > 0 ? "none" : "auto" }}
          >
            <Play size={14} strokeWidth={2} />
            Test run
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={problems.length > 0}
            className="pressable focusable inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm font-medium"
            style={{
              background: "var(--color-brand-solid)",
              color: "#fff",
              opacity: problems.length > 0 ? 0.5 : 1,
              pointerEvents: problems.length > 0 ? "none" : "auto",
            }}
          >
            {draft.isNew ? "Create automation" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Right pane: the selected step's fields. */
function StepConfig({
  step,
  onChange,
  onRemove,
}: {
  step: AutomationStep;
  onChange: (config: Record<string, string>) => void;
  onRemove: () => void;
}) {
  const action = actionById(step.actionId);
  if (!action) return <p className="text-body-sm text-tertiary-foreground">Unknown action “{step.actionId}”.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-body-base font-medium text-primary-foreground">{action.label}</h3>
        <span className="text-body-sm text-tertiary-foreground">{action.summary}</span>
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
